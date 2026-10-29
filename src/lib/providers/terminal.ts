import {spawn} from 'node:child_process';
import path from 'node:path';
import {AppError} from '../contracts';
import {environment} from './antigravity';

function literal(value:string){return "'"+value.replaceAll("'","''")+"'";}
export function terminalLauncher(command:string,cwd:string){
  const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const encoded=Buffer.from(command,'utf16le').toString('base64');
  // Node's detached child can start without an interactive console. Ask Windows
  // explicitly to create a normal visible window instead of treating spawn as proof.
  const launch=`$ErrorActionPreference='Stop'; Start-Process -FilePath ${literal(powershell)} -WorkingDirectory ${literal(cwd)} -WindowStyle Normal -ArgumentList '-NoLogo -NoProfile -NoExit -EncodedCommand ${encoded}' -ErrorAction Stop | Out-Null`;
  return {powershell,args:['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(launch,'utf16le').toString('base64')]};
}
export async function openTerminal(command:string,cwd:string){
  const {powershell,args}=terminalLauncher(command,cwd);
  await new Promise<void>((resolve,reject)=>{
    // Only the short launcher is hidden. The installer/login window is visible;
    // its output and any login material are never piped into OSKA.
    const launcher=spawn(powershell,args,{cwd,env:environment(),shell:false,windowsHide:true,stdio:['ignore','ignore','ignore']});
    const timeout=setTimeout(()=>{launcher.kill();reject(new AppError('TERMINAL_TIMEOUT','Windows did not confirm the terminal launch. Try again or use the manual command.',504));},15000);
    launcher.once('error',()=>{clearTimeout(timeout);reject(new AppError('TERMINAL','Windows could not open PowerShell. Use the manual command below.',503));});
    launcher.once('close',code=>{clearTimeout(timeout);if(code===0)resolve();else reject(new AppError('TERMINAL','Windows rejected the PowerShell window launch. Retry or use the manual command.',503));});
  });
}
