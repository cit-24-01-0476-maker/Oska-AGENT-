import assert from 'node:assert/strict';
import {Providers} from './providers.mjs';
// Runs only in a new, isolated worker image. No login, tokens, model inference or quota use.
const providers=new Providers('/data/native-smoke');
try{
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
