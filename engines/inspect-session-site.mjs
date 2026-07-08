// Inspect a logged-in job site in the automation Chrome (debug CDP :9333) to judge auto-apply
// feasibility: is the session logged in? what job cards are listed? is "Apply" internal
// (a form we can fill) or external (links out to a company ATS)?
// Usage: node engines/inspect-session-site.mjs "<url>"  ["<url2>" ...]
import { chromium } from 'playwright';

const urls = process.argv.slice(2);
if (!urls.length) { console.error('Usage: node engines/inspect-session-site.mjs "<url>" [...]'); process.exit(1); }

let browser;
try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); }
catch { console.error('CDP down — relaunch the automation Chrome (chain it with this command).'); process.exit(1); }
const ctx = browser.contexts()[0];

for (const url of urls) {
  const page = await ctx.newPage();
  console.log(`\n=================== ${url} ===================`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const info = await page.evaluate(() => {
      const txt = document.body.innerText.toLowerCase();
      const loggedOut = /\b(sign in|log in|iniciar sesi[oó]n|create account|registr)/i.test(document.body.innerText) &&
        !/sign out|log out|cerrar sesi[oó]n|my profile|mi perfil|dashboard/i.test(document.body.innerText);
      // collect job links + apply buttons
      const jobLinks = [...document.querySelectorAll('a[href*="/jobs/"], a[href*="/empleos/"], a[href*="/job/"]')]
        .map(a => ({ href: a.href, t: a.innerText.trim().slice(0, 50) })).filter(x => x.t).slice(0, 12);
      const applyBtns = [...document.querySelectorAll('a,button')]
        .filter(e => /^(apply|postular|apply now|easy apply|aplicar)\b/i.test(e.innerText.trim()))
        .map(e => ({ tag: e.tagName, t: e.innerText.trim().slice(0, 30), href: e.tagName === 'A' ? e.href : '' })).slice(0, 8);
      return { title: document.title.slice(0, 70), finalUrl: location.href, loggedOut, jobCount: jobLinks.length, jobLinks, applyBtns };
    });
    console.log(`title: ${info.title}`);
    console.log(`final url: ${info.finalUrl}`);
    console.log(`logged in: ${info.loggedOut ? 'NO (sign-in wall?)' : 'likely YES'}`);
    console.log(`job links found: ${info.jobCount}`);
    info.jobLinks.slice(0, 8).forEach(j => console.log(`   • ${j.t}  ->  ${j.href.slice(0, 80)}`));
    console.log(`apply buttons on this page: ${info.applyBtns.length}`);
    info.applyBtns.forEach(b => console.log(`   [${b.tag}] "${b.t}" ${b.href ? '-> ' + b.href.slice(0, 80) : '(button)'}`));
  } catch (e) {
    console.log(`ERROR: ${e.message.split('\n')[0]}`);
  }
  await page.waitForTimeout(500);
}
await browser.close();
