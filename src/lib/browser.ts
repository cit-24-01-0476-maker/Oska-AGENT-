import {chromium,type Browser} from 'playwright';
import {publicUrl,isPublicIp} from './security';
import {AppError} from './contracts';
// Pin DNS at browser resolution, then intercept every request (including redirects).
// Limit sessions to one explicitly approved origin. Third-party resources are blocked.
export async function browse(raw:string,signal:AbortSignal,onActivity:(message:string)=>Promise<void>){
  const {url,addresses}=await publicUrl(raw);if(signal.aborted)throw new AppError('CANCELED','Browser task canceled.');
  const address=addresses.find(a=>a.address.includes('.'))?.address;
  if(!address||!isPublicIp(address))throw new AppError('DNS','An approved public IPv4 address is required.');
  let browser:Browser|undefined;
  const abort=()=>{void browser?.close();};signal.addEventListener('abort',abort,{once:true});
  try{
    const channel=process.env.OSKA_BROWSER_CHANNEL;
    if(channel&&!['chrome','msedge'].includes(channel))throw new AppError('BROWSER_CHANNEL','OSKA_BROWSER_CHANNEL must be chrome or msedge.');
    browser=await chromium.launch({headless:true,channel:channel||undefined,args:[`--host-resolver-rules=MAP ${url.hostname} ${address}, MAP * ~NOTFOUND`,'--disable-quic','--disable-background-networking','--no-proxy-server']});
    if(signal.aborted)throw new AppError('CANCELED','Browser task canceled.');
    const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',acceptDownloads:false,javaScriptEnabled:false});
    await context.route('**/*',async route=>{try{const target=new URL(route.request().url());if(target.origin!==url.origin||!['http:','https:'].includes(target.protocol)||route.request().method()!=='GET')return route.abort('blockedbyclient');return route.continue();}catch{return route.abort();}});
    const page=await context.newPage();await onActivity(`Opening approved source: ${url.origin}`);
    const response=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:30000});
    if(!response||!response.ok())throw new AppError('BROWSER_HTTP',`Source returned HTTP ${response?.status()??'no response'}.`,502);
    await onActivity('Reading page text and capturing screenshot.');
    const title=await page.title(),text=(await page.locator('body').innerText({timeout:10000})).slice(0,18000);
    const screenshot=await page.screenshot({type:'png',fullPage:false,timeout:10000});
    return {title,text,url:page.url(),screenshot};
  }catch(error){if(signal.aborted)throw new AppError('CANCELED','Browser task canceled.');if(String(error).includes('Executable doesn\'t exist'))throw new AppError('BROWSER_MISSING','Chromium is missing. Run pnpm exec playwright install chromium.',503);throw error;}
  finally{signal.removeEventListener('abort',abort);await browser?.close();}
}
