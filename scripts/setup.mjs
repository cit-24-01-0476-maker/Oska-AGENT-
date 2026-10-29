import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {existsSync,copyFileSync} from 'node:fs';
if(!existsSync('.env'))copyFileSync('.env.example','.env');
process.loadEnvFile('.env');
const configured=process.env.DATABASE_URL||'file:./oska.db';
if(configured.startsWith('file:./'))process.env.DATABASE_URL='file:'+path.resolve('prisma',configured.slice(7)).replaceAll('\\','/');
const cli=path.resolve('node_modules/prisma/build/index.js');
for(const args of process.argv.includes('--migrate-only')?[['migrate','deploy']]:[['generate'],['migrate','deploy']]){
  const run=spawnSync(process.execPath,[cli,...args],{shell:false,stdio:'inherit',env:process.env});
  if(run.status!==0)process.exit(run.status??1);
}
