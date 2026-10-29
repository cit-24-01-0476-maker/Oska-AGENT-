'use client';

import {useEffect,useRef,useState} from 'react';
import {Check,ChevronRight,Copy,Download,ExternalLink,Loader2,RefreshCw,ShieldCheck,Terminal,X} from 'lucide-react';
import {Button} from './ui/button';
import type {ProviderHealth} from '@/lib/contracts';
import type {SetupAction,SetupPreview} from '@/lib/providers/setup';

type Props={provider:ProviderHealth|null;refresh:()=>Promise<ProviderHealth|undefined>;refreshModels:()=>Promise<void>;prepareTest:()=>void;openWorkspace:()=>void};
async function request<T>(url:string,body?:unknown):Promise<T>{
  const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Setup failed. Try again.');return data;
}
const installCommand='irm https://antigravity.google/cli/install.ps1 | iex';
export function ConnectionSetup({provider,refresh,refreshModels,prepareTest,openWorkspace}:Props){
  const [preview,setPreview]=useState<SetupPreview|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[waiting,setWaiting]=useState(false);
  const [approved,setApproved]=useState(false),[overages,setOverages]=useState(false);
  const polling=useRef(false),dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!waiting)return;let stopped=false;const deadline=Date.now()+300000;
    const timer=setInterval(async()=>{
      if(polling.current||Date.now()>deadline){if(Date.now()>deadline)setWaiting(false);return;}
      polling.current=true;try{const health=await refresh();if(!stopped&&health?.installed&&health.models.length){setWaiting(false);setMessage('CLI and real model catalog detected. Complete safeguards and approve a test request to verify account access.');}}finally{polling.current=false;}
    },5000);
    return()=>{stopped=true;clearInterval(timer);};
  },[waiting,refresh]);
  useEffect(()=>{
    if(!preview)return;const previous=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function keyboard(event:KeyboardEvent){
      if(event.key==='Escape'&&!busy)setPreview(null);
      if(event.key!=='Tab')return;
      const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,summary,a[href]')??[]);const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    document.addEventListener('keydown',keyboard);return()=>{document.removeEventListener('keydown',keyboard);previous?.focus();};
  },[preview,busy]);
  async function review(action:SetupAction){setBusy(true);setError('');setApproved(false);try{setPreview(await request<SetupPreview>(`/api/providers/antigravity/setup?action=${action}`));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function execute(){if(!preview||!approved)return;setBusy(true);setError('');try{const result=await request<{status:string;message:string}>('/api/providers/antigravity/setup',{action:preview.action,token:preview.token,approved:true});setMessage(result.message);setWaiting(result.status==='terminal_opened');setPreview(null);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function copy(command:string){try{await navigator.clipboard.writeText(command);setMessage('Command copied. Paste it into your own PowerShell window.');}catch{setError('Clipboard unavailable. Select and copy the displayed command.');}}
  const installed=provider?.installed??false,catalog=!!provider?.models.length;
  const steps=[
    {number:1,done:installed,title:'Install the official CLI',description:'Install Google’s agy CLI on this Windows computer. Review the official installer, then launch it from here.',label:installed?'Review installer again':'Install CLI',action:'install' as const,disabled:false,icon:Download},
    {number:2,done:false,title:'Sign in with Google',description:'Open official agy locally. It opens Google’s sign-in flow when needed. Finish it in the browser, then return here.',label:'Sign in with Google',action:'signin' as const,disabled:!installed,icon:Terminal},
    {number:3,done:provider?.costSafe??false,title:'Enable cost safeguards',description:'Turn off credit fallback and restrict CLI tools. This changes global agy settings after your approval, with a backup.',label:provider?.costSafe?'Review safeguards':'Enable safeguards',action:'safeguards' as const,disabled:!installed,icon:ShieldCheck}
  ];
  if(provider?.costSafe&&catalog)return <section className="connection-setup panel existing-ai-connection" aria-labelledby="existing-ai-title"><span className="existing-ai-check"><Check size={24}/></span><div className="section-overline">YOUR EXISTING GOOGLE AI ACCOUNT</div><h2 id="existing-ai-title">Your AI is ready in OSKA.</h2><p>{provider.authVerified?'A real model request succeeded using your signed-in account.':'Your official local CLI is signed in and its real model catalog is available. Model entitlement is confirmed by the first successful request.'}</p><div className="existing-model-count">{provider.models.length} real models available <span>·</span> {provider.version}</div><div className="approval-actions"><Button onClick={openWorkspace}>Open Agent Workspace <ChevronRight size={15}/></Button><Button variant="outline" onClick={()=>void refreshModels()}>Refresh models</Button></div><small>No new Google OAuth client or API key is needed. OSKA applies no-credit-fallback safeguards to each model request.</small></section>;
  return <section className="connection-setup panel" aria-labelledby="connection-setup-title">
    <div className="setup-web-heading"><div><span className="section-overline">CONNECT FROM YOUR WORKSPACE</span><h2 id="connection-setup-title">Your Google AI, in a few clear steps.</h2><p>මෙතැනින් CLI install කර Google sign-in එක පටන් ගන්න පුළුවන්.</p><Button className="google-connect-button" disabled={busy} onClick={()=>void review(installed?'signin':'install')}><span className="google-letter" aria-hidden="true">G</span>{busy?'Preparing connection…':'Connect Google AI via CLI'}</Button><small className="google-connect-note">{installed?'Opens Google authorization through the official local CLI.':'Installs the official CLI first, then starts Google sign-in. Review and approve once.'}</small></div><span className="tag">WINDOWS · LOCAL ONLY</span></div>
    {message&&<div className="setup-feedback" role="status"><Check size={16}/><span>{message}</span></div>}
    {waiting&&<div className="setup-launch-recovery"><p>Window එක පේන්නේ නැද්ද? Sign-in එක නැවත open කරන්න හෝ පහළ manual command එක භාවිතා කරන්න.</p><Button variant="outline" disabled={busy} onClick={()=>void review(installed?'signin':'install')}>Retry Google sign-in</Button><Button variant="ghost" onClick={()=>setWaiting(false)}>Stop checking</Button></div>}
    {error&&<div className="setup-feedback setup-error" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss setup error" onClick={()=>setError('')}><X size={15}/></button></div>}
    <div className="setup-web-steps">{steps.map(step=><article key={step.number} className={step.done?'setup-step-done':''}><span className="setup-web-number">{step.done?<Check size={16}/>:step.number}</span><div><h3>{step.title}</h3><p>{step.description}</p>{step.number===2&&<small>{catalog?'Model catalog found. Account authorization still requires a successful model test.':'Google credentials stay with the official CLI. OSKA never captures login tokens.'}</small>}<Button variant={step.done?'outline':'default'} disabled={busy||step.disabled} onClick={()=>void review(step.action)}><step.icon size={15}/>{step.label}</Button></div></article>)}</div>
    <div className="setup-discovery"><div><h3>Discover models & verify access</h3><p>{installed?`CLI detected${provider?.version?`: ${provider.version}`:''}.`:'Waiting for official agy installation.'} {catalog?`${provider?.models.length} real models found.`:'No model catalog loaded yet.'}</p></div><div><Button variant="outline" disabled={busy} onClick={()=>{setError('');void refresh();}}><RefreshCw size={14} className={waiting?'spin':''}/>{waiting?'Check progress':'Check installation'}</Button><Button variant="outline" disabled={!installed||busy} onClick={()=>void refreshModels()}>Refresh models</Button></div></div>
    <div className="setup-account-overages"><label className="checkbox-row"><input type="checkbox" checked={overages} onChange={e=>setOverages(e.target.checked)}/> I set AI Credit Overages to Never in my Google account.</label><a href="https://antigravity.google/docs/plans/" target="_blank" rel="noreferrer">Official quota settings <ExternalLink size={12}/></a><Button disabled={!provider?.costSafe||!catalog||!overages} onClick={prepareTest}>Prepare a real connection test <ChevronRight size={15}/></Button><small>The test creates a reviewable task. It uses plan quota only after you approve execution.</small></div>
    <details className="setup-manual"><summary>Prefer manual setup? Commands and troubleshooting</summary><p>If a terminal does not open, run these in a new PowerShell window. Administrator mode is not normally needed.</p>{[installCommand,'agy','& "$env:LOCALAPPDATA\\agy\\bin\\agy.exe" --version'].map(command=><div className="setup-copy-command" key={command}><code>{command}</code><button className="icon-button" aria-label={`Copy ${command}`} onClick={()=>void copy(command)}><Copy size={15}/></button></div>)}<p>OSKA also detects the default installation folder without a server restart. If Windows blocks the installer, review the message in its terminal; OSKA does not bypass Windows policies.</p><a href="https://antigravity.google/docs/getting-started" target="_blank" rel="noreferrer">Official installation instructions <ExternalLink size={12}/></a></details>
    {preview&&<div className="modal-backdrop"><div ref={dialog} className="setup-review-modal" role="dialog" aria-modal="true" aria-labelledby="setup-review-title"><button className="modal-close icon-button" aria-label="Close setup approval" disabled={busy} onClick={()=>setPreview(null)}><X size={18}/></button><ShieldCheck size={28}/><h2 id="setup-review-title">{preview.title}</h2><p>{preview.description}</p><div className="setup-review-source"><strong>Source</strong><span>{preview.source}</span></div><details><summary>Review script and SHA-256</summary><code className="setup-sha">{preview.sha256}</code><pre>{preview.script}</pre></details><label className="checkbox-row"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> I approve this specific local setup action.</label>{error&&<p className="setup-error" role="alert">{error}</p>}<div className="approval-actions"><Button variant="outline" disabled={busy} onClick={()=>setPreview(null)}>Cancel</Button><Button disabled={!approved||busy} onClick={()=>void execute()}>{busy?<Loader2 className="spin" size={15}/>:<Check size={15}/>}Approve & {preview.action==='safeguards'?'apply':'open terminal'}</Button></div><small>Approval expires in five minutes. Opening a terminal does not confirm installation or account authorization.</small></div></div>}
  </section>;
}
