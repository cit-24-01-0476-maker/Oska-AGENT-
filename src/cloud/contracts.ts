import {z} from 'zod';
export const cloudProviders=['antigravity','chatgpt','codex'] as const;
export const memberSchema=z.object({name:z.string().trim().min(1).max(60),role:z.string().trim().min(1).max(200),provider:z.enum(cloudProviders),modelId:z.string().trim().max(150).nullable().default(null)}).strict();
export const teamSchema=z.object({name:z.string().trim().min(1).max(100),objective:z.string().trim().min(1).max(5000),members:z.array(memberSchema).min(1).max(8)}).strict();
export const cloudTaskSchema=z.object({prompt:z.string().trim().min(1).max(24000),teamId:z.uuid().optional(),requestId:z.uuid()}).strict();
export type TeamInput=z.infer<typeof teamSchema>;
export type CloudTeam=TeamInput&{id:string;createdAt:string;status:'DRAFT'};
export type CloudProfile={sub:string;email:string;name:string};
export const providerAvailability=[
  {id:'antigravity',name:'Google Antigravity',status:'unsupported_cloud_quota',models:[],message:'The tested account-quota interface uses a user-local official CLI. Browser-only Vercel access to that quota is not implemented or verified.',docs:'https://antigravity.google/docs/cli/headless/'},
  {id:'chatgpt',name:'ChatGPT plan',status:'provider_approval_required',models:[],message:'Official plan-usage documentation directs remotely hosted apps to the provider interest/approval process. Website identity login alone does not authorize model usage.',docs:'https://developers.openai.com/siwc/token-sharing-open-source'},
  {id:'codex',name:'Codex',status:'provider_approval_required',models:[],message:'Codex app-server is an official harness, not a separate unrestricted cloud model entitlement. Hosted plan usage must follow the provider-supported approval path.',docs:'https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server'}
] as const;
