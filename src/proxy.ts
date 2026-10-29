import {NextResponse,type NextRequest} from 'next/server';
import {managedAuth,managedAuthConfigured} from '@/cloud/managed-auth';
import {guardCloud} from '@/cloud/auth';

// The SDK consumes its one-time OAuth verifier and sets its own secure cookies.
// Public pages and APIs retain their existing authorization behavior.
export async function proxy(request:NextRequest){
  if(!managedAuthConfigured())return NextResponse.redirect(new URL('/',request.url));
  try{guardCloud(request,true);}catch{return new NextResponse('Invalid callback host.',{status:403});}
  return (await managedAuth()).middleware({loginUrl:'/auth/sign-in'})(request);
}
export const config={matcher:['/auth/complete']};
