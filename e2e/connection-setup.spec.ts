import {test,expect} from '@playwright/test';
test('connection setup reviews an installer action and cancels without execution',async({page})=>{
  let launched=false;
  await page.route('**/api/providers/antigravity/status',route=>route.fulfill({json:{status:'cli_missing',installed:false,message:'Test fixture: CLI missing',models:[],costSafe:false,authVerified:false}}));
  await page.route('**/api/settings',route=>route.fulfill({json:{onboarded:true}}));
  // Clearly labeled UI fixture; never execute an installer in automated tests.
  await page.route('**/api/providers/antigravity/setup?action=install',route=>route.fulfill({json:{action:'install',token:crypto.randomUUID(),title:'Install official Antigravity CLI',description:'Test fixture: no installation will run.',source:'https://antigravity.google/cli/install.ps1',script:'# TEST FIXTURE - NOT EXECUTED',sha256:'a'.repeat(64),expiresAt:Date.now()+300000}}));
  await page.route('**/api/providers/antigravity/setup',route=>{launched=true;return route.abort();});
  await page.goto('/');await page.getByRole('button',{name:'Connections',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your Google AI, in a few clear steps.'})).toBeVisible();
  await page.getByRole('button',{name:/^(Install CLI|Review installer again)$/}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Approve & open terminal'})).toBeDisabled();
  await dialog.getByText('Review script and SHA-256').click();await expect(dialog.locator('pre')).toContainText('TEST FIXTURE');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect(launched).toBe(false);
});
test('setup endpoints reject missing approval and unknown tokens',async({request})=>{
  const headers={origin:'http://127.0.0.1:3000'};
  const invalid=await request.post('/api/providers/antigravity/setup',{headers,data:{action:'install',approved:false,token:crypto.randomUUID()}});expect(invalid.status()).toBe(400);
  const unknown=await request.post('/api/providers/antigravity/setup',{headers,data:{action:'signin',approved:true,token:crypto.randomUUID()}});expect(unknown.status()).toBe(409);
});
test('Connect Google AI offers CLI installation separately from web identity',async({page})=>{
  await page.route('**/api/settings',route=>route.fulfill({json:{onboarded:true}}));
  await page.route('**/api/providers/antigravity/status',route=>route.fulfill({json:{status:'cli_missing',installed:false,message:'Test fixture: CLI missing',models:[],costSafe:false,authVerified:false}}));
  await page.route('**/api/providers/antigravity/setup?action=install',route=>route.fulfill({json:{action:'install',token:crypto.randomUUID(),title:'Install official Antigravity CLI',description:'Install the official CLI, then start Google sign-in. TEST FIXTURE: not executed.',source:'https://antigravity.google/cli/install.ps1',script:'# TEST FIXTURE',sha256:'b'.repeat(64),expiresAt:Date.now()+300000}}));
  await page.goto('/');await page.getByRole('button',{name:'Connections',exact:true}).click();
  await page.getByRole('button',{name:'Connect Google AI via CLI',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('then start Google sign-in');
  await expect(page.getByRole('dialog').getByRole('button',{name:'Approve & open terminal'})).toBeDisabled();
  await page.getByRole('button',{name:'Close setup approval'}).click();
});
test('existing Google AI connection opens a usable workspace without website OAuth',async({page})=>{
  await page.route('**/api/settings',route=>route.fulfill({json:{onboarded:true}}));
  await page.route('**/api/providers/antigravity/status',route=>route.fulfill({json:{status:'connected',installed:true,version:'1.4.10',message:'Test fixture: existing authenticated account',models:[{id:'fixture-model-high',displayName:'Fixture model (High)',available:true}],costSafe:true,authVerified:true}}));
  await page.goto('/');await page.getByRole('button',{name:'Connections',exact:true}).click();await expect(page.getByRole('heading',{name:'Your AI is ready in OSKA.'})).toBeVisible();await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Open Agent Workspace',exact:true}).click();await page.getByLabel('What would you like OSKA to do?').fill('Draft a project report.');await expect(page.getByLabel('Select model')).toHaveValue('fixture-model-high');await expect(page.getByRole('button',{name:'Create task plan'})).toBeEnabled();
});
