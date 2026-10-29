import {NextResponse} from 'next/server';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {db} from '@/lib/db';
import {guard,redact} from '@/lib/security';
import {AppError,taskInput,settingsInput} from '@/lib/contracts';
import {initialize,createTask,approve,cancel,retry} from '@/lib/engine';
import {antigravity} from '@/lib/providers/antigravity';
import {artifactBytes} from '@/lib/files';
import {prepareSetup,runSetup,setupAction,setupApproval} from '@/lib/providers/setup';
import {googleAuthRoute} from '@/lib/google-auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
async function jsonBody(request:Request){if(!request.headers.get('content-type')?.includes('application/json'))throw new AppError('CONTENT_TYPE','Expected application/json.',415);const text=await request.text();if(text.length>100000)throw new AppError('SIZE','Request is too large.',413);try{return JSON.parse(text);}catch{throw new AppError('JSON','Malformed JSON body.');}}
async function handler(request:Request,context:Context){
  try{
    const {path}=await context.params;const [resource,id,action]=path;const method=request.method;
    if(resource==='auth'&&id==='google'&&action)return await googleAuthRoute(request,action);
    guard(request);await initialize();
    if(resource==='health'&&method==='GET')return NextResponse.json({ok:true,app:'OSKA AGENT',mode:'local-only',database:await db.$queryRaw`SELECT 1` .then(()=>true)});
    if(resource==='providers'){
      if(id&&id!=='antigravity')throw new AppError('NOT_IMPLEMENTED','This provider is not connected.',501);
      if(action==='setup'&&method==='GET')return NextResponse.json(await prepareSetup(setupAction.parse(new URL(request.url).searchParams.get('action'))),{headers:{'Cache-Control':'no-store'}});
      if(action==='setup'&&method==='POST')return NextResponse.json(await runSetup(setupApproval.parse(await jsonBody(request))));
      if(action==='connect'&&method==='POST')return NextResponse.json(await antigravity.connect());
      if(method==='GET'){
        const health=await antigravity.checkHealth();
        await db.providerConnection.upsert({where:{id:'antigravity'},create:{id:'antigravity',status:health.status,lastError:health.message},update:{status:health.status,lastError:health.message}});
        if(action==='models'){
          if(!health.models.length)throw new AppError(health.status.toUpperCase(),health.message,503);
          await db.$transaction([db.modelCatalogEntry.deleteMany({where:{providerId:'antigravity'}}),db.modelCatalogEntry.createMany({data:health.models.map(m=>({providerId:'antigravity',modelId:m.id,displayName:m.displayName,available:m.available}))})]);
          return NextResponse.json({models:health.models,message:health.message});
        }
        return NextResponse.json(id?health:{providers:[{id:'antigravity',name:'Google Antigravity',...health},{id:'codex',name:'Codex app-server',status:'not_implemented'},{id:'ollama',name:'Ollama',status:'not_implemented'},{id:'manus',name:'Manus API',status:'disabled_paid_integration'}]});
      }
    }
    if(resource==='settings'){
      if(method==='GET'){const values=await db.setting.findMany({where:{key:{in:['theme','onboarded','overagesConfirmed']}}});return NextResponse.json(Object.fromEntries(values.map(v=>[v.key,JSON.parse(v.value)])));}
      if(method==='PATCH'){const values=settingsInput.parse(await jsonBody(request));await db.$transaction(Object.entries(values).map(([key,value])=>db.setting.upsert({where:{key},create:{key,value:JSON.stringify(value)},update:{value:JSON.stringify(value)}})));return NextResponse.json(values);}
    }
    if(resource==='usage'&&method==='GET')return NextResponse.json({records:await db.usageRecord.findMany({orderBy:{createdAt:'desc'},take:100}),quota:null,quotaMessage:'Remaining quota is not exposed by OSKA. Check /usage in the official CLI.'});
    if(resource==='tasks'){
      if(!id&&method==='POST'){const input=taskInput.parse(await jsonBody(request));return NextResponse.json(await createTask(input),{status:201});}
      if(!id&&method==='GET'){
        const query=new URL(request.url).searchParams;const page=z.coerce.number().int().min(1).max(10000).parse(query.get('page')??1);const search=(query.get('search')??'').slice(0,200);const status=query.get('status')||undefined;
        const where={...(search?{OR:[{title:{contains:search}},{prompt:{contains:search}}]}:{}),...(status?{status}:{})};
        const [tasks,total]=await Promise.all([db.task.findMany({where,orderBy:{createdAt:'desc'},take:20,skip:(page-1)*20,include:{_count:{select:{artifacts:true}}}}),db.task.count({where})]);return NextResponse.json({tasks,total,page});
      }
      const task=await db.task.findUnique({where:{id}});if(!task)throw new AppError('NOT_FOUND','Task not found.',404);
      if(!action&&method==='GET')return NextResponse.json(await db.task.findUnique({where:{id},include:{steps:{orderBy:{number:'asc'}},messages:{orderBy:{createdAt:'asc'}},approvals:true,artifacts:true,tools:true}}));
      if(action==='events'&&method==='GET'){
        const raw=request.headers.get('last-event-id')??new URL(request.url).searchParams.get('after')??'0';let cursor=z.coerce.number().int().min(0).parse(raw);let closed=false;let timer:ReturnType<typeof setTimeout>;
        const encoder=new TextEncoder();
        const stream=new ReadableStream({start(controller){
          const close=()=>{if(closed)return;closed=true;clearTimeout(timer);try{controller.close();}catch{}};
          request.signal.addEventListener('abort',close,{once:true});
          const poll=async()=>{if(closed)return;try{const events=await db.taskEvent.findMany({where:{taskId:id,id:{gt:cursor}},orderBy:{id:'asc'},take:100});for(const item of events){if(closed)return;cursor=item.id;controller.enqueue(encoder.encode(`id: ${item.id}\nevent: update\ndata: ${JSON.stringify(item)}\n\n`));}const state=await db.task.findUnique({where:{id},select:{status:true}});if(!events.length&&state&&['COMPLETED','FAILED','CANCELED','PAUSED'].includes(state.status)){controller.enqueue(encoder.encode('event: settled\ndata: {}\n\n'));close();return;}if(!closed){controller.enqueue(encoder.encode(': keepalive\n\n'));timer=setTimeout(()=>void poll(),800);}}catch{close();}};void poll();
        },cancel(){closed=true;clearTimeout(timer);}});
        return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}});
      }
      if(method==='POST'){
        if(action==='approve'){await approve(id);return NextResponse.json({status:'RUNNING'});}
        if(action==='cancel'||action==='reject'){await cancel(id);return NextResponse.json({status:'CANCELED'});}
        if(action==='pause'){await cancel(id,true);return NextResponse.json({status:'PAUSED',message:'Process stopped. Resume requires a new approval and may regenerate the result.'});}
        if(action==='retry'){await retry(id);return NextResponse.json({status:'WAITING_FOR_APPROVAL'});}
      }
      if(!action&&method==='DELETE'){
        if(['RUNNING','PLANNING'].includes(task.status))throw new AppError('RUNNING','Cancel the task before deleting it.',409);
        // Remove database data. Artifacts retained on disk until manual workspace cleanup, documented in privacy settings.
        await db.task.delete({where:{id}});return NextResponse.json({deleted:true});
      }
    }
    if(resource==='artifacts'&&method==='GET'){
      if(!id)return NextResponse.json({artifacts:await db.artifact.findMany({orderBy:{createdAt:'desc'},take:100,include:{task:{select:{title:true}}}})});
      const artifact=await db.artifact.findUnique({where:{id}});if(!artifact)throw new AppError('NOT_FOUND','Artifact not found.',404);
      if(action==='download'){const bytes=await artifactBytes(artifact.path);return new Response(new Uint8Array(bytes),{headers:{'Content-Type':artifact.mime,'Content-Disposition':`attachment; filename="${artifact.name.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'no-store'}});}
    }
    throw new AppError('NOT_FOUND','Endpoint or method not found.',404);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:{code:'VALIDATION',message:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')}},{status:400});
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')return NextResponse.json({error:{code:'DUPLICATE',message:'This request already exists. Refresh history.'}},{status:409});
    const failure=error instanceof AppError?error:new AppError('INTERNAL','The local operation failed. Check database setup and server availability.',500);
    return NextResponse.json({error:{code:failure.code,message:redact(failure.message)}},{status:failure.status});
  }
}
export {handler as GET,handler as POST,handler as PATCH,handler as DELETE};
