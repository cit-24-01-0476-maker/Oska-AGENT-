import {test,expect} from '@playwright/test';

test('workspace mounts without hydration errors when an extension annotates server HTML',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>{
    const annotate=(node:Node)=>{
      if(!(node instanceof Element))return;
      if(node.matches('body, div'))node.setAttribute('bis_skin_checked','1');
      node.querySelectorAll('body, div').forEach(element=>element.setAttribute('bis_skin_checked','1'));
    };
    const observer=new MutationObserver(records=>{
      for(const record of records)record.addedNodes.forEach(annotate);
    });
    observer.observe(document,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),5000);
  });
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/Make room for/})).toBeVisible({timeout:15000});
  expect(errors.filter(message=>/hydrat|server rendered HTML/i.test(message))).toEqual([]);
});
