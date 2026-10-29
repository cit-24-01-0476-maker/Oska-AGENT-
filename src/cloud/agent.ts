import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {AppError} from '@/lib/contracts';
import type {CloudProfile} from './contracts';
import {signature,tenantId} from '../../agent-host/security.mjs';
import {listTeams} from './repository';

const provider=z.enum(['antigravity','codex']);
const jobSchema=z.discriminatedUnion('action',[
  z.object({action:z.enum(['login','models']),provider}).strict(),
  z.object({action:z.literal('run'),provider,model:z.string().min(1).max(150),prompt:z.string().trim().min(1).max(24000)}).strict(),
  z.object({action:z.literal('team'),teamId:z.uuid(),prompt:z.string().trim().min(1).max(24000)}).strict(),
]);
export function agentConfigured(){return !!process.env.OSKA_AGENT_ORIGIN&&!!process.env.OSKA_AGENT_SECRET&&process.env.OSKA_AGENT_SECRET.length>=48;}
async function callAgent(user:CloudProfile,path:string,method:string,input?:unknown){
  if(!agentConfigured())throw new AppError('AGENT_HOST_REQUIRED','The operator must connect the persistent agent server before provider login or execution.',503);
  const raw=process.env.OSKA_AGENT_ORIGIN!,url=new URL(raw);
  if(url.origin!==raw||url.protocol!=='https:'||url.username||url.password)throw new AppError('AGENT_CONFIG','Agent server must use an exact HTTPS origin.',503);
  const body=input===undefined?'':JSON.stringify(input),time=Date.now().toString(),nonce=randomUUID(),tenant=tenantId(user.sub);
  const signed=signature(process.env.OSKA_AGENT_SECRET!,{time,nonce,tenant,method,path,body});
  let response:Response;
  try{response=await fetch(raw+path,{method,headers:{'Content-Type':'application/json','x-oska-time':time,'x-oska-nonce':nonce,'x-oska-tenant':tenant,'x-oska-signature':signed},body:method==='GET'?undefined:body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000)});}catch{throw new AppError('AGENT_UNAVAILABLE','Agent server is unreachable. Check hosting and retry.',503);}
  if(!response.headers.get('content-type')?.includes('application/json'))throw new AppError('AGENT_PROTOCOL','Agent server returned an invalid response.',502);
  const source=await response.text();if(source.length>2000000)throw new AppError('AGENT_PROTOCOL','Agent response too large.',502);
  const result=JSON.parse(source);
  if(!response.ok)throw new AppError('AGENT_REQUEST',typeof result.error==='string'?result.error:'Agent operation failed.',response.status);
  return result;
}
export async function agentRequest(user:CloudProfile,path:string[],method:string,input?:unknown){
  if(path[0]==='status'&&method==='GET')return {configured:agentConfigured(),mode:'isolated-agent-server',textOnly:true};
  if(path[0]==='jobs'&&path[1]&&method==='GET')return callAgent(user,'/jobs/'+z.uuid().parse(path[1]),'GET');
  if(path[0]==='complete'&&method==='POST')return callAgent(user,'/complete','POST',z.object({jobId:z.uuid(),callbackUrl:z.string().max(16384)}).strict().parse(input));
  if(path[0]==='jobs'&&!path[1]&&method==='POST'){
    const data=jobSchema.parse(input);
    if(data.action==='team'){
      const teams=await listTeams(user),team=teams.find(t=>t.id===data.teamId);
      if(!team)throw new AppError('NOT_FOUND','Team not found.',404);
      const members=(team.members as {provider:string;modelId:string|null;name:string;role:string}[]).map(m=>({...m,provider:m.provider==='chatgpt'?'codex':m.provider}));
      if(members.some(m=>!m.modelId))throw new AppError('MODELS_REQUIRED','Assign a discovered model ID to every team role before running.',409);
      return callAgent(user,'/jobs','POST',{action:'team',prompt:data.prompt,objective:team.objective,members});
    }
    return callAgent(user,'/jobs','POST',data);
  }
  throw new AppError('NOT_FOUND','Agent endpoint not found.',404);
}
