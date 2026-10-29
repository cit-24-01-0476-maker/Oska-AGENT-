import {randomUUID} from 'node:crypto';
import {AppError} from '@/lib/contracts';
import {cloudDb} from './db';
import {type TeamInput,type CloudProfile} from './contracts';
export function assertOwner(owner:string,record:{owner_id:string}|undefined){if(!record||record.owner_id!==owner)throw new AppError('NOT_FOUND','Workspace record not found.',404);}
export async function listTeams(user:CloudProfile){const sql=cloudDb();return sql`SELECT id,name,objective,members,status,created_at AS "createdAt" FROM oska_cloud_teams WHERE owner_id=${user.sub} ORDER BY created_at DESC LIMIT 100`;}
export async function saveTeam(user:CloudProfile,team:TeamInput){
  const sql=cloudDb(),id=randomUUID();
  const rows=await sql`INSERT INTO oska_cloud_teams(id,owner_id,name,objective,members) VALUES(${id},${user.sub},${team.name},${team.objective},${JSON.stringify(team.members)}::jsonb) RETURNING id,name,objective,members,status,created_at AS "createdAt"`;return rows[0];
}
export async function deleteTeam(user:CloudProfile,id:string){const sql=cloudDb();const rows=await sql`DELETE FROM oska_cloud_teams WHERE id=${id}::uuid AND owner_id=${user.sub} RETURNING id`;if(!rows.length)throw new AppError('NOT_FOUND','Team not found.',404);}
export async function recordTask(user:CloudProfile,input:{prompt:string;teamId?:string;requestId:string}){
  const sql=cloudDb();
  if(input.teamId){const teams=await sql`SELECT owner_id FROM oska_cloud_teams WHERE id=${input.teamId}::uuid AND owner_id=${user.sub}`;assertOwner(user.sub,teams[0] as {owner_id:string}|undefined);}
  const reason='No provider has authorized browser-only subscription inference for this hosted deployment. No model request was sent and no credits were used.';
  const rows=await sql`INSERT INTO oska_cloud_tasks(id,owner_id,request_id,prompt,team_id,status,reason) VALUES(${randomUUID()},${user.sub},${input.requestId},${input.prompt},${input.teamId??null},'BLOCKED_PROVIDER',${reason}) ON CONFLICT(owner_id,request_id) DO UPDATE SET request_id=excluded.request_id RETURNING id,prompt,status,reason,created_at AS "createdAt"`;
  return rows[0];
}
export async function listTasks(user:CloudProfile){const sql=cloudDb();return sql`SELECT id,prompt,status,reason,created_at AS "createdAt" FROM oska_cloud_tasks WHERE owner_id=${user.sub} ORDER BY created_at DESC LIMIT 100`;}
export async function enforceWriteRate(user:CloudProfile){
  const sql=cloudDb(),window=Math.floor(Date.now()/60000);
  const rows=await sql`INSERT INTO oska_cloud_limits(owner_id,window_number,requests) VALUES(${user.sub},${window},1) ON CONFLICT(owner_id) DO UPDATE SET window_number=excluded.window_number, requests=CASE WHEN oska_cloud_limits.window_number=excluded.window_number THEN oska_cloud_limits.requests+1 ELSE 1 END RETURNING requests`;
  if(Number(rows[0]?.requests)>60)throw new AppError('RATE_LIMIT','Too many changes. Try again in a minute.',429);
}
