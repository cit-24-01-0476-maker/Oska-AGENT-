import {createHash,randomBytes} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {NextResponse} from 'next/server';
import {AppError} from './contracts';
import {db} from './db';
import {guard,equalSecret} from './security';

export type WebProfile={sub:string;name:string;email:string};
type Pending={verifier:string;nonce:string;expires:number};
const globalAuth=globalThis as unknown as {oskaGooglePending?:Map<string,Pending>};
const pending=globalAuth.oskaGooglePending??=new Map<string,Pending>();
const SESSION='oska_web_session',STATE='oska_google_state';
export const googleCallbackPath='/api/auth/google/callback';
export function googleConfigured(){return !!process.env.GOOGLE_CLIENT_ID&&!!process.env.GOOGLE_CLIENT_SECRET;}
function hash(value:string){return createHash('sha256').update(value).digest('hex');}
function cookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(name+'='))?.slice(name.length+1)??'';}
function appOrigin(request:Request){
  const url=new URL(request.url);const origin=`${url.protocol}//${request.headers.get('host')}`;
  const parsed=new URL(origin);
  if(!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||parsed.port!==url.port)throw new AppError('LOCAL_ONLY','Google sign-in is restricted to this local OSKA server.',403);
  return origin;
}
export function validateGoogleProfile(payload:{sub?:string;name?:string;email?:string;email_verified?:boolean;nonce?:string}|undefined,nonce:string):WebProfile{
  if(!payload?.sub||!payload.email||payload.email_verified!==true||!payload.nonce||!equalSecret(payload.nonce,nonce))throw new AppError('IDENTITY','Google did not return a verified identity for this sign-in.',401);
  return {sub:payload.sub,name:payload.name||payload.email.split('@')[0],email:payload.email};
}
export async function webProfile(request:Request){
  const raw=cookie(request,SESSION);if(!/^[a-f0-9]{64}$/.test(raw))return null;
  const stored=await db.setting.findUnique({where:{key:`web-session:${hash(raw)}`}});if(!stored)return null;
  try{const session=JSON.parse(stored.value) as {profile:WebProfile;expires:number};if(session.expires<Date.now()){await db.setting.delete({where:{key:stored.key}});return null;}return session.profile;}catch{return null;}
}
export async function googleAuthRoute(request:Request,action:string){
  const origin=appOrigin(request);
  if(action!=='callback')guard(request);
  if(action==='session'&&request.method==='GET')return NextResponse.json({configured:googleConfigured(),profile:await webProfile(request),redirectUri:origin+googleCallbackPath},{headers:{'Cache-Control':'no-store'}});
  if(action==='logout'&&request.method==='POST'){
    const raw=cookie(request,SESSION);if(raw)await db.setting.deleteMany({where:{key:`web-session:${hash(raw)}`}});
    const response=NextResponse.json({signedOut:true});response.cookies.set(SESSION,'',{httpOnly:true,sameSite:'lax',path:'/',maxAge:0});return response;
  }
  if(!googleConfigured())throw new AppError('GOOGLE_SETUP_REQUIRED','Google web sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your local .env file. Open Connections → Google web account for setup instructions.',503);
  const client=new OAuth2Client(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,origin+googleCallbackPath);
  if(action==='start'&&request.method==='GET'){
    const state=randomBytes(32).toString('hex'),verifier=randomBytes(48).toString('base64url'),nonce=randomBytes(32).toString('hex');
    for(const [key,item] of pending)if(item.expires<Date.now())pending.delete(key);
    if(pending.size>100)throw new AppError('RATE_LIMIT','Too many pending sign-ins. Try again later.',429);
    pending.set(hash(state),{verifier,nonce,expires:Date.now()+600000});
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,redirect_uri:origin+googleCallbackPath,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}).toString();
    const response=NextResponse.redirect(url);response.cookies.set(STATE,state,{httpOnly:true,sameSite:'lax',path:'/',maxAge:600,secure:origin.startsWith('https:')});return response;
  }
  if(action==='callback'&&request.method==='GET'){
    // Google navigates cross-site to this one endpoint. State, the HttpOnly
    // browser cookie, PKCE, nonce and Google's verified ID token protect it.
    const query=new URL(request.url).searchParams,state=query.get('state')??'',browserState=cookie(request,STATE);
    const flow=/^[a-f0-9]{64}$/.test(state)?pending.get(hash(state)):undefined;
    if(!flow||flow.expires<Date.now()||!browserState||!equalSecret(state,browserState))throw new AppError('OAUTH_STATE','Sign-in expired or was not started in this browser. Try signing in again.',401);
    pending.delete(hash(state));
    if(query.has('error')){const response=NextResponse.redirect(origin+'/?google=denied');response.cookies.set(STATE,'',{path:'/',maxAge:0});return response;}
    const code=query.get('code');if(!code||code.length>4096)throw new AppError('OAUTH_CODE','Google did not return a valid authorization code.',401);
    const {tokens}=await client.getToken({code,codeVerifier:flow.verifier});
    if(!tokens.id_token)throw new AppError('IDENTITY','Google did not return an identity token.',401);
    const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:process.env.GOOGLE_CLIENT_ID});
    const profile=validateGoogleProfile(ticket.getPayload(),flow.nonce);
    // Store only verified profile data and a hashed opaque session, never Google tokens.
    const raw=randomBytes(32).toString('hex');const expires=Date.now()+7*86400000;
    const old=cookie(request,SESSION);if(old)await db.setting.deleteMany({where:{key:`web-session:${hash(old)}`}});
    await db.setting.create({data:{key:`web-session:${hash(raw)}`,value:JSON.stringify({profile,expires})}});
    const response=NextResponse.redirect(origin+'/?google=connected');
    response.cookies.set(SESSION,raw,{httpOnly:true,sameSite:'lax',path:'/',maxAge:7*86400,secure:origin.startsWith('https:')});response.cookies.set(STATE,'',{path:'/',maxAge:0});response.headers.set('Cache-Control','no-store');return response;
  }
  throw new AppError('NOT_FOUND','Authentication endpoint not found.',404);
}
