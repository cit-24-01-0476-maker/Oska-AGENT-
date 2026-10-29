import {db} from './db';
import {AppError,canTransition,type Status,type TaskInput} from './contracts';
import {antigravity} from './providers/antigravity';
import {providerFailure} from './providers/protocol';
import {browse} from './browser';
import {workspace,saveArtifact,reportPdf} from './files';
import {redact} from './security';
const globals=globalThis as unknown as {oskaRuns?:Map<string,AbortController>;oskaRecovery?:Promise<unknown>};
const runs=globals.oskaRuns??=new Map<string,AbortController>();
export async function initialize(){
  globals.oskaRecovery??=db.task.updateMany({where:{status:{in:['RUNNING','PLANNING','CREATED']}},data:{status:'FAILED',error:'The local server restarted during execution. Review and retry; external actions are never replayed automatically.'}});
  await globals.oskaRecovery;
}
export async function event(taskId:string,type:string,data:unknown){return db.taskEvent.create({data:{taskId,type,data:JSON.stringify(data)}});}
export async function transition(taskId:string,to:Status){
  const task=await db.task.findUniqueOrThrow({where:{id:taskId}});
  if(!canTransition(task.status,to))throw new AppError('STATE',`Cannot change ${task.status} to ${to}.`,409);
  const changed=await db.task.updateMany({where:{id:taskId,status:task.status},data:{status:to}});
  if(!changed.count)throw new AppError('STATE','Task changed. Refresh and try again.',409);
  await event(taskId,'status',{status:to});
}
export async function createTask(input:TaskInput){
  const duplicate=await db.task.findUnique({where:{requestId:input.requestId}});if(duplicate)return duplicate;
  const browser=input.mode==='Browser'||input.mode==='Research';
  const rawUrl=input.url??input.prompt.match(/https?:\/\/[^\s<>]+/)?.[0];
  if(browser&&!rawUrl)throw new AppError('URL_REQUIRED','Include the public URL you want to visit. This release reads one approved source per task.');
  if(!browser&&input.mode!=='Files'&&!input.modelId)throw new AppError('MODEL_REQUIRED','Connect Antigravity and select a real model first.');
  const task=await db.task.create({data:{requestId:input.requestId,title:input.prompt.slice(0,88),prompt:input.prompt,mode:input.mode,modelId:input.modelId||null,messages:{create:{role:'user',content:input.prompt}}}});
  await event(task.id,'status',{status:'CREATED'});await transition(task.id,'PLANNING');
  const tool=browser?'browser':input.mode==='Files'?'files':'antigravity';
  const context=browser?`Read ${rawUrl}, capture a screenshot and save source text. No forms, messages, purchases or page interaction.`:tool==='files'?'Save your supplied text as a Markdown document and a simple PDF in this task workspace. No AI inference.':'Send your prompt to the selected Antigravity model using the official CLI. CLI tools are denied. Save the response in this task workspace.';
  await db.$transaction([
    db.taskStep.createMany({data:[{taskId:task.id,number:1,title:'Review goal and execution scope',tool:'planner',expectedOutput:'A reviewable execution plan',risk:'None',status:'COMPLETED'},{taskId:task.id,number:2,title:browser?'Read approved public source':tool==='files'?'Prepare your document':'Generate response with selected model',tool,expectedOutput:browser?'Page text, source URL and screenshot':'Document content',risk:browser?'Public network request':tool==='files'?'Local file creation':'Prompt shared with Google AI',approvalRequired:true},{taskId:task.id,number:3,title:'Save and export results',tool:'export',expectedOutput:'Downloadable Markdown and PDF',risk:'Create new files in task workspace',approvalRequired:true}]}),
    db.approvalRequest.create({data:{taskId:task.id,context,scope:JSON.stringify({tool,url:rawUrl,modelId:input.modelId,workspace:task.id})}})
  ]);
  await event(task.id,'plan',{objective:task.prompt,source:'OSKA deterministic execution plan',context});await transition(task.id,'WAITING_FOR_APPROVAL');
  return db.task.findUniqueOrThrow({where:{id:task.id}});
}
export async function approve(taskId:string){
  if(runs.size)throw new AppError('BUSY','Another task is running. Cancel it or wait for completion.',409);
  const controller=new AbortController();runs.set(taskId,controller);
  try{
    await db.$transaction(async tx=>{
      const pending=await tx.approvalRequest.findFirst({where:{taskId,status:'PENDING'}});if(!pending)throw new AppError('APPROVAL','No pending approval exists.',409);
      const claimed=await tx.task.updateMany({where:{id:taskId,status:'WAITING_FOR_APPROVAL'},data:{status:'RUNNING',error:null}});if(!claimed.count)throw new AppError('STATE','Task is not awaiting approval.',409);
      await tx.approvalRequest.update({where:{id:pending.id},data:{status:'APPROVED',decidedAt:new Date()}});
    });
    await event(taskId,'status',{status:'RUNNING'});
    void execute(taskId,controller).finally(()=>runs.delete(taskId));
  }catch(error){runs.delete(taskId);throw error;}
}
async function execute(taskId:string,controller:AbortController){
  const signal=controller.signal;
  const check=()=>{if(signal.aborted)throw new AppError('CANCELED','Task execution stopped.');};
  try{
    const task=await db.task.findUniqueOrThrow({where:{id:taskId},include:{approvals:{where:{status:'APPROVED'},orderBy:{decidedAt:'desc'},take:1}}});
    const scope=JSON.parse(task.approvals[0].scope) as {tool:string;url?:string};
    const dir=await workspace(taskId);check();
    await db.taskStep.updateMany({where:{taskId,number:2},data:{status:'RUNNING'}});
    const tool=await db.toolExecution.create({data:{taskId,tool:scope.tool,arguments:JSON.stringify({model:task.modelId,url:scope.url}),status:'RUNNING'}});
    await event(taskId,'activity',{message:`Started ${scope.tool}.`});let text='';
    if(scope.tool==='browser'){
      const page=await browse(scope.url!,signal,async message=>{check();await event(taskId,'activity',{message});});check();
      const screenshot=await saveArtifact(taskId,`browser-${Date.now()}.png`,page.screenshot,'image/png');
      await event(taskId,'artifact',{id:screenshot.id,name:screenshot.name});
      text=`# ${page.title}\n\nSource: ${page.url}\n\nCaptured: ${new Date().toISOString()}\n\n## Source text\n\n${page.text}\n\n---\nThis is a source capture, not an AI summary. No search or additional sources were used.`;
    }else if(scope.tool==='files'){text=task.prompt;await event(taskId,'activity',{message:'Prepared supplied text for local export. No model request used.'});}
    else{
      const response=await antigravity.stream({taskId,prompt:task.prompt,modelId:task.modelId!,cwd:dir,conversationId:task.conversationId??undefined,signal,onEvent:async item=>{
        check();const step=item.step_update as Record<string,unknown>|undefined;
        if(item.event==='init')await event(taskId,'activity',{message:'Official Antigravity session initialized.'});
        if(step?.step_type==='agent_response'&&typeof step.text_delta==='string')await event(taskId,'delta',{text:step.text_delta});
        else if(step)await event(taskId,'activity',{message:`CLI ${String(step.step_type)}: ${String(step.state)}`});
      }});check();text=response.response;
      await db.task.update({where:{id:taskId},data:{conversationId:response.conversationId}});
      await db.usageRecord.create({data:{taskId,provider:'antigravity',modelId:task.modelId!,tokens:response.tokens,status:'SUCCESS'}});
    }
    check();await db.toolExecution.update({where:{id:tool.id},data:{status:'COMPLETED'}});
    await db.taskStep.updateMany({where:{taskId,number:2},data:{status:'COMPLETED'}});
    await db.taskStep.updateMany({where:{taskId,number:3},data:{status:'RUNNING'}});
    const stamp=Date.now();
    for(const [name,data,mime] of [[`result-${stamp}.md`,text,'text/markdown'],[`report-${stamp}.pdf`,await reportPdf(text),'application/pdf']] as const){check();const artifact=await saveArtifact(taskId,name,data,mime);await event(taskId,'artifact',{id:artifact.id,name:artifact.name});}
    check();await db.$transaction([db.task.update({where:{id:taskId},data:{result:text}}),db.conversationMessage.create({data:{taskId,role:'assistant',content:text}}),db.taskStep.updateMany({where:{taskId,number:3},data:{status:'COMPLETED'}})]);
    await transition(taskId,'COMPLETED');
  }catch(error){
    const task=await db.task.findUnique({where:{id:taskId}});if(!task||task.status==='CANCELED'||task.status==='PAUSED')return;
    const failure=error instanceof AppError?error:providerFailure(redact(error instanceof Error?error.message:String(error)));
    await db.task.update({where:{id:taskId},data:{error:failure.message}});await db.taskStep.updateMany({where:{taskId,status:'RUNNING'},data:{status:'FAILED'}});await db.toolExecution.updateMany({where:{taskId,status:'RUNNING'},data:{status:'FAILED'}});
    await event(taskId,'error',{code:failure.code,message:failure.message});await transition(taskId,'FAILED');
    if(task.modelId)await db.usageRecord.create({data:{taskId,provider:'antigravity',modelId:task.modelId,status:failure.code}});
  }
}
export async function cancel(taskId:string,paused=false){
  await transition(taskId,paused?'PAUSED':'CANCELED');runs.get(taskId)?.abort();await antigravity.cancel(taskId);
  await db.toolExecution.updateMany({where:{taskId,status:'RUNNING'},data:{status:paused?'PAUSED':'CANCELED'}});
  await db.approvalRequest.updateMany({where:{taskId,status:'PENDING'},data:{status:'DENIED',decidedAt:new Date()}});
}
export async function retry(taskId:string){
  if(runs.has(taskId))throw new AppError('BUSY','The previous process is still stopping. Try again shortly.',409);
  const task=await db.task.findUniqueOrThrow({where:{id:taskId},include:{approvals:{take:1}}});
  if(!['FAILED','CANCELED','PAUSED'].includes(task.status))throw new AppError('STATE','Only stopped tasks can be retried.',409);
  await transition(taskId,'WAITING_FOR_APPROVAL');await db.task.update({where:{id:taskId},data:{error:null}});
  await db.taskStep.updateMany({where:{taskId,number:{gt:1}},data:{status:'PENDING'}});
  await db.approvalRequest.create({data:{taskId,context:task.approvals[0]?.context??'Retry original scope.',scope:task.approvals[0]?.scope??'{}'}});
  await event(taskId,'activity',{message:'Retry prepared. Review scope and approve to execute. Completed external actions are not resumed automatically.'});
}
