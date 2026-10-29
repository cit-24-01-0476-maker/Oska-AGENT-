import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({getToken:vi.fn(),verifyIdToken:vi.fn(),findUnique:vi.fn(),create:vi.fn(),delete:vi.fn(),deleteMany:vi.fn()}));
vi.mock('google-auth-library',()=>({OAuth2Client:class {getToken=mocks.getToken;verifyIdToken=mocks.verifyIdToken;}}));
vi.mock('../src/lib/db',()=>({db:{setting:{findUnique:mocks.findUnique,create:mocks.create,delete:mocks.delete,deleteMany:mocks.deleteMany}}}));
import {googleAuthRoute,validateGoogleProfile,webProfile} from '../src/lib/google-auth';
const origin='http://127.0.0.1:3000';
function req(action:string,query='',cookies='',method='GET'){return new Request(`${origin}/api/auth/google/${action}${query}`,{method,headers:{host:'127.0.0.1:3000',...(cookies?{cookie:cookies}:{}),...(method==='POST'?{origin}:{})}});}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('GOOGLE_CLIENT_ID','test-client.apps.googleusercontent.com');vi.stubEnv('GOOGLE_CLIENT_SECRET','test-only-secret');});
afterEach(()=>vi.unstubAllEnvs());
describe('Google website identity',()=>{
  it('sends Google only identity scopes, PKCE, state and nonce',async()=>{
    const result=await googleAuthRoute(req('start'),'start');const location=new URL(result.headers.get('location')!);
    expect(location.origin).toBe('https://accounts.google.com');expect(location.searchParams.get('scope')).toBe('openid email profile');expect(location.searchParams.get('code_challenge_method')).toBe('S256');expect(location.searchParams.get('nonce')).toBeTruthy();expect(result.headers.get('set-cookie')).toContain('HttpOnly');expect(mocks.getToken).not.toHaveBeenCalled();
  });
  it('rejects callback without a browser-bound state',async()=>{await expect(googleAuthRoute(req('callback','?code=fake&state=fake'),'callback')).rejects.toThrow('not started');expect(mocks.getToken).not.toHaveBeenCalled();});
  it('verifies a callback, creates a token-free session and redirects to OSKA',async()=>{
    const start=await googleAuthRoute(req('start'),'start');const url=new URL(start.headers.get('location')!),state=url.searchParams.get('state')!,nonce=url.searchParams.get('nonce')!;
    mocks.getToken.mockResolvedValue({tokens:{id_token:'sensitive-google-token',access_token:'never-store-access-token'}});
    mocks.verifyIdToken.mockResolvedValue({getPayload:()=>({sub:'google-subject-123',name:'Test Person',email:'test@example.com',email_verified:true,nonce})});
    const request=req('callback',`?code=example-code&state=${state}`,`oska_google_state=${state}`);const response=await googleAuthRoute(request,'callback');
    expect(response.headers.get('location')).toBe(origin+'/?google=connected');expect(response.headers.get('set-cookie')).toContain('oska_web_session=');
    expect(mocks.verifyIdToken).toHaveBeenCalledWith({idToken:'sensitive-google-token',audience:'test-client.apps.googleusercontent.com'});
    const record=mocks.create.mock.calls[0][0].data;expect(record.key).toMatch(/^web-session:[a-f0-9]{64}$/);expect(record.value).toContain('test@example.com');expect(record.value).not.toContain('sensitive-google-token');expect(record.value).not.toContain('never-store-access-token');
    await expect(googleAuthRoute(request,'callback')).rejects.toThrow('not started');
  });
  it('rejects missing verified email and wrong nonce',()=>{expect(()=>validateGoogleProfile({sub:'123',email:'test@example.com',nonce:'wrong',email_verified:true},'right')).toThrow();expect(()=>validateGoogleProfile({sub:'123',email:'test@example.com',nonce:'right',email_verified:false},'right')).toThrow();});
  it('does not accept expired sessions',async()=>{mocks.findUnique.mockResolvedValue({key:'expired-test-session',value:JSON.stringify({expires:0,profile:{name:'Expired'}})});expect(await webProfile(req('session','',`oska_web_session=${'a'.repeat(64)}`))).toBeNull();expect(mocks.delete).toHaveBeenCalled();});
  it('reports missing OAuth setup honestly',async()=>{vi.stubEnv('GOOGLE_CLIENT_ID','');const response=await googleAuthRoute(req('session'),'session');expect((await response.json()).configured).toBe(false);await expect(googleAuthRoute(req('start'),'start')).rejects.toThrow('GOOGLE_CLIENT_ID');});
});
