import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {signature,verifyRequest,tenantId,googleFlow,callbackFor} from '../security.mjs';
import {workerSpec} from '../gateway.mjs';
import {providerEnvironment,acpModels} from '../providers.mjs';
import {join} from 'node:path';
const secret='test-only-'.repeat(8);
test('signed requests bind user, body and path; stale, forged and replayed messages fail',()=>{
  const values={time:Date.now().toString(),nonce:randomUUID(),tenant:tenantId('owner-A'),method:'POST',path:'/jobs',body:'{"action":"models"}'};
  const headers={'x-oska-time':values.time,'x-oska-nonce':values.nonce,'x-oska-tenant':values.tenant,'x-oska-signature':signature(secret,values)};
  const request={headers,method:values.method,url:values.path},seen=new Map();
  assert.equal(verifyRequest(secret,request,values.body,seen),values.tenant);
  assert.throws(()=>verifyRequest(secret,request,values.body,seen));
  assert.throws(()=>verifyRequest(secret,{...request,url:'/complete'},values.body,new Map()));
  assert.throws(()=>verifyRequest(secret,request,values.body+' ',new Map()));
  assert.throws(()=>verifyRequest(secret,{...request,headers:{...headers,'x-oska-tenant':tenantId('owner-B')}},values.body,new Map()));
  assert.throws(()=>verifyRequest(secret,request,values.body,new Map(),Date.now()+120000));
});
test('Google callbacks cannot become an SSRF proxy or cross-flow authorization',()=>{
  const flow=googleFlow('https://accounts.google.com/o/oauth2/v2/auth?response_type=code&state=exact-state&redirect_uri=http%3A%2F%2F127.0.0.1%3A45678%2F');
  assert.equal(callbackFor(flow,'http://127.0.0.1:45678/?state=exact-state&code=private').hostname,'127.0.0.1');
  for(const raw of ['http://127.0.0.1:45679/?state=exact-state&code=x','http://169.254.169.254/?state=exact-state&code=x','http://127.0.0.1:45678/?state=other&code=x','http://127.0.0.1:45678/?state=exact-state&state=exact-state&code=x','http://127.0.0.1:45678/other?state=exact-state&code=x','http://user:password@127.0.0.1:45678/?state=exact-state&code=x'])assert.throws(()=>callbackFor(flow,raw));
  assert.throws(()=>callbackFor({...flow,expires:0},'http://127.0.0.1:45678/?state=exact-state&code=x'));
});
test('workers have distinct volumes, no host mounts and private ports',()=>{
  const a=workerSpec(tenantId('A'),'oska-worker:1','a'.repeat(64));const b=workerSpec(tenantId('B'),'oska-worker:1','b'.repeat(64));
  assert.notEqual(a.name,b.name);assert(a.args.includes('--read-only'));assert(a.args.includes('127.0.0.1::8788'));assert(!a.args.join(' ').includes('docker.sock'));assert(!a.args.includes('--privileged'));assert(!a.args.includes('--network=host'));assert.throws(()=>workerSpec('../../escape','oska-worker:1','x'));
});
test('provider children cannot inherit platform secrets or API billing configuration',()=>{
  process.env.OPENAI_API_KEY='never-forward';process.env.OSKA_AGENT_SECRET='never-forward';
  const env=providerEnvironment('/data/account-A');assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.OSKA_AGENT_SECRET,undefined);assert.equal(env.OSKA_WORKER_TOKEN,undefined);assert.equal(env.GEMINI_HOME,join('/data/account-A','.antigravity'));
  delete process.env.OPENAI_API_KEY;delete process.env.OSKA_AGENT_SECRET;
});
test('ACP models come only from returned config, including grouped catalogs',()=>{
  assert.deepEqual(acpModels({}).models,[]);
  assert.deepEqual(acpModels({configOptions:[{id:'model-choice',category:'model',options:[{group:'Gemini',options:[{value:'actual-model',name:'Actual Model'}]}]}]}),{models:[{id:'actual-model',name:'Actual Model'}],configId:'model-choice'});
});
