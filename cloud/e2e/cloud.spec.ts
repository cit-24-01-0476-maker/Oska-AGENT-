import {test,expect} from '@playwright/test';
test('production cloud mode rejects all local execution and unsigned workspace requests',async({request})=>{
  const local=await request.get('/api/providers/antigravity/status');expect(local.status()).toBe(403);expect((await local.json()).error.code).toBe('LOCAL_EXECUTION_DISABLED');
  const teams=await request.get('/api/cloud/teams');expect(teams.status()).toBe(401);
  const cross=await request.post('/api/cloud/teams',{headers:{origin:'https://evil.example'},data:{}});expect(cross.status()).toBe(403);
  const forged=await request.get('/api/cloud/teams',{headers:{cookie:'oska_cloud_session=fake'}});expect(forged.status()).toBe(401);
  const disabled=await request.get('/api/auth/get-session');expect(disabled.status()).toBe(503);
});
test('preview Google button uses the official identity SDK (UI fixture)',async({page})=>{
  await page.route('**/api/cloud/auth/session',route=>route.fulfill({json:{profile:null,setup:{origin:true,identity:true,session:true,database:true},loginMode:'neon-preview',redirectUri:null}}));
  let signIn:unknown;
  await page.route('**/api/auth/sign-in/social',route=>{
    signIn=route.request().postDataJSON();
    return route.fulfill({status:403,json:{message:'Test fixture: domain authorization pending',code:'INVALID_CALLBACKURL'}});
  });
  await page.goto('/');await expect(page.getByText(/Preview login uses Neon/)).toBeVisible();
  await page.getByRole('button',{name:'Sign in with Google',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'domain authorization pending'})).toBeVisible();
  expect(signIn).toMatchObject({provider:'google',callbackURL:new URL('/auth/complete',page.url()).href});
});
test('cloud landing honestly shows provider and deployment boundaries',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:/Your ideas/})).toBeVisible();await expect(page.getByRole('heading',{name:'Provider access is still pending'})).toBeVisible();await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeDisabled();
  await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'AI teams',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Array.from(document.querySelectorAll('*')).filter(el=>el.getBoundingClientRect().right>window.innerWidth+1).map(el=>({tag:el.tagName,className:el.className,text:el.textContent?.slice(0,60),right:el.getBoundingClientRect().right})))).toEqual([]);
});
test('signed-in cloud team form saves only an explicit draft (UI fixture)',async({page})=>{
  await page.route('**/api/cloud/auth/session',route=>route.fulfill({json:{profile:{sub:'ui-test',email:'ui@example.com',name:'UI Test'},setup:{origin:true,identity:true,session:true,database:true},redirectUri:'http://127.0.0.1:3001/api/cloud/auth/callback'}}));
  let saved:unknown=null;await page.route('**/api/cloud/teams',async route=>{if(route.request().method()==='POST'){saved=route.request().postDataJSON();return route.fulfill({json:{id:'fixture-draft',status:'DRAFT'}});}return route.fulfill({json:{teams:[]}});});
  await page.route('**/api/cloud/tasks',route=>route.fulfill({json:{tasks:[]}}));
  await page.goto('/');await page.getByRole('button',{name:'AI teams',exact:true}).click();await page.getByRole('button',{name:'Create team draft',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Team name').fill('Research team');await dialog.getByLabel('Shared objective').fill('Research and review a topic');await dialog.getByRole('button',{name:'Save team draft',exact:true}).click();
  expect(saved).toMatchObject({name:'Research team',members:[{name:'Planner',provider:'antigravity',modelId:null}]});await expect(page.getByRole('status')).toContainText('Team draft saved');
});
