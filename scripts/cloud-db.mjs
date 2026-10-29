import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
try{process.loadEnvFile('.env');}catch{}
const url=process.env.CLOUD_DATABASE_URL||process.env.DATABASE_URL;
if(!url||!/^postgres(?:ql)?:\/\//.test(url))throw new Error('Set CLOUD_DATABASE_URL to your cloud Postgres connection string. No database is provisioned automatically.');
const sql=neon(url),source=await readFile(new URL('../cloud/migrations/001_initial.sql',import.meta.url),'utf8');
for(const statement of source.split(';').map(s=>s.trim()).filter(Boolean))await sql.query(statement,[]);
console.log('Cloud schema initialized. Existing tables and data were preserved.');
