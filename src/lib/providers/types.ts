import type {CatalogModel,ProviderHealth,StreamEvent} from '../contracts';
export interface AIProvider {
  id:string;displayName:string;
  connect():Promise<{instructions:string;command:string}>;
  disconnect():Promise<void>;
  checkHealth():Promise<ProviderHealth>;
  listModels():Promise<CatalogModel[]>;
  execute(options:ExecutionOptions):Promise<ProviderResult>;
  stream(options:ExecutionOptions):Promise<ProviderResult>;
  cancel(taskId:string):Promise<void>;
}
export type ExecutionOptions={taskId:string;prompt:string;modelId:string;cwd:string;conversationId?:string;signal:AbortSignal;onEvent:(event:StreamEvent)=>Promise<void>};
export type ProviderResult={response:string;conversationId?:string;tokens?:number};
