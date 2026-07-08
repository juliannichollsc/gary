// Harvest job-alert offers from the user's job-alerts Gmail (config/profile.yml →
// job_search.gmail_alerts_account) by driving the dedicated automation Chrome (port 9333)
// over CDP — NOT the Claude Gmail connector (which may be bound to a different account).
// Gmail is logged in inside the Chrome automation profile, so it just shows the mail; no OAuth, no bot flags.
// candidate values come from config/apply-fieldmap.json + config/profile.yml — never hardcode PII
//
// What it does: opens Gmail, runs a filtered search (job-alert senders, fresh),
// opens each matching thread, scrapes every offer URL out of the body, dedupes,
// and writes them to output/gmail-harvest/offers-<date>.json + pipeline-ready
// lines. It NEVER applies — it only feeds the per-offer workflow.
//
// Prereq:  run  output\start-chrome-debug.cmd  first (Chrome on port 9333, automation profile).
// Usage:
//   node engines/gmail-harvest.mjs                       # default filter, last 3 days
//   node engines/gmail-harvest.mjs --days 7              # widen the window
//   node engines/gmail-harvest.mjs --u 1                 # Gmail account index (if not u/0)
//   node engines/gmail-harvest.mjs --max 40              # cap threads opened
//   node engines/gmail-harvest.mjs --query 'from:linkedin newer_than:2d'   # full override
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const days = parseInt(arg('--days', '3'), 10);
const acct = arg('--u', '0');
const maxThreads = parseInt(arg('--max', '30'), 10);
// CDP target: dedicated automation Chrome on :9333 (migrated 2026-06-24).
// Override with --port or CDP_PORT env. The user's personal browser is OFF-LIMITS — avoid it.
const cdpPort = arg('--port', process.env.CDP_PORT || '9333');

// Job-alert senders the user actually receives (config: job_search.gmail_alerts_account).
// Override the whole thing with --query for ad-hoc searches.
const DEFAULT_QUERY =
  `newer_than:${days}d ` +
  `(from:linkedin.com OR from:indeed.com OR from:computrabajo OR from:randstad ` +
  `OR from:getonbrd.com OR from:glassdoor OR from:wellfound OR from:neotech ` +
  `OR subject:(job OR jobs OR empleo OR vacante OR "remote" OR hiring OR alert))`;
const query = arg('--query', DEFAULT_QUERY);

// Anchor hrefs we treat as real job offers (filters out unsubscribe/tracking chrome).
const OFFER_RE = /(linkedin\.com\/(comm\/)?jobs\/view|linkedin\.com\/jobs\/view|indeed\.com\/(viewjob|rc\/clk)|computrabajo\.com|getonbrd\.com\/jobs|jobs\.lever\.co|boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.ashbyhq\.com|apply\.workable\.com|wellfound\.com\/jobs|glassdoor\.[a-z.]+\/job)/i;
const NOISE_RE = /(unsubscribe|notification-settings|email\/preferences|optout|\/help\/|\/legal\/|\/settings\/|psettings|manage.*alert|application_rejected|application_viewed|email_open_job)/i;

const gmailUrl = `https://mail.google.com/mail/u/${acct}/#search/${encodeURIComponent(query)}`;

console.log(`Connecting to automation Chrome (CDP 127.0.0.1:${cdpPort})...`);
let browser;
try {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
} catch (e) {
  console.error(`\nCould not connect to CDP ${cdpPort}. Run  output\\start-chrome-debug.cmd  first (Chrome on ${cdpPort}, automation profile).`);
  process.exit(1);
}
const ctx = browser.contexts()[0];

// Reuse an already-open Gmail tab if there is one; otherwise open a fresh tab.
let page = ctx.pages().find((p) => p.url().includes('mail.google.com'));
if (!page) page = await ctx.newPage();
console.log(`Opening Gmail search (account u/${acct}): ${query}`);
await page.goto(gmailUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

// Wait for the thread list (or "no results").
// Hash-only navigation on an already-open Gmail SPA can resolve domcontentloaded
// without re-rendering the search → reload once as a fallback before giving up.
async function waitForList() {
  try {
    await page.waitForSelector('tr.zA, .TC, .Dj', { timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}
if (!(await waitForList())) {
  console.log('List not rendered on hash nav — reloading the search...');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  if (!(await waitForList())) {
    console.error('Gmail did not render a result list. Is the configured job-alerts account signed in at this account index? Try --u 1 / --u 2.');
    await browser.close();
    process.exit(2);
  }
}
await page.waitForTimeout(1500);

// Collect the thread rows (subject, sender, date) without opening yet.
const rows = await page.$$eval('tr.zA', (trs) =>
  trs.map((tr) => ({
    subject: tr.querySelector('.bog')?.innerText?.trim() || '',
    sender: tr.querySelector('.yW span[email]')?.getAttribute('email') || tr.querySelector('.yW span')?.innerText?.trim() || '',
    date: tr.querySelector('.xW span')?.getAttribute('title') || tr.querySelector('.xW span')?.innerText?.trim() || '',
  }))
);
console.log(`Found ${rows.length} alert threads. Opening up to ${maxThreads} to extract offer links...\n`);

const seen = new Set();
const offers = [];

const limit = Math.min(rows.length, maxThreads);
for (let i = 0; i < limit; i++) {
  // Re-query rows each iteration (DOM is rebuilt after navigating back).
  const handles = await page.$$('tr.zA');
  if (!handles[i]) break;
  const subject = await handles[i].$eval('.bog', (el) => el.innerText.trim()).catch(() => rows[i]?.subject || '');
  const sender = rows[i]?.sender || '';
  try {
    await handles[i].click();
    await page.waitForSelector('.a3s', { timeout: 12000 });
    await page.waitForTimeout(800);

    const hrefs = await page.$$eval('.a3s a', (as) => as.map((a) => a.href).filter(Boolean));
    for (const href of hrefs) {
      // Unwrap Google's redirect wrapper (google.com/url?q=REAL&...).
      let url = href;
      const m = href.match(/[?&]q=([^&]+)/);
      if (/google\.com\/url\?/.test(href) && m) url = decodeURIComponent(m[1]);
      if (!OFFER_RE.test(url) || NOISE_RE.test(url)) continue;
      // Dedupe by URL minus tracking query string.
      const key = url.split('?')[0].replace(/\/$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push({ url, source: sender || 'gmail', emailSubject: subject });
    }
  } catch (e) {
    console.log(`  (skip "${subject.slice(0, 50)}" — ${e.message.split('\n')[0]})`);
  }
  // Back to the result list.
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForSelector('tr.zA', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(500);
}

// Output.
const stamp = new Date().toISOString().slice(0, 10);
const outDir = `${HERE}/gmail-harvest`;
mkdirSync(outDir, { recursive: true });
const outFile = `${outDir}/offers-${stamp}.json`;
writeFileSync(outFile, JSON.stringify({ harvestedAt: new Date().toISOString(), query, count: offers.length, offers }, null, 2));

console.log(`\n=== ${offers.length} unique offer links harvested ===`);
for (const o of offers) console.log(`  ${o.url}\n    └ via ${o.source} — "${o.emailSubject.slice(0, 60)}"`);
console.log(`\nSaved → output/gmail-harvest/offers-${stamp}.json`);
console.log(`Pipeline-ready URLs (paste into data/pipeline.md, one per line):`);
for (const o of offers) console.log(o.url);

await browser.close(); // detaches CDP only; the automation browser stays open
