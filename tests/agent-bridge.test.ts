import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const {listTeams}=vi.hoisted(()=>({listTeams:vi.fn()}));
vi.mock('../src/cloud/repository',()=>({listTeams}));
import {agentRequest} from '../src/cloud/agent';
import {tenantId,signature} from '../agent-host/security.mjs';
const user={sub:'verified-owner',name:'Owner',email:'owner@example.com'};
beforeEach(()=>{vi.stubEnv('OSKA_AGENT_ORIGIN','https://agents.oska.example');vi.stubEnv('OSKA_AGENT_SECRET','test-secret-'.repeat(8));});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
it('rejects tenant fields and derives signed ownership from server identity',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({id:'created-job'}));vi.stubGlobal('fetch',fetcher);
  await expect(agentRequest(user,['jobs'],'POST',{action:'models',provider:'codex',tenant:'attacker'})).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await agentRequest(user,['jobs'],'POST',{action:'models',provider:'codex'});
  const [url,options]=fetcher.mock.calls[0];expect(url).toBe('https://agents.oska.example/jobs');const h=options.headers;
  expect(h['x-oska-tenant']).toBe(tenantId(user.sub));expect(h['x-oska-signature']).toBe(signature(process.env.OSKA_AGENT_SECRET!,{time:h['x-oska-time'],nonce:h['x-oska-nonce'],tenant:h['x-oska-tenant'],method:'POST',path:'/jobs',body:options.body}));
});
it('never fetches an agent when hosting is missing or a URL is insecure',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);vi.stubEnv('OSKA_AGENT_ORIGIN','');
  await expect(agentRequest(user,['jobs'],'POST',{action:'models',provider:'codex'})).rejects.toThrow('connect');
  vi.stubEnv('OSKA_AGENT_ORIGIN','http://127.0.0.1:9999');await expect(agentRequest(user,['jobs'],'POST',{action:'models',provider:'codex'})).rejects.toThrow('HTTPS');expect(fetcher).not.toHaveBeenCalled();
});
it('team execution reads only the owner-scoped saved team',async()=>{
  listTeams.mockResolvedValue([]);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  await expect(agentRequest(user,['jobs'],'POST',{action:'team',teamId:'de275069-3cd2-40b8-8df1-73b1306bccb3',prompt:'Run'})).rejects.toThrow('not found');expect(listTeams).toHaveBeenCalledWith(user);expect(fetcher).not.toHaveBeenCalled();
});
