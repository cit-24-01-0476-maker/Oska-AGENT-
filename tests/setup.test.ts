import {beforeEach,describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
const mocks=vi.hoisted(()=>({readFile:vi.fn(),mkdir:vi.fn(),writeFile:vi.fn(),copyFile:vi.fn(),rename:vi.fn(),spawn:vi.fn()}));
vi.mock('node:fs/promises',()=>({...mocks,constants:{COPYFILE_EXCL:1}}));
vi.mock('node:child_process',()=>({spawn:mocks.spawn}));
vi.mock('../src/lib/providers/antigravity',()=>({blockedTools:['command(*)','mcp(*)'],environment:()=>({}),executable:async()=>"C:\\Users\\O'Neil\\agy.exe"}));
import {prepareSetup,consumeSetupApproval,setupApproval,runSetup,psLiteral} from '../src/lib/providers/setup';
import {terminalLauncher} from '../src/lib/providers/terminal';
beforeEach(()=>{vi.clearAllMocks();vi.unstubAllGlobals();});
describe('web connection setup',()=>{
  it('requires explicit approval and rejects arbitrary commands',()=>{
    expect(setupApproval.safeParse({action:'install',token:crypto.randomUUID(),approved:false}).success).toBe(false);
    expect(setupApproval.safeParse({action:'signin',token:crypto.randomUUID(),approved:true,command:'whoami'}).success).toBe(false);
  });
  it('binds approval to a specific action and consumes it once',async()=>{
    const preview=await prepareSetup('signin');
    expect(()=>consumeSetupApproval({action:'install',token:preview.token,approved:true})).toThrow('does not match');
    expect(consumeSetupApproval({action:'signin',token:preview.token,approved:true}).script).toContain("O''Neil");
    expect(()=>consumeSetupApproval({action:'signin',token:preview.token,approved:true})).toThrow('expired');
  });
  it('quotes executable paths without shell interpolation',()=>{expect(psLiteral("C:\\O'Neil\\agy.exe")).toBe("'C:\\O''Neil\\agy.exe'");});
  it('requests a normal visible Windows window through a checked launcher',()=>{
    const launcher=terminalLauncher('Write-Host test',"E:\\O'Neil\\workspace");
    const command=Buffer.from(launcher.args.at(-1)!,'base64').toString('utf16le');
    expect(command).toContain('Start-Process');expect(command).toContain('-WindowStyle Normal');expect(command).toContain("O''Neil");
  });
  it('allows an immediate retry after Windows rejects a window launch',async()=>{
    mocks.spawn.mockImplementation(()=>{const child=new EventEmitter();queueMicrotask(()=>child.emit('close',1));return child;});
    let preview=await prepareSetup('signin');await expect(runSetup({action:'signin',token:preview.token,approved:true})).rejects.toThrow('Windows rejected');
    mocks.spawn.mockImplementation(()=>{const child=new EventEmitter();queueMicrotask(()=>child.emit('close',0));return child;});
    preview=await prepareSetup('signin');await expect(runSetup({action:'signin',token:preview.token,approved:true})).resolves.toMatchObject({status:'terminal_opened'});
    expect(mocks.spawn.mock.calls.at(-1)?.[2]).toMatchObject({shell:false,windowsHide:true,stdio:['ignore','ignore','ignore']});
  });
  it('fetches only the fixed official URL and preserves the reviewed snapshot',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response('$binary = "agy.exe"; Write-Host "installer test fixture"'));
    vi.stubGlobal('fetch',fetchMock);const preview=await prepareSetup('install');
    expect(fetchMock.mock.calls[0][0]).toBe('https://antigravity.google/cli/install.ps1');
    expect(preview.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(consumeSetupApproval({action:'install',token:preview.token,approved:true}).script).toBe(preview.script);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('surfaces installer network errors without launching anything',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));await expect(prepareSetup('install')).rejects.toThrow('Could not download');expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('backs up settings and preserves unrelated keys when safeguards are approved',async()=>{
    mocks.readFile.mockResolvedValueOnce('# safety review').mockResolvedValueOnce(JSON.stringify({colorScheme:'dark',permissions:{allow:['read_file(src)'],deny:['existing(*)']}}));
    const preview=await prepareSetup('safeguards');const result=await runSetup({action:'safeguards',token:preview.token,approved:true});
    expect(result.status).toBe('safeguards_applied');expect(mocks.copyFile).toHaveBeenCalledOnce();
    const saved=JSON.parse(mocks.writeFile.mock.calls[0][1]);expect(saved.colorScheme).toBe('dark');expect(saved.useG1Credits).toBe(false);expect(saved.permissions.allow).toEqual(['read_file(src)']);expect(saved.permissions.deny).toContain('existing(*)');expect(saved.permissions.deny).toContain('command(*)');expect(mocks.rename).toHaveBeenCalledOnce();
  });
  it('refuses to override an alternate API billing provider',async()=>{
    mocks.readFile.mockResolvedValueOnce('# review').mockResolvedValueOnce('{"modelProvider":"gemini"}');const preview=await prepareSetup('safeguards');await expect(runSetup({action:'safeguards',token:preview.token,approved:true})).rejects.toThrow('alternate provider');expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});
