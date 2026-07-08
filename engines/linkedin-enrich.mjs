// Enrich a list of LinkedIn /jobs/view/ URLs with title/company/location/liveness
// by driving the automation browser over CDP (it's logged into LinkedIn there, so no
// anti-bot block). Reads URLs from a file (one per line) or argv, visits each in a
// single reused tab, scrapes metadata, and writes JSON for triage. Never applies.
//
// Prereq:  engines/start-chrome-debug.cmd  (debug browser on CDP port 9333).
// Usage:   node engines/linkedin-enrich.mjs output/gmail-harvest/clean-linkedin-2026-06-24.txt
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const listFile = process.argv[2];
if (!listFile) { console.error('Usage: node engines/linkedin-enrich.mjs <urls.txt>'); process.exit(1); }
const urls = readFileSync(listFile, 'utf8').split('\n').map((s) => s.trim()).filter((s) => /linkedin\.com\/jobs\/view\/\d/.test(s));
console.log(`Enriching ${urls.length} LinkedIn offers via the debug browser (CDP)...`);

let browser;
try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); }
catch { console.error('Run engines/start-chrome-debug.cmd first (debug browser on CDP port 9333).'); process.exit(1); }
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

const results = [];
for (let i = 0; i < urls.length; i++) {
  const url = urls[i];
  const rec = { url, title: '', company: '', location: '', closed: false, snippet: '' };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    rec.title = await page.locator('h1').first().innerText({ timeout: 8000 }).catch(() => '');
    rec.company = await page.locator('.job-details-jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name a, a[data-test-app-aware-link]').first().innerText({ timeout: 4000 }).catch(() => '');
    const primary = await page.locator('.job-details-jobs-unified-top-card__primary-description-container, .jobs-unified-top-card__primary-description').first().innerText({ timeout: 4000 }).catch(() => '');
    rec.location = primary.split('·')[0].trim().slice(0, 80);
    const body = await page.locator('.jobs-description__content, .jobs-box__html-content, #job-details').first().innerText({ timeout: 5000 }).catch(() => '');
    rec.snippet = body.replace(/\s+/g, ' ').trim().slice(0, 700);
    const pageText = (rec.title + ' ' + body).toLowerCase();
    rec.closed = /no longer accepting applications|ya no se aceptan|esta oferta ya no/i.test(await page.content().catch(() => ''));
    // Fallback to <title> if h1 empty
    if (!rec.title) { const t = await page.title(); rec.title = t.replace(/\s*\|\s*LinkedIn.*$/i, '').trim(); }
  } catch (e) { rec.error = e.message.split('\n')[0]; }
  results.push(rec);
  process.stdout.write(`  [${i + 1}/${urls.length}] ${(rec.company || '?').slice(0, 28)} — ${(rec.title || rec.error || '?').slice(0, 50)}${rec.closed ? ' [CLOSED]' : ''}\n`);
}

mkdirSync('output/gmail-harvest', { recursive: true });
const out = listFile.replace(/\.txt$/, '') + '-enriched.json';
writeFileSync(out.includes('/') ? out : 'output/gmail-harvest/' + out, JSON.stringify(results, null, 2));
console.log(`\nSaved → ${out}`);
await browser.close();
