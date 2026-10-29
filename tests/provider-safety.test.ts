import {beforeEach,describe,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const mocks=vi.hoisted(()=>({readFile:vi.fn(),access:vi.fn(),spawn:vi.fn()}));
vi.mock('node:fs/promises',()=>({readFile:mocks.readFile,access:mocks.access}));
vi.mock('node:child_process',()=>({spawn:mocks.spawn}));
import {readSafety,sessionSafeguards,blockedTools} from '../src/lib/providers/antigravity';
beforeEach(()=>{vi.clearAllMocks();mocks.readFile.mockResolvedValue('{}');mocks.access.mockResolvedValue(undefined);mocks.spawn.mockImplementation(()=>{
  const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});queueMicrotask(()=>{child.stderr.write('--settings  Settings for this session only, never saved\n');child.emit('close',0);});return child;
});});
describe('session-only Google AI safeguards',()=>{
  it('supports native help written to stderr without changing global settings',async()=>{const result=await readSafety();expect(result).toMatchObject({safe:true,useSession:true});expect(mocks.spawn.mock.calls[0][1]).toEqual(['--help']);});
  it('always denies credit fallback and CLI tools in per-request settings',()=>{expect(sessionSafeguards.useG1Credits).toBe(false);expect(sessionSafeguards.toolPermission).toBe('strict');expect(sessionSafeguards.permissions.deny).toEqual(blockedTools);expect(sessionSafeguards.permissions.allow).toEqual([]);});
  it('refuses alternate API-provider billing even if runtime settings are supported',async()=>{mocks.readFile.mockResolvedValue('{"modelProvider":"gemini"}');expect(await readSafety()).toMatchObject({safe:false,useSession:false});expect(mocks.spawn).not.toHaveBeenCalled();});
});
