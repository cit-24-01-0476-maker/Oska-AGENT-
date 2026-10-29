import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export function tenantId(subject){
  if(typeof subject!=='string'||!subject.length||subject.length>512)throw new Error('Invalid workspace identity.');
  return createHash('sha256').update(subject).digest('hex');
}
export function signature(secret,{time,nonce,tenant,method,path,body}){
  return createHmac('sha256',secret).update([time,nonce,tenant,method,path,createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex');
}
export function verifyRequest(secret,request,body,seen,now=Date.now()){
  const time=request.headers['x-oska-time'],nonce=request.headers['x-oska-nonce'],tenant=request.headers['x-oska-tenant'],actual=request.headers['x-oska-signature'];
  if(!secret||secret.length<48||!/^\d{13}$/.test(time||'')||Math.abs(now-Number(time))>60000||!/^[-a-zA-Z0-9]{20,80}$/.test(nonce||'')||!(/^[a-f0-9]{64}$/).test(tenant||'')||!(/^[a-f0-9]{64}$/).test(actual||''))throw new Error('Invalid server authorization.');
  const expected=signature(secret,{time,nonce,tenant,method:request.method,path:request.url,body});
  if(!timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex')))throw new Error('Invalid server authorization.');
  for(const [key,expiry] of seen)if(expiry<now)seen.delete(key);
  if(seen.has(nonce)||seen.size>10000)throw new Error('Replay or server request limit.');
  seen.set(nonce,now+120000);return tenant;
}
export function callbackFor(flow,raw){
  if(typeof raw!=='string'||raw.length>16384||Date.now()>flow.expires)throw new Error('Sign-in expired or response too long.');
  const url=new URL(raw),expected=new URL(flow.redirect);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.origin!==expected.origin||url.pathname!==expected.pathname||url.username||url.password||url.hash||url.searchParams.getAll('state').length!==1||url.searchParams.get('state')!==flow.state||url.searchParams.getAll('code').length!==1||!url.searchParams.get('code')||url.searchParams.has('error'))throw new Error('This redirect does not belong to the active sign-in.');
  if([...url.searchParams.keys()].some(k=>!['code','state','scope','authuser','prompt','iss'].includes(k)))throw new Error('Unexpected sign-in response.');
  return url;
}
export function googleFlow(raw){
  const url=new URL(raw),redirect=url.searchParams.get('redirect_uri'),state=url.searchParams.get('state');
  if(url.origin!=='https://accounts.google.com'||url.username||url.password||url.hash||url.pathname!=='/o/oauth2/v2/auth'||url.searchParams.get('response_type')!=='code'||url.searchParams.getAll('state').length!==1||url.searchParams.getAll('redirect_uri').length!==1||!state||state.length>512||!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}\/$/.test(redirect||'')||Number(new URL(redirect).port)>65535)throw new Error('Unexpected Google authorization address.');
  return {url:raw,redirect,state,expires:Date.now()+300000};
}
