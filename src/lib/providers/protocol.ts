import { AppError, type CatalogModel, type StreamEvent } from '../contracts';
export function parseModels(raw:string):CatalogModel[]{
  const text=raw.replace(/\x1b\[[0-9;]*m/g,'').trim();
  if(/(?:please sign in|not logged in|authentication required)/i.test(text))throw providerFailure(text);
  let rows:unknown[]=[];
  if(text.startsWith('[')||text.startsWith('{')){try{const json=JSON.parse(text);rows=Array.isArray(json)?json:json.models??[];}catch{throw new AppError('CATALOG','The CLI returned invalid model JSON.');}}
  else rows=text.split(/\r?\n/).flatMap(line=>{const match=line.trim().match(/^([a-z0-9][a-z0-9._:-]*-[a-z0-9._:-]+)(?:\t+| {2,})(.+)$/i);return match?[{id:match[1],displayName:match[2]}]:[];});
  const models=rows.flatMap(row=>{if(typeof row!=='object'||!row)return [];const item=row as Record<string,unknown>;const id=item.id??item.slug??item.modelId;const displayName=item.displayName??item.display_name??item.name??id;return typeof id==='string'&&/^[a-z0-9][a-z0-9._:-]{0,149}$/i.test(id)&&typeof displayName==='string'?[{id,displayName,available:item.available!==false}]:[];});
  if(!models.length)throw new AppError('CATALOG','No recognizable models were returned. Update the CLI and retry.');
  return [...new Map(models.map(m=>[m.id,m])).values()];
}
export class NdjsonParser {
  private buffer='';
  push(chunk:string):StreamEvent[]{this.buffer+=chunk;if(this.buffer.length>2_000_000)throw new AppError('PROTOCOL','CLI event exceeds the size limit.');const lines=this.buffer.split('\n');this.buffer=lines.pop()??'';return lines.filter(l=>l.trim()).map(l=>this.parse(l));}
  finish():StreamEvent[]{const last=this.buffer.trim();this.buffer='';return last?[this.parse(last)]:[];}
  private parse(line:string){let event:unknown;try{event=JSON.parse(line);}catch{throw new AppError('PROTOCOL','CLI returned malformed NDJSON. Update the CLI and retry.');}if(!event||typeof event!=='object'||!('event' in event)||typeof event.event!=='string')throw new AppError('PROTOCOL','Unrecognized CLI event.');return event as StreamEvent;}
}
export function providerFailure(message:string){
  if(/ENOENT|not found|cannot find/i.test(message))return new AppError('CLI_MISSING','Antigravity CLI was not found. Install official agy, then restart OSKA.',503);
  if(/quota|resource.exhausted|rate.limit|credits exhausted|429/i.test(message))return new AppError('QUOTA_EXHAUSTED','Your provider quota is exhausted. Wait for renewal. OSKA will not purchase credits or switch providers.',429);
  if(/auth|unauthorized|expired|sign.in|log.in|401|403/i.test(message))return new AppError('AUTH_REQUIRED','Google AI authorization is missing or expired. Run agy in your own terminal and sign in again.',401);
  return new AppError('PROVIDER_ERROR',message.slice(0,1000)||'The CLI failed without an error message.',502);
}
