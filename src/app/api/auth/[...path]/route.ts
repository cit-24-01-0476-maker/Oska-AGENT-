import {NextResponse} from 'next/server';
import {isCloud} from '@/lib/runtime';
import {guardCloud} from '@/cloud/auth';
import {managedAuth,managedAuthConfigured} from '@/cloud/managed-auth';
import {AppError} from '@/lib/contracts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
async function handler(request:Request,context:Context){
  if(!isCloud()){
    const {path}=await context.params;
    const {handleLocalRequest}=await import('@/lib/local-api');
    return handleLocalRequest(request,{params:Promise.resolve({path:['auth',...path]})});
  }
  try{
    guardCloud(request);
    if(!managedAuthConfigured())throw new AppError('AUTH_SETUP_REQUIRED','Managed preview identity is not enabled.',503);
    // Expose only the identity methods used by this website, not account administration.
    const {path}=await context.params;
    if(!['sign-in/social','get-session','sign-out'].includes(path.join('/')))throw new AppError('NOT_FOUND','Authentication endpoint not found.',404);
    const handlers=(await managedAuth()).handler();
    return request.method==='GET'?handlers.GET(request,context):handlers.POST(request,context);
  }catch(error){
    const failure=error instanceof AppError?error:new AppError('AUTH_ERROR','Identity service is unavailable. Try again later.',503);
    return NextResponse.json({error:{code:failure.code,message:failure.message}},{status:failure.status,headers:{'Cache-Control':'no-store'}});
  }
}
export {handler as GET,handler as POST};
