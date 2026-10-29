import { PrismaClient } from '@prisma/client';
const globalDb = globalThis as unknown as { oskaDb?: PrismaClient };
export const db = globalDb.oskaDb ?? new PrismaClient({datasourceUrl: process.env.DATABASE_URL || 'file:./oska.db'});
globalDb.oskaDb = db;
