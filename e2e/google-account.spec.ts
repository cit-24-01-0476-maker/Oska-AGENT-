import {test,expect} from '@playwright/test';
test('web identity shows a verified profile after callback return',async({page})=>{
  await page.route('**/api/settings',route=>route.fulfill({json:{onboarded:true}}));
  // UI fixture for a verified server session. No live Google consent in CI.
  await page.route('**/api/auth/google/session',route=>route.fulfill({json:{configured:true,profile:{sub:'test-subject',name:'Example Person',email:'example@example.com'},redirectUri:'http://127.0.0.1:3000/api/auth/google/callback'}}));
  await page.goto('/?google=connected');await expect(page.locator('.profile')).toContainText('example@example.com');
  await page.getByRole('button',{name:'Settings & privacy',exact:true}).click();await page.getByText('Optional Google website profile (not required for AI tasks)',{exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome, Example Person'})).toBeVisible();await expect(page.getByText('Google identity verified', {exact:true})).toBeVisible();
});
test('unconfigured Google web login explains required OAuth configuration',async({page})=>{
  await page.route('**/api/settings',route=>route.fulfill({json:{onboarded:true}}));
  await page.route('**/api/auth/google/session',route=>route.fulfill({json:{configured:false,profile:null,redirectUri:'http://127.0.0.1:3000/api/auth/google/callback'}}));
  await page.goto('/');await page.getByRole('button',{name:'Settings & privacy',exact:true}).click();await page.getByText('Optional Google website profile (not required for AI tasks)',{exact:true}).click();await page.getByRole('button',{name:'Continue with Google',exact:true}).click();await expect(page.getByRole('heading',{name:'One-time Google web sign-in configuration'})).toBeVisible();await expect(page.locator('.google-oauth-config')).toContainText('GOOGLE_CLIENT_ID');
});
