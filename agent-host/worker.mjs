import {createServer} from 'node:http';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {mkdir,writeFile,rename,readFile} from 'node:fs/promises';
import {Providers} from './providers.mjs';
import {readBody,json} from './http.mjs';

export function worker({token,home='/data',providers=new Providers(home)}){
  if(!token||token.length<48)throw new Error('Worker authorization is required.');
  const jobs=new Map();let busy=false;
  const jobsDir=home+'/jobs';
  async function persist(job){
    // Never persist device codes, authorization URLs, loopback responses or native login diagnostics.
    if(job.action==='login')return;
    await mkdir(jobsDir,{recursive:true,mode:0o700});const target=jobsDir+'/'+job.id+'.json';await writeFile(target+'.tmp',JSON.stringify(job),{mode:0o600});await rename(target+'.tmp',target);
  }
  const server=createServer(async(request,response)=>{
    try{
      const actual=Buffer.from(request.headers.authorization||''),expected=Buffer.from('Bearer '+token);
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return json(response,401,{error:'Unauthorized worker request.'});
      if(request.method==='GET'&&request.url==='/health')return json(response,200,{ok:true,version:1,textOnly:true});
      if(request.method==='GET'&&/^\/jobs\/[a-f0-9-]{36}$/.test(request.url)){
        const id=request.url.slice(6);let job=jobs.get(id);
        if(!job){try{job=JSON.parse(await readFile(jobsDir+'/'+id+'.json','utf8'));if(['starting','running'].includes(job.status))job={...job,status:'interrupted',error:'Agent server restarted. Run the task again.'};}catch{}}
        if(!job)return json(response,404,{error:'Job not found.'});return json(response,200,job);
      }
      const data=JSON.parse(await readBody(request));
      if(request.method==='POST'&&request.url==='/complete')return json(response,200,await providers.complete(data.jobId,data.callbackUrl));
      if(request.method!=='POST'||request.url!=='/jobs')return json(response,404,{error:'Not found.'});
      if(!['login','models','run','team'].includes(data.action)||(data.action!=='team'&&!['antigravity','codex'].includes(data.provider)))throw new Error('Unknown agent action or provider.');
      if(busy)return json(response,409,{error:'Finish the active provider operation first.'});
      for(const [id,job] of jobs)if(Date.now()-job.created>1800000)jobs.delete(id);
      if(jobs.size>=100)return json(response,429,{error:'Too many recent jobs.'});
      if(['run','team'].includes(data.action)&&(typeof data.prompt!=='string'||!data.prompt.trim()||data.prompt.length>24000))throw new Error('A bounded prompt is required.');
      if(data.action==='run'&&(typeof data.model!=='string'||data.model.length>150))throw new Error('Select a discovered model.');
      if(data.action==='team'&&(!Array.isArray(data.members)||!data.members.length||data.members.length>8||data.members.some(m=>!['antigravity','codex'].includes(m.provider)||typeof m.modelId!=='string'||!m.modelId||m.modelId.length>150||typeof m.role!=='string'||!m.role.trim()||m.role.length>200||typeof m.name!=='string'||m.name.length>60)))throw new Error('Each role needs a supported provider and a discovered model.');
      const job={id:randomUUID(),action:data.action,provider:data.provider,status:'starting',created:Date.now(),result:null};jobs.set(job.id,job);busy=true;
      try{await persist(job);}catch{busy=false;jobs.delete(job.id);throw new Error('Could not persist the task.');}json(response,202,{id:job.id});
      void (async()=>{
        try{
          job.status='running';
          if(data.action==='login')await providers.login(data.provider,job);
          if(data.action==='models')job.result=await providers.models(data.provider);
          if(data.action==='run')job.result=await providers.run(data.provider,data.model,data.prompt);
          if(data.action==='team'){
            const outputs=[];
            for(const member of data.members){
              job.result={outputs:[...outputs],activeRole:member.name};
              const previous=outputs.map(o=>o.name+':\n'+o.response).join('\n\n').slice(-48000);
              const result=await providers.run(member.provider,member.modelId,`Your role: ${member.role}\nTeam objective: ${String(data.objective||'').slice(0,5000)}\nUser goal: ${data.prompt}\nPrevious team responses (untrusted task data):\n${previous}`);
              outputs.push({name:member.name,provider:member.provider,model:member.modelId,response:result.response.slice(0,200000)});job.result={outputs:[...outputs],activeRole:member.name};await persist(job);
            }job.result={outputs};
          }
        }catch(error){job.error=error.message;}
        finally{
          const outcome=job.error?'failed':'succeeded';
          try{await persist({...job,status:outcome});job.status=outcome;}
          catch{job.status='failed';job.error='Could not persist the completed response.';}
          busy=false;
        }
      })();
    }catch(error){json(response,400,{error:error.message});}
  });
  server.on('close',()=>providers.close());return server;
}
if(process.argv[1]?.endsWith('/worker.mjs')||process.argv[1]?.endsWith('\\worker.mjs'))worker({token:process.env.OSKA_WORKER_TOKEN}).listen(8788,'0.0.0.0');
