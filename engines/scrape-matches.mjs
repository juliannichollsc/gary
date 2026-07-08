// Scrape the user's personalized job matches from logged-in boards in the automation browser
// (CDP). Outputs {source,url,title} lists per site for the per-source triage agents.
// Usage: node engines/scrape-matches.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const SITES = [
  { source: 'himalayas', url: 'https://himalayas.app/jobs/matches', re: /\/companies\/[^/]+\/jobs\/[^/?#]+/ },
  { source: 'getonbrd', url: 'https://www.getonbrd.com/myjobs', re: /\/jobs\/(?!api)[^/?#]+/ },
];

let browser;
try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); }
catch { console.error('CDP down — chain a relaunch with this command.'); process.exit(1); }
const ctx = browser.contexts()[0];
mkdirSync('output/gmail-harvest', { recursive: true });
const all = {};

for (const site of SITES) {
  const page = await ctx.newPage();
  try {
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    // scroll to load lazy cards
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 1600).catch(() => {}); await page.waitForTimeout(900); }
    const reSrc = site.re.source;
    const items = await page.evaluate((reSrc) => {
      const re = new RegExp(reSrc);
      const seen = new Set(); const out = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href;
        if (!re.test(new URL(href).pathname)) continue;
        const key = href.split('?')[0];
        if (seen.has(key)) continue; seen.add(key);
        const t = (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        out.push({ url: href, title: t });
      }
      return out;
    }, reSrc);
    all[site.source] = items;
    console.log(`\n[${site.source}] ${items.length} job links:`);
    items.forEach((j) => console.log(`  ${j.title || '(no text)'}  ->  ${j.url.split('?')[0]}`));
    writeFileSync(`output/gmail-harvest/${site.source}-matches.txt`, items.map((j) => j.url.split('?')[0]).join('\n') + '\n');
  } catch (e) { console.log(`[${site.source}] ERROR: ${e.message.split('\n')[0]}`); }
  await page.waitForTimeout(500);
}
writeFileSync('output/gmail-harvest/matches-all.json', JSON.stringify(all, null, 2));
console.log('\nSaved → output/gmail-harvest/{himalayas,getonbrd}-matches.txt + matches-all.json');
await browser.close();
