// Explicit live Postgres isolation check. Creates only synthetic test records and
// removes those records in finally. It never signs in users or calls model APIs.
import {randomUUID} from 'node:crypto';
import {cloudDb} from '../src/cloud/db';
import {listTeams,saveTeam,deleteTeam,recordTask,listTasks} from '../src/cloud/repository';
if(process.env.OSKA_CLOUD_DB_SMOKE!=='1'){console.log('SKIPPED: set OSKA_CLOUD_DB_SMOKE=1 to run the live cloud database test.');process.exit(0);}
const sql=cloudDb(),suffix=randomUUID();
const a={sub:`oska-smoke-a-${suffix}`,name:'Synthetic test A',email:'a@example.invalid'},b={sub:`oska-smoke-b-${suffix}`,name:'Synthetic test B',email:'b@example.invalid'};
try{
  for(const user of [a,b])await sql`INSERT INTO oska_cloud_users(id,email,name) VALUES(${user.sub},${user.email},${user.name})`;
  const team=await saveTeam(a,{name:'Isolation smoke team',objective:'Verify tenant-scoped database operations',members:[{name:'Planner',role:'Test role',provider:'antigravity',modelId:null}]});
  if(!(await listTeams(a)).some(item=>item.id===team.id))throw new Error('Owner could not retrieve its saved team.');
  if((await listTeams(b)).some(item=>item.id===team.id))throw new Error('Cross-user team leak.');
  let blocked=false;try{await deleteTeam(b,team.id);}catch(error){blocked=(error as {status?:number}).status===404;}if(!blocked)throw new Error('Cross-user delete was not rejected.');
  const task=await recordTask(a,{prompt:'Synthetic test goal. No model execution.',teamId:team.id,requestId:randomUUID()});if(task.status!=='BLOCKED_PROVIDER')throw new Error('Cloud task incorrectly implied execution.');
  if((await listTasks(b)).some(item=>item.id===task.id))throw new Error('Cross-user goal leak.');
  console.log('PASS: live Postgres save/read, cross-user isolation, delete protection and blocked-provider task persistence.');
}finally{
  for(const user of [a,b])await sql`DELETE FROM oska_cloud_users WHERE id=${user.sub}`;
  console.log('Synthetic test records removed.');
}
