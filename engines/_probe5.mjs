import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = b.contexts()[0];
const page = await ctx.newPage();
const ids = ['4437133934','4433916864','4433930141','4436073226','4407699904'];
const SEL = '.jobs-description__content, #job-details, .jobs-box__html-content';
for (const id of ids) {
  const url = 'https://www.linkedin.com/jobs/view/'+id+'/';
  const t0 = Date.now();
  let navMs=-1;
  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }); navMs=Date.now()-t0; } catch(e){ console.log(id+' | NAV-FAIL '+(Date.now()-t0)+'ms '+e.message.split('\n')[0]); continue; }
  await page.waitForSelector(SEL, { timeout: 8000 }).catch(()=>{});
  await page.waitForTimeout(900);
  let jd = await page.locator(SEL).first().innerText({timeout:5000}).catch(()=>'');
  const at900 = jd.length;
  if (at900 < 60) { await page.waitForTimeout(5000); jd = await page.locator(SEL).first().innerText({timeout:5000}).catch(()=>''); }
  const title = await page.locator('h1').first().innerText({timeout:5000}).catch(()=>'');
  const me = await page.locator('img.global-nav__me-photo, .global-nav__me').count().catch(()=>0);
  console.log(`${id} | nav=${navMs}ms tot=${Date.now()-t0}ms | me=${me} | jd@900=${at900} | jd@final=${jd.length} | ${title.replace(/\s+/g,' ').slice(0,45)}`);
}
await page.close(); await b.close();
console.log('DONE');
