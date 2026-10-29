import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,copyFile,rename,constants} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {z} from 'zod';
import {AppError} from '../contracts';
import {blockedTools,executable} from './antigravity';
import {openTerminal} from './terminal';

export const setupAction=z.enum(['install','signin','safeguards']);
export type SetupAction=z.infer<typeof setupAction>;
export const setupApproval=z.object({action:setupAction,token:z.uuid(),approved:z.literal(true)}).strict();
export type SetupPreview={action:SetupAction;token:string;title:string;description:string;source:string;script:string;sha256:string;expiresAt:number};
const state=globalThis as unknown as {oskaSetupApprovals?:Map<string,SetupPreview>;oskaSetupBusy?:boolean};
const approvals=state.oskaSetupApprovals??=new Map<string,SetupPreview>();
const installerUrl='https://antigravity.google/cli/install.ps1';
export function psLiteral(value:string){return "'"+value.replaceAll("'","''")+"'";}
export async function prepareSetup(action:SetupAction):Promise<SetupPreview>{
  if(process.platform!=='win32')throw new AppError('WINDOWS_REQUIRED','Web setup currently supports Windows. Follow the official CLI guide on this platform.',409);
  let script='',title='',description='',source='OSKA local setup';
  if(action==='install'){
    title='Install official Antigravity CLI';source=installerUrl;
    description='Install the official CLI, then start Google sign-in in the same visible PowerShell window. The installer writes agy into your Windows user profile and may update your user PATH. Complete any first-run choices and Google sign-in there. OSKA never receives your credentials. No administrator elevation is requested.';
    let response:Response;try{response=await fetch(installerUrl,{redirect:'error',signal:AbortSignal.timeout(20000),cache:'no-store'});}catch{throw new AppError('INSTALL_DOWNLOAD','Could not download the official Google installer. Check your network and retry, or use the official installation guide.',502);}
    if(!response.ok)throw new AppError('INSTALL_DOWNLOAD',`Official installer returned HTTP ${response.status}.`,502);
    script=await response.text();
    if(script.length>100000||!script.includes('agy.exe')||!script.includes('$'))throw new AppError('INSTALL_SOURCE','Unexpected installer content. Use the official installation guide.',502);
  }else if(action==='signin'){
    const bin=await executable();
    title='Sign in with Google through official agy';
    description='Open the official CLI in a visible local terminal. Complete Google sign-in in the browser opened by agy. OSKA does not capture terminal output, passwords, OAuth codes or tokens. A terminal opening is not proof of authorization.';
    script=`& ${psLiteral(bin)}`;
  }else{
    title='Enable OSKA cost safeguards';
    description='Back up and update your official CLI settings: disable G1 credit fallback, require strict permissions and deny CLI tools globally. Unrelated settings are preserved. This also restricts normal interactive agy sessions. You can restore the backup later. Google account overages must be set to Never separately.';
    script=await readFile(path.resolve('scripts/configure-antigravity.ps1'),'utf8');
  }
  const preview={action,token:randomUUID(),title,description,source,script,sha256:createHash('sha256').update(script).digest('hex'),expiresAt:Date.now()+300000};
  for(const [key,value] of approvals)if(value.expiresAt<Date.now())approvals.delete(key);
  if(approvals.size>20)approvals.clear();approvals.set(preview.token,preview);
  return preview;
}
export function consumeSetupApproval(input:z.infer<typeof setupApproval>){
  const preview=approvals.get(input.token);
  if(!preview||preview.action!==input.action||preview.expiresAt<Date.now())throw new AppError('APPROVAL_EXPIRED','Setup approval expired or does not match. Review this action again.',409);
  approvals.delete(input.token);return preview;
}
export async function runSetup(input:z.infer<typeof setupApproval>){
  if(process.platform!=='win32')throw new AppError('WINDOWS_REQUIRED','Web setup is supported on Windows only.',409);
  if(state.oskaSetupBusy)throw new AppError('SETUP_BUSY','Windows is opening a setup window. Wait a moment, then retry if it did not appear.',409);
  const preview=consumeSetupApproval(input);state.oskaSetupBusy=true;
  try{
    if(input.action==='safeguards'){
      const filename=path.join(os.homedir(),'.gemini','antigravity-cli','settings.json');
      await mkdir(path.dirname(filename),{recursive:true});
      let config:Record<string,unknown>={};let original:string|undefined;
      try{original=await readFile(filename,'utf8');config=JSON.parse(original.replace(/^\uFEFF/,''));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new AppError('SETTINGS_READ','Existing CLI settings could not be safely read. Repair them in agy before retrying.',409);}
      if(!config||typeof config!=='object'||Array.isArray(config)||config.modelProvider)throw new AppError('SETTINGS_PROVIDER','An alternate provider or invalid configuration is present. Review account authentication in official agy first.',409);
      const existing=config.permissions;
      if(existing!==undefined&&(!existing||typeof existing!=='object'||Array.isArray(existing)))throw new AppError('SETTINGS_READ','Existing permissions must be a JSON object.',409);
      const permissions=(existing??{}) as Record<string,unknown>;
      if(permissions.deny!==undefined&&(!Array.isArray(permissions.deny)||permissions.deny.some(rule=>typeof rule!=='string')))throw new AppError('SETTINGS_READ','Existing deny rules could not be preserved safely.',409);
      const backup=original!==undefined?`${filename}.oska-backup-${Date.now()}`:null;
      if(backup)await copyFile(filename,backup,constants.COPYFILE_EXCL);
      const next={...config,useG1Credits:false,toolPermission:'strict',allowNonWorkspaceAccess:false,permissions:{...permissions,deny:[...new Set([...(permissions.deny as string[]??[]),...blockedTools])]}};
      const temporary=`${filename}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(next,null,2),{flag:'wx',mode:0o600});await rename(temporary,filename);
      return {status:'safeguards_applied',message:'CLI safeguards applied. Existing settings were preserved. Review Google account overages separately.',backupCreated:!!backup};
    }
    const dir=path.resolve('data','connection');await mkdir(dir,{recursive:true});
    if(input.action==='install'){
      // Execute the exact reviewed snapshot, never refetch mutable remote code after approval.
      const snapshot=path.join(dir,`official-install-${preview.token}.ps1`);await writeFile(snapshot,preview.script,{flag:'wx',mode:0o600});
      await openTerminal(`$ErrorActionPreference='Stop'; try { Write-Host 'OSKA: installing the official Google CLI, then starting Google sign-in.'; & ([scriptblock]::Create([IO.File]::ReadAllText(${psLiteral(snapshot)}))); $oskaAgy=Join-Path $env:LOCALAPPDATA 'agy\\bin\\agy.exe'; if (-not (Test-Path -LiteralPath $oskaAgy)) { throw 'Installation did not produce agy.exe. Review the installer error above.' }; Write-Host 'Complete first-run choices and official Google sign-in below.'; & $oskaAgy } catch { Write-Host $_.Exception.Message -ForegroundColor Red }; Write-Host 'Return to OSKA and click Refresh models.'`,dir);
    }else await openTerminal(`Write-Host 'Complete official Google sign-in, then return to OSKA. OSKA does not read this terminal.'; ${preview.script}`,dir);
    return {status:'terminal_opened',message:input.action==='install'?'Windows accepted the installer and Google sign-in window launch. Complete any CLI first-run choices and Google login there. If no window appeared, use Retry sign-in or the manual command.':'Windows accepted the official Google sign-in window launch. Complete login there. If no window appeared, retry or use the manual command.'};
  }finally{state.oskaSetupBusy=false;}
}
