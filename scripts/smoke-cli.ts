import {antigravity} from '../src/lib/providers/antigravity';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
if(process.env.OSKA_CLI_SMOKE!=='1'){console.log('SKIPPED: set OSKA_CLI_SMOKE=1 only after official account login and safety configuration. This sends one real quota-consuming request.');process.exit(0);}
const health=await antigravity.checkHealth();if(!health.installed||!health.models.length||!health.costSafe){console.log(`SKIPPED: ${health.message}`);process.exit(0);}
const cwd=path.resolve('data','cli-smoke');await mkdir(cwd,{recursive:true});
const result=await antigravity.execute({taskId:'cli-smoke',prompt:'Reply with exactly OSKA_OK. Do not use tools.',modelId:health.models[0].id,cwd,signal:AbortSignal.timeout(90000),onEvent:async event=>{console.log(`CLI event: ${event.event}`);}});
if(!result.response.includes('OSKA_OK'))throw new Error('CLI smoke returned an unexpected response.');console.log('PASS: real authenticated inference completed.');
