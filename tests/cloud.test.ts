import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {teamSchema,providerAvailability} from '../src/cloud/contracts';
import {guardCloud,seal,unseal,cloudUser} from '../src/cloud/auth';
import {assertOwner} from '../src/cloud/repository';
import {isCloud} from '../src/lib/runtime';
beforeEach(()=>{vi.stubEnv('APP_ORIGIN','https://oska.example');vi.stubEnv('AUTH_SECRET','test-only-secret-with-more-than-thirty-two-characters');});
afterEach(()=>vi.unstubAllEnvs());
describe('hosted workspace boundary',()=>{
  it('always treats Vercel as cloud, even when local mode is requested',()=>{vi.stubEnv('VERCEL','1');vi.stubEnv('OSKA_MODE','local');expect(isCloud()).toBe(true);});
  it('requires the exact deployment host and same-origin writes',()=>{
    expect(()=>guardCloud(new Request('https://oska.example/api/cloud/teams',{method:'POST',headers:{host:'oska.example',origin:'https://oska.example'}}))).not.toThrow();
    expect(()=>guardCloud(new Request('https://oska.example/api/cloud/teams',{method:'POST',headers:{host:'oska.example',origin:'https://evil.example'}}))).toThrow('Cross-origin');
    expect(()=>guardCloud(new Request('https://oska.example/api/cloud/teams',{headers:{host:'evil.example'}}))).toThrow('host');
    expect(()=>guardCloud(new Request('https://oska.example/api/cloud/teams',{method:'POST',headers:{host:'oska.example'}}))).toThrow('same-origin');
  });
  it('encrypts session data, checks purpose and rejects tampering',async()=>{const token=await seal({sub:'user-A',email:'a@example.com',name:'A'},'session','5m');expect(token).not.toContain('a@example.com');expect((await unseal(token,'session')).sub).toBe('user-A');await expect(unseal(token,'oauth')).rejects.toThrow();await expect(unseal(token.slice(0,-6)+'broken','session')).rejects.toThrow();});
  it('rejects missing identity and expired encrypted sessions',async()=>{await expect(cloudUser(new Request('https://oska.example'))).rejects.toThrow('Sign in');const token=await seal({sub:'A'},'session','-1s');await expect(unseal(token,'session')).rejects.toThrow();});
  it('blocks cross-user team access',()=>{expect(()=>assertOwner('user-A',{owner_id:'user-A'})).not.toThrow();expect(()=>assertOwner('user-A',{owner_id:'user-B'})).toThrow('not found');expect(()=>assertOwner('user-A',undefined)).toThrow('not found');});
  it('validates bounded team definitions and never invents model entitlement',()=>{expect(teamSchema.safeParse({name:'Team',objective:'Research a topic',members:[{name:'Planner',role:'Plan work',provider:'antigravity',modelId:null}]}).success).toBe(true);expect(teamSchema.safeParse({name:'',objective:'',members:[]}).success).toBe(false);for(const provider of providerAvailability){expect(provider.models).toEqual([]);expect(provider.status).not.toBe('connected');}});
});
