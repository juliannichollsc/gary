// Himalayas matches sweep — PAGINATED + per-job JD capture (CDP, ~0 tokens, no 429).
// Method (canonical, see .claude/agents/source-himalayas.md):
//   1. Go to /jobs/matches?page=1, read the MAX page number from the pagination control.
//   2. Loop ?page=1..N, mapping every match {url,title,company} (dedup by url).
//   3. Navigate to each unique job page and extract the JD description text from the DOM.
//      Runs through the already-logged-in Chrome:9333 session → no external requests → no 429.
//   4. Write output/gmail-harvest/himalayas-jobs.json = [{url,title,company,description}] for
//      the LLM to validate fit at the JD level (not by slug/title).
// Himalayas job DETAIL pages sit behind a Cloudflare "Just a moment..." bot challenge that
// AUTO-CLEARS in ~4s inside the real logged-in browser — so JD extraction POLLS until the
// challenge clears (don't extract on the 1st tick or you capture the challenge page).
// Anti-block cadence: JD pages are fetched with concurrency=2 and a ~2s gap between batches
// (mirrors the "max 2 bots / 2s" rule even though CDP is low-risk).
// Incremental + resumable: himalayas-jobs.json is rewritten after every batch; a re-run skips
// jobs already captured with a real (non-blocked) description.
// Usage: node engines/himalayas-matches.mjs [--max-pages N] [--no-desc] [--fresh]
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9333';
const argv = process.argv.slice(2);
const maxPagesArg = (() => { const i = argv.indexOf('--max-pages'); return i >= 0 ? parseInt(argv[i + 1], 10) : null; })();
const NO_DESC = argv.includes('--no-desc');
const MATCH_RE = /\/companies\/[^/]+\/jobs\/[^/?#]+/;
const BASE = 'https://himalayas.app/jobs/matches';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser;
try { browser = await chromium.connectOverCDP(CDP); }
catch { console.error(`CDP down at ${CDP} — relaunch Chrome (engines/start-chrome-debug.cmd) and retry.`); process.exit(1); }
const ctx = browser.contexts()[0];
mkdirSync('output/gmail-harvest', { recursive: true });

const page = await ctx.newPage();

// --- 1. discover total pages from the pagination control ---
await page.goto(`${BASE}?page=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2000);

let maxPage = 1;
try {
  maxPage = await page.evaluate(() => {
    let m = 1;
    // pagination renders page numbers as links/buttons with ?page=N or plain digits
    for (const a of document.querySelectorAll('a[href*="page="]')) {
      const n = parseInt(new URL(a.href).searchParams.get('page'), 10);
      if (Number.isFinite(n)) m = Math.max(m, n);
    }
    for (const el of document.querySelectorAll('a,button,li')) {
      const t = (el.innerText || '').trim();
      if (/^\d{1,3}$/.test(t)) m = Math.max(m, parseInt(t, 10));
    }
    return m;
  });
} catch {}
if (maxPagesArg) maxPage = Math.min(maxPage, maxPagesArg);
console.log(`Pagination: ${maxPage} page(s) of matches.`);

// --- 2. map every match across all pages (dedup by url) ---
const byUrl = new Map();
for (let p = 1; p <= maxPage; p++) {
  if (p > 1) {
    await page.goto(`${BASE}?page=${p}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 1600).catch(() => {}); await page.waitForTimeout(700); }
  const items = await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc); const seen = new Set(); const out = [];
    for (const a of document.querySelectorAll('a[href]')) {
      let path; try { path = new URL(a.href).pathname; } catch { continue; }
      if (!re.test(path)) continue;
      const key = a.href.split('?')[0];
      if (seen.has(key)) continue; seen.add(key);
      const company = (path.match(/\/companies\/([^/]+)\//) || [])[1] || '';
      const t = (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 100);
      out.push({ url: key, title: t, company });
    }
    return out;
  }, MATCH_RE.source);
  for (const it of items) if (!byUrl.has(it.url)) byUrl.set(it.url, it);
  console.log(`  page ${p}: +${items.length} links (total unique ${byUrl.size})`);
}

const jobs = [...byUrl.values()];
writeFileSync('output/gmail-harvest/himalayas-matches.txt', jobs.map((j) => j.url).join('\n') + '\n');
console.log(`Mapped ${jobs.length} unique matches → himalayas-matches.txt`);

// --- 3. capture JD description per job (concurrency 2, ~2s gap, Cloudflare-aware, resumable) ---
const OUT = 'output/gmail-harvest/himalayas-jobs.json';
const FRESH = argv.includes('--fresh');
const BLOCKED_RE = /just a moment|verification|attention required|verifying you are/i;
if (!NO_DESC) {
  // resume: reuse any real description already captured
  const prior = (!FRESH && existsSync(OUT)) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  const priorOk = new Map(prior.filter(j => j.description && !j.description.startsWith('ERROR') && !BLOCKED_RE.test(j.description)).map(j => [j.url, j.description]));
  let done = 0, skipped = 0;
  for (const j of jobs) if (priorOk.has(j.url)) { j.description = priorOk.get(j.url); skipped++; }
  console.log(`Resume: ${skipped} JD(s) already captured, ${jobs.length - skipped} to fetch.`);

  const extract = async (job) => {
    if (job.description) return;
    const jp = await ctx.newPage();
    try {
      await jp.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      // poll until Cloudflare challenge clears (auto-solves ~4s in the real browser)
      let txt = '', cleared = false;
      for (let t = 0; t < 8; t++) {
        await jp.waitForTimeout(2000);
        const title = await jp.title().catch(() => '');
        txt = await jp.evaluate(() => {
          const pick = document.querySelector('main') || document.querySelector('article') || document.body;
          return (pick.innerText || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        }).catch(() => '');
        if (!BLOCKED_RE.test(title) && !BLOCKED_RE.test(txt.slice(0, 200)) && txt.length > 800) { cleared = true; break; }
      }
      job.description = cleared ? txt.slice(0, 6000) : `ERROR: cloudflare-not-cleared`;
    } catch (e) { job.description = `ERROR: ${e.message.split('\n')[0]}`; }
    await jp.close().catch(() => {});
  };

  const todo = jobs.filter(j => !j.description);
  for (let i = 0; i < todo.length; i += 2) {
    await Promise.all(todo.slice(i, i + 2).map(extract));
    done = Math.min(i + 2, todo.length);
    writeFileSync(OUT, JSON.stringify(jobs, null, 2)); // incremental save → resumable
    const ok = jobs.filter(j => j.description && !j.description.startsWith('ERROR')).length;
    console.log(`  JD ${done}/${todo.length} (ok total ${ok}/${jobs.length})`);
    if (i + 2 < todo.length) await sleep(2000);
  }
}

writeFileSync(OUT, JSON.stringify(jobs, null, 2));
const okN = jobs.filter(j => j.description && !j.description.startsWith('ERROR')).length;
console.log(`Saved → ${OUT} (${jobs.length} jobs, ${okN} with real JD${NO_DESC ? ' [no-desc mode]' : ''})`);
await page.close().catch(() => {});
await browser.close();
