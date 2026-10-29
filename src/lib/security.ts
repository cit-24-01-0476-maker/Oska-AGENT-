import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import path from 'node:path';
import { AppError } from './contracts';
const buckets=new Map<string,{count:number;until:number}>();
export function guard(request:Request){
  const url=new URL(request.url), host=request.headers.get('host');
  const allowedHosts=['127.0.0.1','localhost','[::1]'];
  let hostUrl:URL;try{hostUrl=new URL(`http://${host}`);}catch{throw new AppError('LOCAL_ONLY','Invalid local Host header.',403);}
  if(!allowedHosts.includes(url.hostname)||!allowedHosts.includes(hostUrl.hostname)||hostUrl.port!==url.port)throw new AppError('LOCAL_ONLY','OSKA execution is restricted to localhost.',403);
  const origin=request.headers.get('origin');
  const expectedOrigin=`${url.protocol}//${host}`;
  if(origin && origin!==expectedOrigin)throw new AppError('ORIGIN','Cross-origin requests are blocked.',403);
  if(request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('ORIGIN','Cross-site requests are blocked.',403);
  if(!['GET','HEAD'].includes(request.method)&&origin!==expectedOrigin)throw new AppError('CSRF','A same-origin request is required.',403);
  const key=['GET','HEAD'].includes(request.method)?'read':'write';
  const now=Date.now(); let bucket=buckets.get(key);
  if(!bucket||bucket.until<now){bucket={count:0,until:now+60000};buckets.set(key,bucket);}
  if(++bucket.count>(key==='read'?600:80))throw new AppError('RATE_LIMIT','Too many requests. Try again in a minute.',429);
}
export function safePath(root:string,name:string){
  if(!name||/[\x00-\x1f]/.test(name)||name.includes(':')||name.includes('\\')||path.isAbsolute(name))throw new AppError('PATH','Invalid workspace path.');
  const target=path.resolve(root,name), relative=path.relative(path.resolve(root),target);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new AppError('PATH','Path escapes the task workspace.');
  return target;
}
export function isPublicIp(address:string){
  if(isIP(address)===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a>=224||a===192&&b===0||a===198&&(b===18||b===19));}
  // Fail closed on mapped, local, multicast and non-global IPv6.
  return isIP(address)===6 && /^[23][0-9a-f]{3}:/i.test(address)&&!address.toLowerCase().startsWith('2001:db8:');
}
export async function publicUrl(raw:string){
  let url:URL;try{url=new URL(raw);}catch{throw new AppError('URL','Enter a valid public HTTPS URL.');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!['','80','443'].includes(url.port))throw new AppError('SSRF','Only public HTTP/HTTPS on standard ports is allowed.');
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  if(hostname==='localhost'||hostname.endsWith('.local')||hostname.endsWith('.internal'))throw new AppError('SSRF','Private network addresses are blocked.');
  const addresses=isIP(hostname)?[{address:hostname}]:await lookup(hostname,{all:true});
  if(!addresses.length||addresses.some(a=>!isPublicIp(a.address)))throw new AppError('SSRF','This URL resolves to a private or reserved address.');
  return {url,addresses};
}
export function validateCommand(executable:string,args:string[]){
  // The application never accepts model-generated commands. Only this exact read-only probe is supported.
  if(executable!=='node'||args.length!==1||args[0]!=='--version')throw new AppError('COMMAND_DENIED','Arbitrary command execution is disabled. Only the fixed Node version probe is supported.',403);
}
export function redact(text:string){return text.replace(/(Bearer\s+)[\w.\-]+/gi,'$1[REDACTED]').replace(/((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,\"}]+/gi,'$1[REDACTED]').slice(0,24000);}
export function equalSecret(a:string,b:string){return a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
