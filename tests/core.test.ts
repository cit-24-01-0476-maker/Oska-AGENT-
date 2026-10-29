import {describe,it,expect} from 'vitest';
import {canTransition,taskInput,settingsInput} from '../src/lib/contracts';
import {parseModels,NdjsonParser,providerFailure} from '../src/lib/providers/protocol';
import {safePath,isPublicIp,publicUrl,validateCommand,guard,redact} from '../src/lib/security';
describe('task state machine',()=>{
  it('requires planning and explicit approval before execution',()=>{expect(canTransition('CREATED','RUNNING')).toBe(false);expect(canTransition('CREATED','PLANNING')).toBe(true);expect(canTransition('PLANNING','WAITING_FOR_APPROVAL')).toBe(true);expect(canTransition('WAITING_FOR_APPROVAL','RUNNING')).toBe(true);});
  it('supports cancellation, retry and stopped-process pause',()=>{expect(canTransition('RUNNING','CANCELED')).toBe(true);expect(canTransition('CANCELED','WAITING_FOR_APPROVAL')).toBe(true);expect(canTransition('RUNNING','PAUSED')).toBe(true);expect(canTransition('PAUSED','RUNNING')).toBe(false);expect(canTransition('FAILED','RUNNING')).toBe(false);expect(canTransition('COMPLETED','RUNNING')).toBe(false);});
});
describe('real catalog normalization',()=>{
  it('accepts actual agy 1.4 tab-separated models and detects zero-exit login errors',()=>{expect(parseModels('gemini-3.8-flash-high\tGemini 3.8 Flash (High)')[0].id).toBe('gemini-3.8-flash-high');expect(()=>parseModels('Error: Please sign in to view available models.')).toThrow('authorization');});
  it('parses documented two-column output and strips ANSI',()=>{expect(parseModels('\x1b[32mmodel-a-high    Model A (High)\x1b[0m\nmodel-b-medium  Model B (Medium)')).toEqual([{id:'model-a-high',displayName:'Model A (High)',available:true},{id:'model-b-medium',displayName:'Model B (Medium)',available:true}]);});
  it('parses JSON and availability without inventing models',()=>{expect(parseModels('{"models":[{"id":"actual-model","name":"Actual","available":false}]}')[0].available).toBe(false);expect(()=>parseModels('Sign in required')).toThrow();expect(()=>parseModels('{oops')).toThrow();});
});
describe('incremental NDJSON',()=>{
  it('handles split events and missing final newline',()=>{const p=new NdjsonParser();expect(p.push('{"event":"in')).toEqual([]);expect(p.push('it"}\n{"event":"result",')).toEqual([{event:'init'}]);expect(p.push('"result":{"status":"SUCCESS"}}')).toEqual([]);expect(p.finish()).toEqual([{event:'result',result:{status:'SUCCESS'}}]);});
  it('rejects malformed or oversized protocol events',()=>{expect(()=>new NdjsonParser().push('bad\n')).toThrow('malformed');expect(()=>new NdjsonParser().push('{}\n')).toThrow('Unrecognized');expect(()=>new NdjsonParser().push('x'.repeat(2_000_001))).toThrow('size limit');});
});
describe('provider failures',()=>{
  it.each([['ENOENT','CLI_MISSING'],['authentication required','AUTH_REQUIRED'],['401 expired','AUTH_REQUIRED'],['resource exhausted quota','QUOTA_EXHAUSTED'],['429 rate limit','QUOTA_EXHAUSTED']])('classifies %s',(message,code)=>{expect(providerFailure(message).code).toBe(code);});
});
describe('security boundaries',()=>{
  it.each(['../secret','a/../../secret','C:/Windows','a\\..\\secret','a\0b'])('blocks path traversal %s',name=>{expect(()=>safePath('E:/safe',name)).toThrow();});
  it('accepts workspace paths',()=>{expect(safePath('E:/safe','result.md')).toContain('result.md');});
  it.each(['127.0.0.1','10.0.0.1','192.168.1.1','172.20.0.1','169.254.169.254','100.64.1.1','0.0.0.0','::1','::ffff:127.0.0.1','fc00::1'])('blocks private address %s',address=>{expect(isPublicIp(address)).toBe(false);});
  it('accepts public addresses and rejects non-HTTP schemes',async()=>{expect(isPublicIp('93.184.216.34')).toBe(true);await expect(publicUrl('file:///etc/passwd')).rejects.toThrow();await expect(publicUrl('http://127.0.0.1')).rejects.toThrow();await expect(publicUrl('https://localhost')).rejects.toThrow();});
  it('rejects arbitrary and injected commands',()=>{expect(()=>validateCommand('node',['--version'])).not.toThrow();expect(()=>validateCommand('powershell',['Remove-Item'])).toThrow();expect(()=>validateCommand('node',['-e','process.exit()'])).toThrow();expect(()=>validateCommand('node;whoami',[])).toThrow();});
  it('blocks CSRF and DNS rebinding hosts',()=>{expect(()=>guard(new Request('http://127.0.0.1:3000/api/tasks',{method:'POST',headers:{host:'127.0.0.1:3000',origin:'https://evil.example'}}))).toThrow();expect(()=>guard(new Request('http://evil.example/api/health',{headers:{host:'evil.example'}}))).toThrow();expect(()=>guard(new Request('http://127.0.0.1:3000/api/tasks',{method:'POST',headers:{host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000'}}))).not.toThrow();});
  it('redacts common credentials',()=>{expect(redact('token=secret Bearer abc.def')).not.toContain('secret');expect(redact('token=secret Bearer abc.def')).not.toContain('abc.def');});
});
describe('API contracts',()=>{it('rejects malformed inputs and billing settings',()=>{expect(taskInput.safeParse({prompt:'',mode:'Shell'}).success).toBe(false);expect(settingsInput.safeParse({useG1Credits:true}).success).toBe(false);expect(taskInput.safeParse({prompt:'Hello',mode:'Files',requestId:crypto.randomUUID()}).success).toBe(true);});});
