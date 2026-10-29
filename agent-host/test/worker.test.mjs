import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {worker} from '../worker.mjs';
const token='test-worker-token-'.repeat(4);
async function start(home,providers){const server=worker({token,home,providers});server.listen(0,'127.0.0.1');await once(server,'listening');return {server,url:'http://127.0.0.1:'+server.address().port};}
async function call(url,path,input){return fetch(url+path,{method:input?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:input?JSON.stringify(input):undefined});}
async function completed(url,id){for(let i=0;i<80;i++){const job=await (await call(url,'/jobs/'+id)).json();if(['succeeded','failed'].includes(job.status))return job;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Fixture did not complete.');}
test('separate workers cannot read each other jobs; completed output survives restart (protocol fixtures)',async()=>{
  const a=await mkdtemp(join(tmpdir(),'oska-worker-a-')),b=await mkdtemp(join(tmpdir(),'oska-worker-b-'));
  const providers={models:async()=>({models:[{id:'fixture-model',name:'Fixture'}]}),run:async(_provider,_model,prompt)=>({response:'Fixture response: '+prompt}),close(){}};
  let first=await start(a,providers);const second=await start(b,providers);
  try{
    assert.equal((await fetch(first.url+'/health')).status,401);
    const request=await call(first.url,'/jobs',{action:'run',provider:'codex',model:'fixture-model',prompt:'Hello'});assert.equal(request.status,202);const {id}=await request.json();
    const job=await completed(first.url,id);assert.equal(job.status,'succeeded');assert.match(job.result.response,/Hello/);
    assert.equal((await call(second.url,'/jobs/'+id)).status,404);
    await new Promise(resolve=>first.server.close(resolve));first=await start(a,providers);
    assert.equal((await (await call(first.url,'/jobs/'+id)).json()).status,'succeeded');
    const team=await (await call(first.url,'/jobs',{action:'team',prompt:'Plan',members:[{name:'Plan',role:'Plan the task',provider:'codex',modelId:'fixture-model'},{name:'Review',role:'Review the plan',provider:'antigravity',modelId:'fixture-model'}]})).json();
    const result=await completed(first.url,team.id);assert.equal(result.result.outputs.length,2);assert.match(result.result.outputs[1].response,/Previous team responses/);
  }finally{await new Promise(resolve=>first.server.close(resolve));await new Promise(resolve=>second.server.close(resolve));await rm(a,{recursive:true,force:true});await rm(b,{recursive:true,force:true});}
});
