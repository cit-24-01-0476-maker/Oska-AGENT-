import {test,expect} from '@playwright/test';
test('production cloud mode rejects all local execution and unsigned workspace requests',async({request})=>{
  const local=await request.get('/api/providers/antigravity/status');expect(local.status()).toBe(403);expect((await local.json()).error.code).toBe('LOCAL_EXECUTION_DISABLED');
  const teams=await request.get('/api/cloud/teams');expect(teams.status()).toBe(401);
  const agent=await request.get('/api/cloud/agent/status');expect(agent.status()).toBe(401);
  const cross=await request.post('/api/cloud/teams',{headers:{origin:'https://evil.example'},data:{}});expect(cross.status()).toBe(403);
  const forged=await request.get('/api/cloud/teams',{headers:{cookie:'oska_cloud_session=fake'}});expect(forged.status()).toBe(401);
  const identity=await request.get('/api/auth/get-session');
  expect([200,503]).toContain(identity.status());
  if(identity.status()===200)expect(await identity.json()).toBeNull();
  else expect((await identity.json()).error.code).toBe('AUTH_SETUP_REQUIRED');
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
test('cloud landing honestly shows provider and deployment boundaries',async({page,request})=>{
  const session=await (await request.get('/api/cloud/auth/session')).json();
  await page.goto('/');await expect(page.getByRole('heading',{name:/Your ideas/})).toBeVisible();await expect(page.getByRole('heading',{name:'Provider access is still pending'})).toBeVisible();
  if(Object.values(session.setup).every(Boolean))await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeEnabled();
  else await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeDisabled();
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
test('private agent connection discovers returned models and submits a text task (UI fixtures)',async({page})=>{
  await page.route('**/api/cloud/auth/session',route=>route.fulfill({json:{profile:{sub:'ui-test',email:'ui@example.com',name:'UI Test'},setup:{origin:true,identity:true,session:true,database:true},loginMode:'neon-preview',redirectUri:null}}));
  await page.route('**/api/cloud/teams',route=>route.fulfill({json:{teams:[]}}));await page.route('**/api/cloud/tasks',route=>route.fulfill({json:{tasks:[]}}));
  await page.route('**/api/cloud/agent/status',route=>route.fulfill({json:{configured:true,textOnly:true}}));
  let posted:Record<string,unknown>={};
  await page.route('**/api/cloud/agent/jobs',async route=>{posted=route.request().postDataJSON();await route.fulfill({json:{id:'fixture-job'}});});
  await page.route('**/api/cloud/agent/jobs/fixture-job',route=>route.fulfill({json:posted.action==='models'?{id:'fixture-job',status:'succeeded',result:{models:[{id:'fixture-account-model',name:'Fixture Account Model'}]}}:{id:'fixture-job',status:'succeeded',result:{response:'Fixture task output'}}}));
  await page.goto('/');await page.getByRole('button',{name:'Connections',exact:true}).click();await page.getByRole('button',{name:'Refresh models',exact:true}).click();
  await expect(page.getByLabel('Available account model')).toBeVisible();await expect(page.getByLabel('Available account model')).toHaveValue('fixture-account-model');
  await page.getByLabel('Agent server task').fill('Summarize this goal');await page.getByRole('button',{name:'Run selected model',exact:true}).click();
  await expect(page.getByText('Fixture task output',{exact:true})).toBeVisible();expect(posted).toEqual({action:'run',provider:'antigravity',model:'fixture-account-model',prompt:'Summarize this goal'});
});
