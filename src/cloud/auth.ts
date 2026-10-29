import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {EncryptJWT,jwtDecrypt} from 'jose';
import {OAuth2Client} from 'google-auth-library';
import {NextResponse} from 'next/server';
import {AppError} from '@/lib/contracts';
import type {CloudProfile} from './contracts';
import {cloudDatabaseUrl,cloudDb} from './db';
import {managedAuth,managedAuthEnabled,managedAuthConfigured} from './managed-auth';
const SESSION='oska_cloud_session',FLOW='oska_cloud_oauth';
export function configuredOrigin(){
  const raw=process.env.APP_ORIGIN;
  if(!raw)throw new AppError('HOST_SETUP_REQUIRED','Configure APP_ORIGIN to your exact HTTPS Vercel URL.',503);
  const url=new URL(raw);
  if(url.origin!==raw||url.username||url.password||url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new AppError('HOST_SETUP_REQUIRED','APP_ORIGIN must be an HTTPS origin without a path.',503);
  return url.origin;
}
export function guardCloud(request:Request,callback=false){
  const origin=configuredOrigin(),host=request.headers.get('host');
  if(host!==new URL(origin).host)throw new AppError('HOST','Request host does not match this deployment.',403);
  const incoming=request.headers.get('origin');
  if(incoming&&incoming!==origin&&!callback)throw new AppError('ORIGIN','Cross-origin requests are blocked.',403);
  if(!callback&&request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('ORIGIN','Cross-site requests are blocked.',403);
  if(!['GET','HEAD'].includes(request.method)&&incoming!==origin)throw new AppError('CSRF','A same-origin request is required.',403);
}
function key(){const secret=process.env.AUTH_SECRET;if(!secret||secret.length<32)throw new AppError('AUTH_SETUP_REQUIRED','Configure AUTH_SECRET with at least 32 random characters.',503);return createHash('sha256').update(secret).digest();}
export function cookieValue(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';}
export async function seal(payload:Record<string,unknown>,purpose:string,lifetime:string){return new EncryptJWT(payload).setProtectedHeader({alg:'dir',enc:'A256GCM'}).setIssuedAt().setIssuer('oska-cloud').setAudience(purpose).setExpirationTime(lifetime).encrypt(key());}
export async function unseal(raw:string,purpose:string){try{const {payload}=await jwtDecrypt(raw,key(),{issuer:'oska-cloud',audience:purpose});return payload;}catch{throw new AppError('UNAUTHORIZED','Sign in to your OSKA account.',401);}}
export async function cloudUser(request:Request):Promise<CloudProfile>{
  if(managedAuthEnabled()){
    const {data}=await (await managedAuth()).getSession({query:{disableCookieCache:'true'}});
    const identity=data?.user;
    if(!identity?.id||!identity.email||!identity.emailVerified)throw new AppError('UNAUTHORIZED','Sign in with a verified Google account.',401);
    const user={sub:'neon:'+identity.id,email:identity.email,name:identity.name||identity.email.split('@')[0]};
    const sql=cloudDb();await sql`INSERT INTO oska_cloud_users(id,email,name) VALUES(${user.sub},${user.email},${user.name}) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name`;
    return user;
  }
  const payload=await unseal(cookieValue(request,SESSION),'session');
  if(typeof payload.sub!=='string'||typeof payload.email!=='string'||typeof payload.name!=='string'||typeof payload.sid!=='string')throw new AppError('UNAUTHORIZED','Invalid account session.',401);
  const sql=cloudDb();const active=await sql`SELECT id FROM oska_cloud_sessions WHERE id=${payload.sid}::uuid AND owner_id=${payload.sub} AND expires_at>CURRENT_TIMESTAMP`;
  if(!active.length)throw new AppError('UNAUTHORIZED','This account session was revoked or expired.',401);
  return {sub:payload.sub,email:payload.email,name:payload.name};
}
export function cloudSetup(){return {origin:!!process.env.APP_ORIGIN,identity:managedAuthEnabled()?managedAuthConfigured():!!process.env.GOOGLE_CLIENT_ID&&!!process.env.GOOGLE_CLIENT_SECRET,session:!!process.env.AUTH_SECRET&&process.env.AUTH_SECRET.length>=32,database:!!cloudDatabaseUrl()};}
const cookies={httpOnly:true,sameSite:'lax' as const,path:'/api/cloud',secure:true};
export async function cloudAuth(request:Request,action:string){
  const origin=configuredOrigin();guardCloud(request,action==='callback');
  const options={...cookies,secure:origin.startsWith('https:')};
  if(action==='session'){
    let user:CloudProfile|null=null;try{user=await cloudUser(request);}catch{}
    return NextResponse.json({profile:user,setup:cloudSetup(),loginMode:managedAuthEnabled()?'neon-preview':'google',redirectUri:managedAuthEnabled()?null:origin+'/api/cloud/auth/callback'},{headers:{'Cache-Control':'no-store'}});
  }
  if(action==='logout'&&request.method==='POST'){
    if(managedAuthEnabled()){
      const result=await (await managedAuth()).signOut();
      if(result.error)throw new AppError('SIGN_OUT','Could not sign out. Try again.',503);
      return NextResponse.json({signedOut:true});
    }
    const payload=await unseal(cookieValue(request,SESSION),'session');
    if(typeof payload.sid==='string'&&typeof payload.sub==='string'){const sql=cloudDb();await sql`DELETE FROM oska_cloud_sessions WHERE id=${payload.sid}::uuid AND owner_id=${payload.sub}`;}
    const response=NextResponse.json({signedOut:true});response.cookies.set(SESSION,'',{...options,maxAge:0});return response;
  }
  if(managedAuthEnabled())throw new AppError('NOT_FOUND','Use the managed identity client for preview sign-in.',404);
  const setup=cloudSetup();if(!setup.identity||!setup.session||!setup.database)throw new AppError('AUTH_SETUP_REQUIRED','Complete Google OAuth, AUTH_SECRET and Postgres setup for this deployment before enabling sign-in.',503);
  const callback=origin+'/api/cloud/auth/callback';
  if(action==='start'&&request.method==='GET'){
    const state=randomBytes(32).toString('hex'),nonce=randomBytes(32).toString('hex'),verifier=randomBytes(48).toString('base64url');
    const flow=await seal({state,nonce,verifier},'oauth','10m');
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,redirect_uri:callback,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}).toString();
    const response=NextResponse.redirect(url);response.cookies.set(FLOW,flow,{...options,maxAge:600});return response;
  }
  if(action==='callback'&&request.method==='GET'){
    const params=new URL(request.url).searchParams;const flow=await unseal(cookieValue(request,FLOW),'oauth');
    if(!flow.state||flow.state!==params.get('state')||typeof flow.verifier!=='string'||typeof flow.nonce!=='string')throw new AppError('OAUTH_STATE','Sign-in state expired or does not match this browser.',401);
    if(params.has('error')){const response=NextResponse.redirect(origin+'/?auth=denied');response.cookies.set(FLOW,'',{...options,maxAge:0});return response;}
    const code=params.get('code');if(!code||code.length>4096)throw new AppError('OAUTH_CODE','Google did not return a valid authorization code.',401);
    const client=new OAuth2Client(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,callback);
    const {tokens}=await client.getToken({code,codeVerifier:flow.verifier});if(!tokens.id_token)throw new AppError('IDENTITY','Google identity token missing.',401);
    const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:process.env.GOOGLE_CLIENT_ID}),profile=ticket.getPayload() as {sub?:string;name?:string;email?:string;email_verified?:boolean;nonce?:string}|undefined;
    if(!profile?.sub||!profile.email||!profile.email_verified||profile.nonce!==flow.nonce)throw new AppError('IDENTITY','Google account could not be verified.',401);
    const user={sub:profile.sub,name:profile.name||profile.email.split('@')[0],email:profile.email};
    const sql=cloudDb();await sql`INSERT INTO oska_cloud_users(id,email,name) VALUES(${user.sub},${user.email},${user.name}) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name`;
    const sid=randomUUID(),expires=new Date(Date.now()+28800000).toISOString();await sql`INSERT INTO oska_cloud_sessions(id,owner_id,expires_at) VALUES(${sid},${user.sub},${expires}::timestamptz)`;
    const session=await seal({...user,sid},'session','8h');const response=NextResponse.redirect(origin+'/');response.cookies.set(SESSION,session,{...options,maxAge:28800});response.cookies.set(FLOW,'',{...options,maxAge:0});response.headers.set('Cache-Control','no-store');return response;
  }
  throw new AppError('NOT_FOUND','Authentication endpoint not found.',404);
}
