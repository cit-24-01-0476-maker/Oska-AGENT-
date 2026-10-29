import {NextResponse} from 'next/server';
import {z} from 'zod';
import {AppError} from '@/lib/contracts';
import {isCloud} from '@/lib/runtime';
import {cloudAuth,guardCloud,cloudUser} from '@/cloud/auth';
import {teamSchema,cloudTaskSchema,providerAvailability} from '@/cloud/contracts';
import {listTeams,saveTeam,deleteTeam,recordTask,listTasks,enforceWriteRate} from '@/cloud/repository';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function body(request:Request){const length=Number(request.headers.get('content-length')||0);if(length>100000)throw new AppError('SIZE','Request too large.',413);if(!request.headers.get('content-type')?.includes('application/json'))throw new AppError('TYPE','Expected JSON.',415);const source=await request.text();if(source.length>100000)throw new AppError('SIZE','Request too large.',413);try{return JSON.parse(source);}catch{throw new AppError('JSON','Malformed JSON body.');}}
async function handler(request:Request,{params}:{params:Promise<{path:string[]}>}){
  try{
    if(!isCloud())throw new AppError('CLOUD_DISABLED','Cloud API is disabled in the local edition.',403);
    const {path}=await params;const [resource,action]=path;
    if(resource==='auth')return await cloudAuth(request,action);
    guardCloud(request);const user=await cloudUser(request);
    if(!['GET','HEAD'].includes(request.method))await enforceWriteRate(user);
    if(resource==='providers'&&request.method==='GET')return NextResponse.json({providers:providerAvailability});
    if(resource==='teams'){
      if(!action&&request.method==='GET')return NextResponse.json({teams:await listTeams(user)});
      if(!action&&request.method==='POST')return NextResponse.json(await saveTeam(user,teamSchema.parse(await body(request))),{status:201});
      if(action&&request.method==='DELETE'){await deleteTeam(user,z.uuid().parse(action));return NextResponse.json({deleted:true});}
    }
    if(resource==='tasks'){
      if(request.method==='GET')return NextResponse.json({tasks:await listTasks(user)});
      if(request.method==='POST')return NextResponse.json(await recordTask(user,cloudTaskSchema.parse(await body(request))),{status:202});
    }
    throw new AppError('NOT_FOUND','Endpoint not found.',404);
  }catch(error){
    const failure=error instanceof AppError?error:error instanceof z.ZodError?new AppError('VALIDATION',error.issues.map(v=>v.message).join('; ')):new AppError('CLOUD_ERROR','Cloud operation failed. Check the configured database and schema migration.',500);
    return NextResponse.json({error:{code:failure.code,message:failure.message}},{status:failure.status,headers:{'Cache-Control':'no-store'}});
  }
}
export {handler as GET,handler as POST,handler as DELETE};
