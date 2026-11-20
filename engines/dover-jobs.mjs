// ============================================================================
// dover-jobs.mjs — Dover startup job board mapper (jobs.dover.com, CDP + same-origin JSON API, 0 LLM tokens).
//
// MAP ONLY (owner order 2026-11-11): Dover's "Apply" is a per-company form → the USER applies by hand
// (`apply: manual`). The engine never clicks Apply.
//
// Why an API and not keywords: the whole board is small (~500 open jobs, ~2–20 remote per week) and its own UI
// calls /api/v1/job-board/jobs/ — so instead of guessing ultra-specific titles we do what the UI does with
// "All location types → Remote" + "Any time posted → Past week" + "Most recent", and page by date until the
// postings are older than --max-age. Role fit is the LM's two-way-fit triage (plus the title pre-filter).
// The calls run INSIDE the user's own jobs.dover.com tab (same origin, real browser + cookies), never from Node.
//
// Output (temp, resumable — same shape as board-sweep so the source-boards triage is identical):
//     output/board-sweep/dover-jobs.json
// Usage:
//   node engines/dover-jobs.mjs                          # remote, posted ≤7 days, whole board
//   node engines/dover-jobs.mjs --jd                     # + each JD from the detail API (paced)
//   node engines/dover-jobs.mjs --workplace any --kw "Frontend,React"
// Flags: --workplace remote|hybrid|onsite|any (default remote — from the user's modality) · --kw "a,b" (optional;
//        Dover's own search box) · --max-age D (default 7) · --jd · --max-views N (default 120) · --pace X (>=1)
//        · --fresh · --no-prefilter · --port 9333
//
// ANTI-BLOCK (mandatory — same rules as board-sweep): ONE process, ONE tab, SERIAL. List page 8–15 s ·
// JD 4–9 s · between keywords 45–90 s · ≤120 API calls/run. 403/405/423/429 or a challenge that doesn't clear
// → STOP, write output/board-sweep/dover-block.json → no retry the same day.
//
// SESSION (owner order 2026-11-11): the engine rides the user's OWN Dover session (Conexiones). Right after landing it
// applies the Conexiones rule (engines/connections.mjs → Dover) to its page; logged out → it prints
// `⏸ DOVER-LOGIN-NEEDED`, closes its tab and exits 6 (no block file, nothing mapped) → GARY's LM tells the user to
// sign in from Conexiones → Dover → Conectar, then "Verificar", and re-runs. The engine never logs in for the user.
// ============================================================================
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { acquireSiteLock } from './_site-lock.mjs';
import { breathe, machinePace } from './_machine-guard.mjs';
import { CONNECTIONS, verifyPage } from './connections.mjs';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const WORKPLACE = { remote: 'REMOTE', hybrid: 'HYBRID', onsite: 'IN_OFFICE', any: '' }[arg('--workplace', 'remote').toLowerCase()];
if (WORKPLACE === undefined) { console.error('usage: --workplace remote|hybrid|onsite|any'); process.exit(1); }
const MAX_AGE = Math.max(0, parseInt(arg('--max-age', '7'), 10));
const WANT_JD = process.argv.includes('--jd');
const FRESH = process.argv.includes('--fresh');
const PREFILTER = !process.argv.includes('--no-prefilter');
const PACE = Math.max(1, parseFloat(arg('--pace', '1')) || 1);
const MAX_VIEWS = Math.max(1, parseInt(arg('--max-views', '120'), 10));
const PORT = arg('--port', process.env.CDP_PORT || '9333');
const KEYWORDS = arg('--kw', '') ? arg('--kw', '').split(',').map((s) => s.trim()).filter(Boolean) : [''];
const ORIGIN = 'https://jobs.dover.com';
const LIMIT = 50;

await acquireSiteLock('dover.com');   // ONE bot per site + machine budget

// Title pre-filter = the candidate's generated reject list (never hardcoded).
let CFG = {};
const CFG_FILE = 'config/easyapply-filter.json';
if (existsSync(CFG_FILE)) { try { CFG = JSON.parse(readFileSync(CFG_FILE, 'utf8')); } catch (e) { console.log(`${CFG_FILE} unreadable (${e.message}).`); } }
const REJECT = PREFILTER ? (CFG.reject || []).filter((r) => r && r.re && !r.re.includes('{{')).map((r) => ({ re: new RegExp(r.re, 'i'), why: r.why })) : [];

const DIR = 'output/board-sweep';
mkdirSync(DIR, { recursive: true });
const OUT = `${DIR}/dover-jobs.json`;
const BLOCK = `${DIR}/dover-block.json`;
const today = new Date().toISOString().slice(0, 10);
if (existsSync(BLOCK)) {
  try { const b = JSON.parse(readFileSync(BLOCK, 'utf8')); if (b.date === today) { console.error(`⛔ dover blocked earlier today (${b.reason}). Not retrying until tomorrow.`); process.exit(2); } } catch {}
}
const byUrl = new Map();
if (!FRESH && existsSync(OUT)) { try { for (const j of JSON.parse(readFileSync(OUT, 'utf8')).jobs || []) byUrl.set(j.url, j); } catch {} }
const save = () => writeFileSync(OUT, JSON.stringify({ site: 'dover', updated: new Date().toISOString(), keywords: KEYWORDS.filter(Boolean), workplace: WORKPLACE || 'ANY', jobs: [...byUrl.values()] }, null, 2));

let browser;
try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); }
catch { console.error(`CDP ${PORT} down — start the automation Chrome (engines/start-chrome-debug.sh / .cmd) and retry.`); process.exit(1); }
const page = await browser.contexts()[0].newPage();
await page.bringToFront().catch(() => {});   // the user can watch the bot work

let views = 0, ABORT = '';
const nap = async (minS, maxS) => { await page.waitForTimeout(Math.round((minS + Math.random() * (maxS - minS)) * 1000 * PACE * machinePace())); await breathe(); };
const finish = async (code = 0) => {
  save();
  if (ABORT) { writeFileSync(BLOCK, JSON.stringify({ site: 'dover', date: today, reason: ABORT }, null, 2)); console.error(`\n⛔ DOVER-BLOCK: ${ABORT}. Run STOPPED, progress saved. Do NOT retry today.`); }
  await page.close().catch(() => {});
  await browser.close();   // detaches CDP only; the browser stays open
  process.exit(code);
};

// Land on the board like a person (lets Cloudflare set its cookies), then call the API from that page.
views++;
try { await page.goto(`${ORIGIN}/?q=&ordering=recent`, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
catch (e) { console.error(`navigation failed (${e.message.split('\n')[0]})`); await finish(1); }
const CHALLENGE_RE = /just a moment|verifying you are human|attention required|unusual traffic|are you a robot|captcha|access denied/i;
let settled = false;
for (let t = 0; t < 8 && !settled; t++) {
  const head = await page.evaluate(() => `${document.title}\n${(document.body?.innerText || '').slice(0, 1500)}`).catch(() => '');
  settled = head.trim().length > 200 && !CHALLENGE_RE.test(head);
  if (!settled) await page.waitForTimeout(2500);
}
if (!settled) { ABORT = 'bot challenge / captcha did not clear on jobs.dover.com'; await finish(1); }

// The user's Dover session (same browser profile = same cookies as their own tab). Logged out → ask, don't map.
const sess = await verifyPage(page, CONNECTIONS.find((c) => c.site === 'Dover'));
if (!sess.yes) {
  console.error(`\n⏸ DOVER-LOGIN-NEEDED: no Dover session in the automation browser (${sess.how}). Ask the user to sign in from`
    + ` Conexiones → Dover → Conectar (their own account, e.g. Google) and press "Verificar", then run this again.`);
  await page.close().catch(() => {});
  await browser.close();
  process.exit(6);
}
console.log(`Dover session: ✓ (${sess.how})`);

// One same-origin GET → { status, json }. 403/405/423/429 = block; non-JSON = a challenge page.
async function api(path) {
  views++;
  const r = await page.evaluate(async (p) => {
    try { const res = await fetch(p, { credentials: 'include', headers: { accept: 'application/json' } }); const txt = await res.text(); let json = null; try { json = JSON.parse(txt); } catch {} return { status: res.status, json }; }
    catch (e) { return { status: 0, json: null, err: String(e) }; }
  }, path).catch((e) => ({ status: 0, json: null, err: e.message }));
  if ([403, 405, 423, 429].includes(r.status)) ABORT = `HTTP ${r.status} on ${path.slice(0, 90)}`;
  else if (r.status === 200 && !r.json) ABORT = `non-JSON answer (challenge?) on ${path.slice(0, 90)}`;
  return r;
}

const daysAgo = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : null; };
// "Remote (United States)" / "Hybrid (Chicago, IL; New York City, NY)" — the same text the Dover card shows.
const WP_LABEL = { REMOTE: 'Remote', HYBRID: 'Hybrid', ONSITE: 'Onsite', IN_OFFICE: 'Onsite' };   // filter value IN_OFFICE, rows say ONSITE
const locText = (j) => {
  const wp = WP_LABEL[j.workplace_type] || j.workplace_type || '';
  const names = (j.locations || []).map((l) => l.name || l.location_option?.display_name).filter(Boolean);
  return names.length ? `${wp} (${names.join('; ')})` : wp;
};
const salaryText = (c) => {
  if (!c || (!c.lower_bound && !c.upper_bound)) return '';
  const per = { YEARLY: '/ yr', HOURLY: '/ hr', MONTHLY: '/ mo' }[c.salary_range_type] || '';
  return `${c.currency_code || ''} ${c.lower_bound ?? ''}${c.upper_bound ? ` - ${c.upper_bound}` : ''} ${per}`.replace(/\s+/g, ' ').trim();
};

// JD HTML → plain text (block tags become line breaks; enough for the LM triage).
const htmlToText = (h) => h.replace(/<(br|\/p|\/li|\/h\d|\/div|\/ul|\/ol)[^>]*>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);

// ── 1. Map: newest first, page by offset until the postings fall out of the window ─────────────────────────
let rejected = 0, tooOld = 0;
for (const [ki, kw] of KEYWORDS.entries()) {
  if (ki > 0) { console.log('  … pausing between keywords'); await nap(45, 90); }
  for (let offset = 0; ; offset += LIMIT) {
    if (ABORT) break;
    if (views >= MAX_VIEWS) { console.error(`\n⏸  --max-views ${MAX_VIEWS} reached — stopping cleanly (resume later).`); break; }
    if (offset > 0) await nap(8, 15);
    const qs = new URLSearchParams({ limit: String(LIMIT), offset: String(offset), ordering: 'recent' });
    if (kw) qs.set('q', kw);
    if (WORKPLACE) qs.set('location_type', WORKPLACE);
    if (MAX_AGE <= 7) qs.set('date_posted', '7d');   // the UI's "Past week"; the own-date gate below still applies
    const { status, json } = await api(`/api/v1/job-board/jobs/?${qs}`);
    if (ABORT) break;
    if (status !== 200 || !Array.isArray(json?.results)) { console.log(`  [${kw || 'all'}] offset ${offset}: HTTP ${status} — stopping this keyword`); break; }
    let added = 0, old = 0;
    for (const j of json.results) {
      const url = `${ORIGIN}/?jobId=${j.id}`;
      const age = daysAgo(j.date_posted);
      if (age !== null && age > MAX_AGE) { old++; continue; }   // RECENCY rule: ≤ max-age days, by the offer's own date
      if (byUrl.has(url)) continue;
      const why = REJECT.find((r) => r.re.test(j.title || ''))?.why;
      if (why) { rejected++; continue; }
      byUrl.set(url, {
        site: 'dover', kw: kw || '(all listings)', id: j.id, url, title: (j.title || '').trim(), company: j.client?.name || '',
        location: locText(j), workplace: j.workplace_type || '', countries: [...new Set((j.locations || []).map((l) => l.location_option?.country).filter(Boolean))],
        employment: j.employment_type || '', salary: salaryText(j.compensation), posted: j.date_posted || '', postedDays: age,
        apply: 'manual', mapped: today,
      });
      added++;
    }
    tooOld += old;
    save();
    console.log(`  [${kw || 'all'}] offset ${offset}: ${json.results.length} jobs (of ${json.count}), +${added} new (total ${byUrl.size})`);
    if (!json.next || old > 0 || !json.results.length) break;   // newest-first → the first old one ends the window
  }
}

// ── 2. Optional JD capture from the detail API (paced, resumable) ─────────────────────────────────────────
if (WANT_JD && !ABORT) {
  const todo = [...byUrl.values()].filter((j) => !j.description || j.description.startsWith('ERROR'));
  console.log(`JD capture: ${todo.length} to fetch.`);
  for (const j of todo) {
    if (ABORT) break;
    if (views >= MAX_VIEWS) { console.error(`\n⏸  --max-views ${MAX_VIEWS} reached — stopping cleanly (resume later).`); break; }
    await nap(4, 9);
    const { status, json } = await api(`/api/v1/job-board/jobs/${j.id}/`);
    if (ABORT) break;
    const html = json?.user_provided_description || '';
    j.description = status === 200 && html ? htmlToText(html) : `ERROR: HTTP ${status}`;
    save();
  }
}

const live = [...byUrl.values()];
const withJd = live.filter((j) => j.description && !j.description.startsWith('ERROR')).length;
console.log(`Saved → ${OUT} (${live.length} offers${WANT_JD ? `, ${withJd} with JD` : ''}; ${rejected} dropped by title pre-filter; ${tooOld} older than ${MAX_AGE}d; ${views} views)`);
await finish(ABORT ? 1 : 0);
