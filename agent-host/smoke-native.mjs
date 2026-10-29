import assert from 'node:assert/strict';
import {Providers} from './providers.mjs';
import {execFileSync} from 'node:child_process';
// Runs only in a new, isolated worker image. No login, tokens, model inference or quota use.
const providers=new Providers('/data/native-smoke');
try{
  console.log(execFileSync('/usr/local/bin/codex',['--version'],{encoding:'utf8'}).trim());
  const codex=await providers.client('codex');
  assert(codex.initialized);
  const account=await codex.request('account/read',{refreshToken:false});
  assert.equal(account.account,null);
  console.log('Official Codex app-server initialized in an empty isolated home; no account connected.');
  const google=await providers.client('antigravity');
  assert.equal(google.initialized.protocolVersion,1);
  assert(['antigravity-acp','Google Antigravity'].includes(google.initialized.agentInfo?.name));
  console.log('Official Antigravity ACP runtime initialized; no login or inference requested.');
}finally{providers.close();}
