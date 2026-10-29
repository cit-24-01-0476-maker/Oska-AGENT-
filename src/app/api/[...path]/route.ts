import {NextResponse} from 'next/server';
import {isCloud} from '@/lib/runtime';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
async function handler(request:Request,context:Context){
  if(isCloud())return NextResponse.json({error:{code:'LOCAL_EXECUTION_DISABLED',message:'Local CLI and filesystem endpoints are unavailable on the hosted application. Use the authenticated cloud API.'}},{status:403});
  const {handleLocalRequest}=await import('@/lib/local-api');return handleLocalRequest(request,context);
}
export {handler as GET,handler as POST,handler as PATCH,handler as DELETE};
