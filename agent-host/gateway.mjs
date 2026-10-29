import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHmac} from 'node:crypto';
import {verifyRequest} from './security.mjs';
import {readBody,json} from './http.mjs';
const execute=promisify(execFile);
export function workerSpec(tenant,image,token){
  if(!/^[a-f0-9]{64}$/.test(tenant)||!/^[-a-zA-Z0-9._/:]+$/.test(image))throw new Error('Invalid worker configuration.');
  const name='oska-'+tenant;
  return {name,args:['run','--detach','--name',name,'--label','oska.tenant='+tenant,'--restart','unless-stopped','--init','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','3g','--cpus','1.5','--pids-limit','256','--tmpfs','/tmp:rw,nosuid,nodev,size=1536m','--mount',`type=volume,source=${name}-data,target=/data`,'--publish','127.0.0.1::8788','--env','OSKA_WORKER_TOKEN='+token,image]};
}
export class DockerFleet{
  constructor({secret,image='oska-worker:1',maxWorkers=5}){if(!Number.isInteger(maxWorkers)||maxWorkers<1||maxWorkers>100)throw new Error('Set an integer worker capacity between 1 and 100.');this.secret=secret;this.image=image;this.maxWorkers=maxWorkers;this.pending=new Map();}
  async docker(args){return (await execute('docker',args,{timeout:120000,maxBuffer:1024*1024})).stdout;}
  async ensure(tenant){
    if(this.pending.has(tenant))return this.pending.get(tenant);
    const pending=this.start(tenant).finally(()=>this.pending.delete(tenant));this.pending.set(tenant,pending);return pending;
  }
  async start(tenant){
    const token=createHmac('sha256',this.secret).update('worker:'+tenant).digest('hex'),spec=workerSpec(tenant,this.image,token);
    let inspect;
    try{inspect=JSON.parse(await this.docker(['inspect',spec.name]))[0];}catch{
      // Capacity checking is serialized by the gateway around provisioning.
      const existing=(await this.docker(['ps','-a','--filter','label=oska.tenant','--format','{{.ID}}'])).trim().split('\n').filter(Boolean);
      if(existing.length>=this.maxWorkers)throw new Error('Agent server capacity reached.');
      await this.docker(spec.args);inspect=JSON.parse(await this.docker(['inspect',spec.name]))[0];
    }
    if(inspect.Config.Labels?.['oska.tenant']!==tenant)throw new Error('Worker identity does not match.');
    if(!inspect.State.Running){await this.docker(['start',spec.name]);inspect=JSON.parse(await this.docker(['inspect',spec.name]))[0];}
    const binding=inspect.NetworkSettings.Ports['8788/tcp']?.[0];
    if(binding?.HostIp!=='127.0.0.1'||!/^\d{1,5}$/.test(binding.HostPort))throw new Error('Worker port is not private.');
    return {origin:'http://127.0.0.1:'+binding.HostPort,token};
  }
  async request(tenant,path,method,body){
    const worker=await this.ensure(tenant);
    for(let attempt=0;attempt<20;attempt++){
      try{return await fetch(worker.origin+path,{method,headers:{Authorization:'Bearer '+worker.token,'Content-Type':'application/json'},body:method==='GET'?undefined:body,redirect:'error',signal:AbortSignal.timeout(20000)});}
      catch(error){if(attempt===19)throw error;await new Promise(resolve=>setTimeout(resolve,250));}
    }
  }
}
export function gateway({secret,fleet,maxWorkers=5}){
  if(!secret||secret.length<48)throw new Error('A private server secret of at least 48 characters is required.');
  const seen=new Map(),rates=new Map();let provisioning=Promise.resolve();
  fleet??=new DockerFleet({secret,maxWorkers});
  return createServer(async(request,response)=>{
    try{
      if(request.method==='GET'&&request.url==='/health')return json(response,200,{ok:true,protocol:1});
      const body=await readBody(request),tenant=verifyRequest(secret,request,body,seen);
      if(!((request.method==='POST'&&['/jobs','/complete'].includes(request.url))||(request.method==='GET'&&/^\/jobs\/[a-f0-9-]{36}$/.test(request.url))))return json(response,404,{error:'Unknown agent route.'});
      const minute=Math.floor(Date.now()/60000),rate=rates.get(tenant);const count=rate?.minute===minute?rate.count+1:1;rates.set(tenant,{minute,count});
      for(const [id,value] of rates)if(value.minute<minute-1)rates.delete(id);
      if(count>90)return json(response,429,{error:'Too many agent requests.'});
      // Avoid concurrent new tenants exceeding the configured capacity.
      const turn=provisioning.then(()=>fleet.ensure(tenant));provisioning=turn.catch(()=>{});await turn;
      const result=await fleet.request(tenant,request.url,request.method,body);
      response.writeHead(result.status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(await result.text());
    }catch{json(response,503,{error:'Agent request rejected or the worker is unavailable.'});}
  });
}
if(process.argv[1]?.endsWith('/gateway.mjs')||process.argv[1]?.endsWith('\\gateway.mjs'))gateway({secret:process.env.OSKA_AGENT_SECRET,maxWorkers:Number(process.env.OSKA_MAX_WORKERS||5)}).listen(Number(process.env.PORT||8790),'127.0.0.1');
