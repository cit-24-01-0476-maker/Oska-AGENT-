import {test,expect} from '@playwright/test';
test('real local task: plan, approval, persistence, artifact download, and deletion',async({page})=>{
  await page.route('**/api/settings',route=>route.fulfill({json:{onboarded:true}}));
  await page.goto('/');const close=page.getByRole('button',{name:'Close setup guide'});if(await close.isVisible())await close.click();
  await expect(page.getByRole('heading',{name:/Make room for/})).toBeVisible();
  await page.locator('.mode-bar').getByRole('button',{name:'Files',exact:true}).click();
  const title=`E2E local export ${Date.now()}`;await page.getByLabel('What would you like OSKA to do?').fill(`# ${title}\n\nThis is a real local document.`);
  await page.getByRole('button',{name:'Create task plan'}).click();
  await expect(page.getByRole('button',{name:'Approve & run'})).toBeVisible();
  await page.getByRole('button',{name:'Approve & run'}).click();
  await expect(page.locator('.task-meta .badge')).toHaveText('completed',{timeout:30000});
  await page.getByRole('tab',{name:'Files',exact:true}).click();
  await expect(page.locator('.artifact-row')).toHaveCount(2);
  const downloadPromise=page.waitForEvent('download');await page.locator('.artifact-row').filter({hasText:'.md'}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/result-.*\.md/);
  await page.reload();const setup=page.getByRole('button',{name:'Close setup guide'});if(await setup.isVisible())await setup.click();await page.locator('.task-row').filter({hasText:title}).click();await expect(page.locator('.result-text')).toContainText('This is a real local document.');
  await page.getByRole('button',{name:'Delete task',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete task',exact:true}).click();await expect(page.getByRole('heading',{name:/Make room for/})).toBeVisible();
});
test('invalid API and cross-origin writes are rejected',async({request})=>{
  const invalid=await request.post('/api/tasks',{headers:{origin:'http://127.0.0.1:3000'},data:{prompt:'',mode:'Files'}});expect(invalid.status()).toBe(400);
  const cross=await request.post('/api/tasks',{headers:{origin:'https://evil.example'},data:{prompt:'hello'}});expect(cross.status()).toBe(403);
});
