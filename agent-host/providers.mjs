import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {Rpc} from './rpc.mjs';
import {callbackFor,googleFlow} from './security.mjs';

export function providerEnvironment(home){
  // Do not pass broker credentials, website sessions, API keys or the operator's CLI homes.
  return {PATH:'/usr/local/bin:/usr/bin:/bin',HOME:home,CODEX_HOME:join(home,'.codex'),GEMINI_HOME:join(home,'.antigravity'),AGY_ACP_FORCE_FILE_STORAGE:'1',ANTIGRAVITY_HARNESS_PATH:'/opt/antigravity/localharness_external',BROWSER:'/app/no-browser.sh',PYTHONUNBUFFERED:'1',NO_COLOR:'1',TMPDIR:'/tmp'};
}
export function acpModels(session){
  const modelOption=session.configOptions?.find(option=>option.category==='model'||option.id==='model');
  function flatten(options=[]){return options.flatMap(option=>Array.isArray(option.options)?flatten(option.options):typeof option.value==='string'?[{id:option.value,name:option.name||option.value}]:[]);}
  const models=flatten(modelOption?.options);return {models,configId:modelOption?.id};
}
export class Providers{
  constructor(home='/data'){this.home=home;this.clients=new Map();this.flows=new Map();this.initializing=new Map();}
  async client(provider){
    if(!['antigravity','codex'].includes(provider))throw new Error('Unknown provider.');
    const current=this.clients.get(provider);if(current&&!current.closed)return current;
    if(this.initializing.has(provider))return this.initializing.get(provider);
    const pending=this.open(provider).finally(()=>this.initializing.delete(provider));this.initializing.set(provider,pending);return pending;
  }
  async open(provider){
    const home=join(this.home,provider);await mkdir(home,{recursive:true,mode:0o700});
    await Promise.all(['workspace','.codex','.antigravity'].map(directory=>mkdir(join(home,directory),{recursive:true,mode:0o700})));
    const rpc=new Rpc(provider==='codex'?'/usr/local/bin/codex':'/opt/antigravity/agy_acp_server.par',provider==='codex'?['app-server']:['--uid='],{cwd:join(home,'workspace'),env:providerEnvironment(home)});
    this.clients.set(provider,rpc);
    try{
      if(provider==='codex'){rpc.initialized=await rpc.request('initialize',{clientInfo:{name:'oska_agent',version:'0.1.0'},capabilities:{}});rpc.notify('initialized');}
      else rpc.initialized=await rpc.request('initialize',{protocolVersion:1,clientInfo:{name:'oska_agent',version:'0.1.0'},clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false}});
      return rpc;
    }catch(error){rpc.close();throw error;}
  }
  async login(provider,job){
    const rpc=await this.client(provider);
    if(provider==='codex'){
      let cleanup;
      const completed=new Promise((resolve,reject)=>{
        const onEvent=event=>{if(event.method==='account/login/completed'&&event.params.loginId===job.loginId){cleanup();if(event.params.success)resolve();else reject(new Error('Codex sign-in failed.'));}};
        const timer=setTimeout(()=>{cleanup();reject(new Error('Codex sign-in expired.'));},300000);
        cleanup=()=>{clearTimeout(timer);rpc.off('notification',onEvent);};rpc.on('notification',onEvent);
      });
      completed.catch(()=>{});
      try{
        const result=await rpc.request('account/login/start',{type:'chatgptDeviceCode'});
        const url=new URL(result.verificationUrl);if(url.origin!=='https://auth.openai.com'||url.pathname!=='/codex/device')throw new Error('Unexpected Codex sign-in address.');
        job.loginId=result.loginId;job.result={authorizationUrl:result.verificationUrl,userCode:result.userCode};job.status='waiting';await completed;job.result={connected:true};
      }finally{cleanup();}
    }else{
      const onLine=line=>{const prefix='Open the following link to authenticate the ACP server: ';if(line.startsWith(prefix)){try{const flow=googleFlow(line.slice(prefix.length).trim());this.flows.set(job.id,flow);job.result={authorizationUrl:flow.url,callbackRequired:true};job.status='waiting';}catch{job.error='Google returned an unexpected sign-in URL.';}}};
      rpc.on('diagnostic',onLine);
      try{await rpc.request('authenticate',{methodId:'oauth-personal'},300000);job.result={connected:true};}
      finally{rpc.off('diagnostic',onLine);this.flows.delete(job.id);}
    }
  }
  async complete(jobId,raw){
    const flow=this.flows.get(jobId);if(!flow)throw new Error('Google sign-in expired. Start again.');
    const url=callbackFor(flow,raw);
    // Exact in-progress native loopback listener only. Never follow a returned redirect.
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(response.status>=400)throw new Error('The native login callback was rejected.');
    this.flows.delete(jobId);return {received:true};
  }
  async models(provider){
    const rpc=await this.client(provider);
    if(provider==='codex'){
      const account=await rpc.request('account/read',{refreshToken:false});
      if(account.account?.type!=='chatgpt')throw new Error('Sign in with your Codex/ChatGPT account first.');
      const models=[];let cursor=null;
      do{const result=await rpc.request('model/list',{limit:100,cursor,includeHidden:false});models.push(...result.data.map(model=>({id:model.model||model.id,name:model.displayName||model.id})));cursor=result.nextCursor;}while(cursor&&models.length<500);
      if(!models.length)throw new Error('The account returned no models.');return {models};
    }
    // Never initiate hidden OAuth as part of discovery; an expired session requires an explicit login.
    if(this.flows.size)throw new Error('Finish the active Google sign-in first.');
    const session=await rpc.request('session/new',{cwd:join(this.home,provider,'workspace'),mcpServers:[]});
    const catalog=acpModels(session);if(!catalog.models.length)throw new Error('Sign in first, or the account returned no model catalog.');
    return {models:catalog.models};
  }
  async run(provider,model,prompt){
    const {models}=await this.models(provider);if(!models.some(entry=>entry.id===model))throw new Error('Model is not in this account catalog.');
    const rpc=await this.client(provider);let output='';
    if(provider==='antigravity'){
      const session=await rpc.request('session/new',{cwd:join(this.home,provider,'workspace'),mcpServers:[]});const catalog=acpModels(session);
      if(!catalog.configId)throw new Error('Model selection is unavailable in this runtime.');
      await rpc.request('session/set_config_option',{sessionId:session.sessionId,configId:catalog.configId,value:model});
      const onEvent=event=>{const update=event.params?.update;if(event.method==='session/update'&&event.params.sessionId===session.sessionId&&update?.sessionUpdate==='agent_message_chunk'&&update.content?.type==='text'){output+=update.content.text;if(output.length>1000000)rpc.close();}};
      rpc.on('notification',onEvent);
      try{const result=await rpc.request('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:prompt}]},300000);if(result.stopReason!=='end_turn')throw new Error('Agent did not finish the turn.');}
      finally{rpc.off('notification',onEvent);}
    }else{
      const thread=await rpc.request('thread/start',{model,cwd:join(this.home,provider,'workspace'),approvalPolicy:'never',sandbox:'read-only',ephemeral:true});
      let cleanup;
      const done=new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{cleanup();reject(new Error('Model response timed out.'));},300000);
        const onEvent=event=>{if(event.params?.threadId!==thread.thread.id)return;if(event.method==='item/agentMessage/delta')output+=event.params.delta||'';if(output.length>1000000){cleanup();rpc.close();reject(new Error('Model response too large.'));}if(event.method==='turn/completed'){cleanup();if(event.params.turn.status==='completed')resolve();else reject(new Error('Codex turn failed or was interrupted.'));}};
        cleanup=()=>{clearTimeout(timer);rpc.off('notification',onEvent);};rpc.on('notification',onEvent);
      });done.catch(()=>{});
      try{await rpc.request('turn/start',{threadId:thread.thread.id,input:[{type:'text',text:prompt,text_elements:[]}]});await done;}finally{cleanup();}
    }
    if(!output.trim())throw new Error('The model returned no text.');return {response:output};
  }
  close(){for(const rpc of this.clients.values())rpc.close();}
}
