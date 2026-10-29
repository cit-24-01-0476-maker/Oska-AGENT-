import {neon} from '@neondatabase/serverless';
import {AppError} from '@/lib/contracts';
export function cloudDatabaseUrl(){const value=process.env.CLOUD_DATABASE_URL||process.env.DATABASE_URL;return value&&/^postgres(?:ql)?:\/\//.test(value)?value:null;}
export function cloudDb(){const url=cloudDatabaseUrl();if(!url)throw new AppError('DATABASE_SETUP_REQUIRED','Connect a Postgres database and configure CLOUD_DATABASE_URL before saving cloud workspaces.',503);return neon(url);}
