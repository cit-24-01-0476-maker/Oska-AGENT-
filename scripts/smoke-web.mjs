// Explicitly gated live test of the actual local API and existing Google AI account.
if(process.env.OSKA_WEB_SMOKE!=='1'){console.log('SKIPPED: set OSKA_WEB_SMOKE=1 to approve one real short model task.');process.exit(0);}
const base='http://127.0.0.1:3000';
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',Origin:base}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error?.message||`HTTP ${r.status}`);return data;}
const health=await api('/api/providers/antigravity/status');if(!health.costSafe||!health.models?.length)throw new Error(health.message);
const task=await api('/api/tasks',{mode:'Chat',modelId:health.models[0].id,requestId:crypto.randomUUID(),prompt:'Write a concise three-step checklist for planning and completing a small project. Start with: OSKA connection verified. Do not use tools or claim browser access.'});
console.log(`Created real task: ${task.id}`);await api(`/api/tasks/${task.id}/approve`,{});
let result;
for(let attempt=0;attempt<90;attempt++){
  result=await api(`/api/tasks/${task.id}`);
  if(['COMPLETED','FAILED','CANCELED'].includes(result.status))break;
  await new Promise(resolve=>setTimeout(resolve,1000));
}
if(result.status!=='COMPLETED')throw new Error(result.error||`Task ended in ${result.status}`);
if(!result.result.includes('OSKA connection verified')||result.artifacts.length!==2)throw new Error('Missing real model result or expected exports.');
for(const artifact of result.artifacts){const response=await fetch(`${base}/api/artifacts/${artifact.id}/download`);if(!response.ok||(await response.arrayBuffer()).byteLength!==artifact.size)throw new Error(`Download failed: ${artifact.name}`);}
console.log(`PASS: real web task COMPLETED, ${result.artifacts.length} artifacts downloaded.`);console.log(result.result);console.log(`Find this verified task in Recent Tasks: ${task.id}`);
