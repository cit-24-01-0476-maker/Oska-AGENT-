import {spawn, type ChildProcess} from 'node:child_process';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {StringDecoder} from 'node:string_decoder';
import {AppError,type ProviderHealth,type StreamEvent} from '../contracts';
import {redact} from '../security';
import {NdjsonParser,parseModels,providerFailure} from './protocol';
import type {AIProvider,ExecutionOptions,ProviderResult} from './types';
export const blockedTools=['command(*)','mcp(*)','read_url(*)','execute_url(*)','read_file(*)','write_file(*)'];
export const sessionSafeguards={useG1Credits:false,toolPermission:'strict',allowNonWorkspaceAccess:false,enableTerminalSandbox:true,permissions:{allow:[],ask:[],deny:blockedTools}};
const verification=globalThis as unknown as {oskaLastInference?:number};
export async function readSafety(){
  try{
    let config:Record<string,unknown>={};
    try{config=JSON.parse((await readFile(path.join(os.homedir(),'.gemini','antigravity-cli','settings.json'),'utf8')).replace(/^\uFEFF/,''));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(config.modelProvider)return {safe:false,useSession:false,message:'An alternate API provider is configured. Use official Google account authentication before connecting OSKA.'};
    // Official CLI 1.4.10 exposes session-only --settings overrides. They avoid
    // changing the user's interactive CLI configuration or enabling paid fallback.
    const help=await probe(['--help']);
    if(/--settings\s/.test(help))return {safe:true,useSession:true,message:'Existing Google AI account available. OSKA disables paid credit fallback and CLI tools for each request using session-only settings.'};
    const permissions=config.permissions as {deny?:unknown}|undefined;
    const denied=permissions?.deny;
    const safe=config.useG1Credits===false && !config.modelProvider && config.toolPermission==='strict' && config.allowNonWorkspaceAccess!==true && Array.isArray(denied)&&blockedTools.every(r=>denied.includes(r));
    return {safe,useSession:false,message:safe?'Credit fallback disabled; CLI tools denied.':'This CLI needs global safeguards. Update the official CLI or review scripts/configure-antigravity.ps1.'};
  }catch{return {safe:false,useSession:false,message:'Could not verify CLI safety controls. Check the official CLI installation and retry.'};}
}
export async function executable(){
  const custom=process.env.AGY_EXECUTABLE;
  if(custom){if(!path.isAbsolute(custom)||process.platform==='win32'&&!custom.toLowerCase().endsWith('.exe'))throw new AppError('EXECUTABLE','AGY_EXECUTABLE must be an absolute native executable path.',503);await access(custom);return custom;}
  const directories=(process.env.PATH??'').split(path.delimiter).filter(Boolean);
  if(process.platform==='win32'&&process.env.LOCALAPPDATA)directories.unshift(path.join(process.env.LOCALAPPDATA,'agy','bin'));
  for(const dir of directories){const candidate=path.join(dir,process.platform==='win32'?'agy.exe':'agy');try{await access(candidate);return candidate;}catch{}}
  throw providerFailure('ENOENT agy');
}
export function environment(){
  const env:NodeJS.ProcessEnv={...process.env,NO_COLOR:'1'};
  // Never inherit alternate API billing or endpoint routing from the web server environment.
  for(const key of Object.keys(env))if(/API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_PROJECT|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_GEMINI_BASE_URL|AGY_ADC_AUTH|ANTHROPIC_BASE_URL|OPENAI_BASE_URL/i.test(key))delete env[key];
  return env;
}
async function probe(args:string[]){
  const bin=await executable();return new Promise<string>((resolve,reject)=>{
    const child=spawn(/*turbopackIgnore: true*/ bin,args,{shell:false,windowsHide:true,env:environment(),stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
    const timer=setTimeout(()=>{child.kill();reject(new AppError('CLI_TIMEOUT','CLI did not respond in 20 seconds.',504));},20000);
    child.stdout.on('data',data=>{stdout+=data.toString();if(stdout.length>2_000_000){child.kill();reject(new AppError('CLI_OUTPUT','CLI output exceeds the limit.'));}});
    child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-8000);});
    child.on('error',error=>{clearTimeout(timer);reject(providerFailure(error.message));});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(providerFailure(redact(stderr)));else resolve(args[0]==='--help'?stdout+'\n'+stderr:stdout);});
  });
}
const processes=new Map<string,ChildProcess>();
export class AntigravityProvider implements AIProvider {
  id='antigravity';displayName='Google Antigravity';
  async connect(){return {command:'agy',instructions:'Open PowerShell on this computer, run agy, and complete Google account sign-in in the official browser flow. Then refresh models here. OSKA never receives your credentials.'};}
  async disconnect(){await Promise.all([...processes.keys()].map(id=>this.cancel(id)));}
  async listModels(){return parseModels(await probe(['models']));}
  async checkHealth():Promise<ProviderHealth>{
    let version:string|undefined;const safety=await readSafety();
    try{version=(await probe(['--version'])).trim().slice(0,120);const models=await this.listModels();const verified=Date.now()-(verification.oskaLastInference??0)<900000;return {status:safety.safe?(verified?'connected':'catalog_available'):'safety_required',installed:true,version,message:verified&&safety.safe?'Existing Google AI account connected. A real model request succeeded.':safety.message,models,costSafe:safety.safe,authVerified:verified};}
    catch(error){const failure=error instanceof AppError?error:providerFailure(String(error));return {status:failure.code.toLowerCase(),installed:failure.code!=='CLI_MISSING',version,message:failure.message,models:[],costSafe:safety.safe,authVerified:false};}
  }
  async execute(options:ExecutionOptions){return this.stream(options);}
  async stream(options:ExecutionOptions):Promise<ProviderResult>{
    const safety=await readSafety();if(!safety.safe)throw new AppError('COST_SAFETY',safety.message,409);
    const catalog=await this.listModels();if(!catalog.some(m=>m.id===options.modelId&&m.available))throw new AppError('MODEL_UNAVAILABLE','Selected model is no longer available. Refresh the catalog.',409);
    if(options.signal.aborted)throw new AppError('CANCELED','Task canceled.',409);
    const bin=await executable();
    const args=['-p',options.prompt,'--output-format','stream-json','--model',options.modelId,'--mode','plan','--disable-slash-commands','--sandbox','--print-timeout','5m'];
    if(safety.useSession)args.push('--settings',JSON.stringify(sessionSafeguards));
    if(options.conversationId)args.push('--conversation',options.conversationId);
    return new Promise((resolve,reject)=>{
      const child=spawn(/*turbopackIgnore: true*/ bin,args,{cwd:options.cwd,shell:false,windowsHide:true,env:environment(),stdio:['ignore','pipe','pipe']});processes.set(options.taskId,child);
      const parser=new NdjsonParser(),decoder=new StringDecoder('utf8');let stderr='',result:ProviderResult|undefined,chain=Promise.resolve();let failed=false;let bytes=0;
      const abort=()=>{child.kill();};options.signal.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>{failed=true;child.kill();reject(new AppError('CLI_TIMEOUT','Execution exceeded six minutes.',504));},360000);
      const consume=async(event:StreamEvent)=>{
        await options.onEvent(event);
        if(event.event==='result'){
          const r=event.result as Record<string,unknown>;
          if(r?.status!=='SUCCESS')throw providerFailure(String(r?.error??r?.status??'CLI returned no status.'));
          result={response:String(r.response??''),conversationId:typeof r.conversation_id==='string'?r.conversation_id:undefined,tokens:typeof (r.usage as Record<string,unknown>)?.total_tokens==='number'?(r.usage as {total_tokens:number}).total_tokens:undefined};
        }
      };
      child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;chain=chain.then(async()=>{if(bytes>8_000_000)throw new AppError('OUTPUT_LIMIT','CLI output limit reached.');for(const event of parser.push(decoder.write(chunk)))await consume(event);}).catch(error=>{failed=true;child.kill();reject(error);});});
      child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-8000);});
      child.on('error',error=>{failed=true;reject(providerFailure(error.message));});
      child.on('close',()=>{clearTimeout(timer);processes.delete(options.taskId);options.signal.removeEventListener('abort',abort);void chain.then(async()=>{if(failed)return;if(options.signal.aborted)throw new AppError('CANCELED','Task canceled.',409);for(const event of parser.push(decoder.end()))await consume(event);for(const event of parser.finish())await consume(event);if(!result)throw providerFailure(redact(stderr)||'CLI exited without a result.');verification.oskaLastInference=Date.now();resolve(result);}).catch(reject);});
    });
  }
  async cancel(taskId:string){const child=processes.get(taskId);if(child){child.kill();processes.delete(taskId);}}
}
export const antigravity=new AntigravityProvider();
