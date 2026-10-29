import { z } from 'zod';
export const modes = ['Chat','Research','Browser','Code','Files'] as const;
export const taskInput = z.object({prompt:z.string().trim().min(1).max(24000),mode:z.enum(modes),modelId:z.string().max(150).optional(),requestId:z.uuid(),url:z.url().max(2048).optional()});
export const settingsInput = z.object({theme:z.enum(['dark','light']).optional(),onboarded:z.boolean().optional(),overagesConfirmed:z.boolean().optional()}).strict();
export type TaskInput = z.infer<typeof taskInput>;
export type Status = 'CREATED'|'PLANNING'|'WAITING_FOR_APPROVAL'|'RUNNING'|'PAUSED'|'COMPLETED'|'FAILED'|'CANCELED';
const transitions:Record<Status,Status[]>={CREATED:['PLANNING','CANCELED'],PLANNING:['WAITING_FOR_APPROVAL','FAILED','CANCELED'],WAITING_FOR_APPROVAL:['RUNNING','CANCELED'],RUNNING:['COMPLETED','FAILED','CANCELED','PAUSED'],PAUSED:['WAITING_FOR_APPROVAL','CANCELED'],COMPLETED:[],FAILED:['WAITING_FOR_APPROVAL','CANCELED'],CANCELED:['WAITING_FOR_APPROVAL']};
export function canTransition(from:string,to:Status){return transitions[from as Status]?.includes(to)??false;}
export class AppError extends Error {constructor(public code:string,message:string,public status=400){super(message);}}
export type CatalogModel={id:string;displayName:string;available:boolean};
export type ProviderHealth={status:string;installed:boolean;version?:string;message:string;models:CatalogModel[];costSafe:boolean;authVerified:boolean};
export type StreamEvent={event:string;[key:string]:unknown};
