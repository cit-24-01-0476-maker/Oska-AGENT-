import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({getSession:vi.fn(),sql:vi.fn(),create:vi.fn()}));
vi.mock('@neondatabase/auth/next/server',()=>({createNeonAuth:mocks.create}));
vi.mock('../src/cloud/db',()=>({cloudDb:()=>mocks.sql,cloudDatabaseUrl:()=> 'postgresql://test'}));
import {managedAuth,managedAuthEnabled} from '../src/cloud/managed-auth';
import {cloudUser} from '../src/cloud/auth';
beforeEach(()=>{
  vi.stubEnv('OSKA_MODE','cloud');vi.stubEnv('OSKA_AUTH_MODE','neon-preview');
  vi.stubEnv('AUTH_SECRET','test-secret-with-more-than-thirty-two-characters');
  vi.stubEnv('NEON_AUTH_BASE_URL','https://example.neonauth.aws.neon.tech/neondb/auth');
  mocks.create.mockReturnValue({getSession:mocks.getSession});mocks.sql.mockResolvedValue([]);
});
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe('managed preview identity',()=>{
  it('is explicitly opt-in and never activates in the local edition',()=>{
    expect(managedAuthEnabled()).toBe(true);vi.stubEnv('OSKA_AUTH_MODE','');expect(managedAuthEnabled()).toBe(false);
    vi.stubEnv('OSKA_AUTH_MODE','neon-preview');vi.stubEnv('OSKA_MODE','local');vi.stubEnv('VERCEL','');expect(managedAuthEnabled()).toBe(false);
  });
  it('fails closed without a cookie secret',async()=>{vi.stubEnv('AUTH_SECRET','short');await expect(managedAuth()).rejects.toThrow('not configured');});
  it('rejects unverified identity without writing workspace ownership',async()=>{
    mocks.getSession.mockResolvedValue({data:{user:{id:'a',email:'a@example.com',emailVerified:false}}});
    await expect(cloudUser(new Request('https://oska.example'))).rejects.toThrow('verified');expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('uses the server-verified subject and revalidates upstream sessions',async()=>{
    mocks.getSession.mockResolvedValue({data:{user:{id:'verified-id',name:'Verified',email:'a@example.com',emailVerified:true}}});
    const profile=await cloudUser(new Request('https://oska.example',{headers:{cookie:'oska_cloud_session=forged'}}));
    expect(profile.sub).toBe('neon:verified-id');expect(mocks.getSession).toHaveBeenCalledWith({query:{disableCookieCache:'true'}});
    expect(mocks.sql.mock.calls[0].slice(1)).toEqual(['neon:verified-id','a@example.com','Verified']);
  });
});
