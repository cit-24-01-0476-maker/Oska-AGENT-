// Benign Windows launch diagnostic. No installation, credentials or login.
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {openTerminal} from '../src/lib/providers/terminal';
import {psLiteral} from '../src/lib/providers/setup';
const folder=path.resolve('data','connection');await mkdir(folder,{recursive:true});
const marker=path.join(folder,`terminal-check-${Date.now()}.txt`);
await openTerminal(`Write-Host 'OSKA terminal launch check - no login or installation.'; [IO.File]::WriteAllText(${psLiteral(marker)},'OSKA_TERMINAL_OK'); Start-Sleep -Milliseconds 800; exit`,folder);
let success=false;
for(let attempt=0;attempt<40;attempt++){
  try{success=(await readFile(marker,'utf8'))==='OSKA_TERMINAL_OK';if(success)break;}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
}
if(!success)throw new Error('Windows accepted the launcher but its terminal did not execute the diagnostic.');
console.log('PASS: Windows launched the target PowerShell and executed the harmless diagnostic. No Google login or installer was run.');
