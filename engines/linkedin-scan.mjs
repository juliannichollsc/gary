// ============================================================================
// THE SINGLE CANONICAL LinkedIn EASY APPLY scanner (homologated 2026-06-27).
// There is exactly ONE EasyApply engine — this file. (The old
// `linkedin-easyapply-search.mjs` was a duplicate and has been REMOVED.)
// Canonical methodology + the one command live in data/linkedin-playbook.md;
// every skill/agent points THERE, none restates the steps. Memory: linkedin-easyapply-traversal.
//
// OFFER-BY-OFFER (the config rule): navigate + paginate a filter, and for EACH card
// CLICK it so the detail pane loads the REAL JD, READ that JD, ANALYZE fit (keyword
// pre-filter at ZERO LLM cost), then move to the NEXT offer. Scrolling only lazy-loads
// the page's cards; the work is reading each offer. Global persistent dedup processes
// each jobId once, ever — so `&start=` pagination overlap is harmless. The few survivors
// (with JD excerpt) go to the LLM for the nuanced two-way-fit 0–5 score.
//
// Two modes, SAME per-offer logic (no second script, no divergence):
//   • One combo:  node engines/linkedin-scan.mjs --kw "Full Stack Developer" --loc "Latin America" [--tpr r604800] [--pages 5]
//   • Full sweep: node engines/linkedin-scan.mjs --all [--tpr r604800] [--pages 8]
//       (loops every TITLE × LOCATION in one tab, serial; writes a CONSOLIDATED survivors.json)
// Prereq: Chrome:9333 up + LinkedIn logged in (output\start-chrome-debug.cmd). Never relaunches.
// PORTABLE: titles/locations are candidate config — for a different CV, derive from their profile.
// ============================================================================
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ALL = process.argv.includes('--all');
const kwArg = arg('--kw', 'Full Stack Developer');
const locArg = arg('--loc', 'Latin America');  // text location (LinkedIn resolves it; no invented geoIds)
const geoArg = arg('--geo', '');               // optional geoId (overrides loc text if given)
const tpr = arg('--tpr', 'r604800');           // r86400 = 24h, r604800 = past week
const maxPages = parseInt(arg('--pages', ALL ? '8' : '5'), 10);
const PORT = arg('--port', process.env.CDP_PORT || '9333');

// ---- CV-AGNOSTIC filter config (the candidate-specific data lives OUTSIDE the code) ----
// config/easyapply-filter.json holds titles, locations, positive stack signals, and reject
// patterns. Swap that file to run this SAME engine for a different CV. Built-in defaults
// (a neutral sample candidate) are the fallback if the config is missing.
// candidate values come from config/easyapply-filter.json + config/profile.yml — never hardcode PII
const DEFAULTS = {
  titles: ['Frontend Developer', 'Angular Developer', 'Mobile Developer', 'Full Stack Developer'],
  locations: [{ loc: 'Latin America' }, { loc: 'Worldwide', geo: '92000000' }, { loc: 'United States' }, { loc: 'Canada' }, { loc: 'European Union' }, { loc: 'United Kingdom' }],
  positive: ['react', 'angular', 'node\\.?js', 'next\\.?js', 'typescript', 'javascript', 'react native', 'full[- ]?stack', 'front[- ]?end', 'nestjs', '\\bvue\\b'],
  reject: [
    { re: '\\b(junior|jr\\.?|intern|internship|trainee|entry[- ]level)\\b', why: 'junior/entry' },
    { re: '\\bword ?press\\b|\\bdrupal\\b', why: 'wordpress/cms' },
    { re: '\\.net\\b|asp\\.net|\\bc#\\b', why: '.NET/C#' },
    { re: '\\bjava\\b(?!script)', why: 'java' }, { re: '\\bgolang\\b|\\bgo (developer|engineer)\\b', why: 'go' },
    { re: '\\b(rust|elixir|scala|kotlin|\\.?php)\\b', why: 'other-lang' }, { re: '\\bruby\\b|\\brails\\b', why: 'ruby/rails' },
    { re: '\\bpl\\/?sql\\b', why: 'pl/sql' }, { re: '\\bdata engineer(ing)?\\b|\\bsnowflake\\b|\\betl\\b', why: 'data-eng' },
    { re: '\\b(devops|sre)\\b|\\bqa\\b|\\bsdet\\b', why: 'devops/qa' }, { re: '\\bsalesforce\\b|\\bsap\\b', why: 'salesforce/sap' },
    { re: 'u\\.?s\\.? work authorization|(u\\.?s\\.?|american) citizen|green card|security clearance|e-?verify', why: 'US work-auth' },
    { re: '(c1|c2)\\s*(english|inglés)|(english|inglés)\\s*(c1|c2)|native english', why: 'C1/C2 English' },
    { re: '\\b(1[0-9]|[2-9][0-9])\\+\\s*years\\b', why: '10+ yrs' },
  ],
};
let CFG = DEFAULTS;
const CFG_FILE = 'config/easyapply-filter.json';
if (existsSync(CFG_FILE)) {
  try { const c = JSON.parse(readFileSync(CFG_FILE, 'utf8')); CFG = { ...DEFAULTS, ...c }; console.log(`Filter config: ${CFG_FILE} (candidate: ${c.candidate || '?'})`); }
  catch (e) { console.log(`Filter config unreadable (${e.message}); using built-in defaults.`); }
} else { console.log('No config/easyapply-filter.json — using built-in defaults (sample candidate).'); }
// Optional slice flags — for PARALLEL multi-tab runs (1 worker per slice, each with its
// OWN --seen/--out file to avoid write races; merge afterward). Default = full config.
const titlesArg = arg('--titles', '');
const locsArg = arg('--locs', '');
const ALL_TITLES = titlesArg ? titlesArg.split(',').map(s => s.trim()).filter(Boolean) : CFG.titles;
let ALL_LOCATIONS = CFG.locations;
if (locsArg) { const want = locsArg.split(',').map(s => s.trim().toLowerCase()); ALL_LOCATIONS = CFG.locations.filter(L => want.includes((L.loc || '').toLowerCase())); }

mkdirSync('output/gmail-harvest', { recursive: true });
const SEEN = arg('--seen', 'output/gmail-harvest/linkedin-seen.json');
let seen = {}; if (existsSync(SEEN)) { try { seen = JSON.parse(readFileSync(SEEN, 'utf8')); } catch {} }
// Only PLAIN {id → record} entries belong in seen. A legacy/corrupt file could carry array-like index
// keys ("0","1",…) or non-object values; those poison dedup and can blow up pretty-print, so drop them
// before persisting. Pretty-print first for readability, fall back to compact if V8 ever refuses it.
const cleanSeen = () => { for (const k of Object.keys(seen)) { if (!/^\d{6,}$/.test(k) || !seen[k] || typeof seen[k] !== 'object') delete seen[k]; } };
const writeSeen = () => {
  cleanSeen();
  try { writeFileSync(SEEN, JSON.stringify(seen, null, 2)); }
  catch { writeFileSync(SEEN, JSON.stringify(seen)); }
};

// RESTRICTIVE keyword PRE-FILTER, built from the CV config. An offer survives ONLY if it
// matches >=1 positive stack signal (it meets the CV) AND hits NO reject pattern (the CV
// doesn't do that). Anything else is dropped — we do NOT pass through cases the CV can't fill.
const REJECT = CFG.reject.map(r => ({ re: new RegExp(r.re, 'i'), why: r.why }));
const POSITIVE = new RegExp(CFG.positive.join('|'), 'i');
const prefilter = (hay) => {
  for (const r of REJECT) if (r.re.test(hay)) return r.why;                  // CV doesn't do this → reject
  if (!POSITIVE.test(hay)) return 'no required stack signal (off-CV)';        // doesn't meet the CV → reject
  return null;                                                                // survives
};

// Work-type (MODALIDAD) — LinkedIn `f_WT`: 1 = on-site (presencial) · 2 = remote · 3 = hybrid (lista con comas
// permitida, p.ej. "1,3"). Deriva de la modalidad aceptada del onboarding (gary-context.md → easyapply-filter.json
// `workType`). Default '2' (remote) para compatibilidad. **REGLA: si es SOLO presencial (o híbrido), las `locations`
// deben ser la CIUDAD ACTUAL del candidato, no las regiones remotas** — eso se resuelve al DERIVAR easyapply-filter.json
// (locations = [{loc: "<ciudad>"}]); aquí solo aplicamos el work-type y recorremos las locations que traiga el config.
const WT = arg('--wt', '') || CFG.workType || '2';
const FILTERS = `f_AL=true&f_WT=${WT}&f_TPR=${tpr}&sortBy=DD`;
console.log(`Work-type f_WT=${WT} · locations: ${ALL_LOCATIONS.map((l) => l.geo || l.loc).join(', ') || '(none)'}`);

let browser;
try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); }
catch { console.error(`CDP ${PORT} down. Chrome:${PORT} must be up + logged in (no relaunch here).`); process.exit(1); }
const ctx = browser.contexts()[0];
// ALWAYS open THIS worker's OWN tab (never reuse an existing LinkedIn tab). This is what
// makes multi-agent runs safe: N parallel workers (1 per tab, each a DISJOINT title/location
// partition assigned by the orchestrator, each with its own --seen/--out) get N independent
// tabs and never collide on one page. Single-worker runs just get a fresh tab.
const page = await ctx.newPage();

// Scrape the detail PANE (the reliable source). The JD panel only renders in the SEARCH split-view
// layout — navigating directly to /jobs/view/{id} renders nav chrome instead (the bug that broke the
// first version). So the standalone-URL path (Gmail) opens /jobs/search/?currentJobId={id}, where the
// #job-details pane populates. Selectors are ordered stable-id-first then GENERIC [class*=…] fallbacks
// so a LinkedIn class rename still matches; if it stops matching entirely, the consecutive-empty guard
// in scanUrls escalates to the LM supervisor to refresh these selectors.
const scrapeDetail = () => page.evaluate(() => {
  const pick = (sels) => { for (const s of sels) { const el = document.querySelector(s); if (el && el.innerText.trim().length > 5) return el.innerText.replace(/\s+/g, ' ').trim(); } return ''; };
  return {
    jd: pick(['#job-details', '.jobs-description__content', '.jobs-description-content__text', '.jobs-box__html-content', '.show-more-less-html__markup', '[class*="jobs-description__content"]', 'article[class*="jobs-description"]', '[class*="jobs-description"]']),
    company: pick(['.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name', '[class*="unified-top-card__company-name"]']).slice(0, 60),
    where: pick(['.job-details-jobs-unified-top-card__primary-description-container', '.job-details-jobs-unified-top-card__tertiary-description-container', '.jobs-unified-top-card__primary-description', '[class*="unified-top-card__primary-description"]']).slice(0, 140),
    title: pick(['.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title', 'h1']).slice(0, 120),
  };
});

// Scan ONE (title, location) combo offer-by-offer. Shared `seen`/`page`. Returns its survivors.
async function scanCombo(kw, loc, geo) {
  const locPart = geo ? `geoId=${geo}` : `location=${encodeURIComponent(loc)}`;
  const base = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(kw)}&${locPart}&${FILTERS}`;
  const comboLabel = `${geo || loc}/${kw}`;
  const survivors = [], ids = new Set();
  let rejected = 0, dup = 0;
  for (let p = 0; p < maxPages; p++) {
    await page.goto(`${base}&start=${p * 25}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    for (let s = 0; s < 5; s++) { await page.mouse.wheel(0, 1700).catch(() => {}); await page.waitForTimeout(500); }
    if (/\/authwall|\/login/.test(page.url())) { console.error('Login wall — Chrome:9333 not logged in.'); break; }
    const cards = await page.$$eval('a[href*="/jobs/view/"]', as => {
      const o = [], s = new Set();
      for (const a of as) { const m = a.href.match(/\/jobs\/view\/(\d+)/); if (m && !s.has(m[1])) { s.add(m[1]); o.push({ id: m[1], title: (a.getAttribute('aria-label') || a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 90) }); } }
      return o;
    });
    let pageNew = 0;
    for (const c of cards) {
      if (ids.has(c.id)) continue;
      ids.add(c.id); pageNew++;
      if (seen[c.id]) { dup++; continue; }
      try {
        await page.locator(`a[href*="/jobs/view/${c.id}"]`).first().click({ timeout: 8000 });
        await page.waitForFunction((id) => location.href.includes('currentJobId=' + id), c.id, { timeout: 8000 }).catch(() => {});
        await page.waitForSelector('.jobs-description__content, #job-details', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(900);
        const data = await scrapeDetail();
        if (data.jd.length < 60) { ids.delete(c.id); continue; } // JD didn't load → leave UNSEEN, retry next run (don't pass it through)
        const why = prefilter(`${c.title} ${data.jd}`);          // RESTRICTIVE: screen TITLE + JD against the CV config
        if (why) {
          seen[c.id] = { title: c.title, company: data.company, where: data.where, combo: comboLabel, v: why, firstSeen: new Date().toISOString(), easy: true };
          rejected++;
        } else {
          const rec = { id: c.id, title: c.title, company: data.company, where: data.where, combo: comboLabel, url: `https://www.linkedin.com/jobs/view/${c.id}/`, jd: data.jd.slice(0, 1500), jdLoaded: data.jd.length >= 60 };
          survivors.push(rec);
          seen[c.id] = { title: c.title, company: data.company, where: data.where, combo: comboLabel, v: 'survivor', firstSeen: new Date().toISOString(), easy: true };
        }
      } catch (e) { /* leave unseen → retry next run */ }
    }
    console.log(`  [${comboLabel}] page ${p + 1}: ${pageNew} new ids (survivors ${survivors.length}, rejected ${rejected})`);
    writeSeen(); // incremental persistence (resumable + safe on hard stop)
    if (pageNew === 0 && p > 0) break;
  }
  console.log(`=== ${comboLabel} === scanned ${ids.size} | ${dup} seen | ${rejected} pre-filtered | ${survivors.length} SURVIVORS`);
  return { combo: comboLabel, scannedIds: ids.size, rejected, dup, survivors };
}

// ── URL-LIST mode (Gmail → LinkedIn), same reader/filter/output as the sweep ─────────────────────────────
// The Gmail path harvests standalone /jobs/view/{id} URLs; instead of WebFetch-ing each JD (tokens), we read
// them with the SAME logged-in CDP tab + the SAME zero-token pre-filter as the search sweep, and write the
// SAME survivors.json shape. Result: ONE JD reader, ONE filter, ONE file → the LM agent triages from the file
// with the JD already captured (NO WebFetch → big token reduction). Serial, one reused tab, gentle pacing
// (LinkedIn is logged-in over CDP → no WebFetch rate-limit; we stay serial to avoid detection).
const urlsArg = arg('--urls', '');

// Accepts a .txt list (one URL/line) OR any JSON (e.g. gmail-harvest offers-<date>.json) — deep-scans for
// /jobs/view/{id} and dedups by id.
function loadUrls(file) {
  const raw = readFileSync(file, 'utf8');
  let found = [];
  try { found = [...JSON.stringify(JSON.parse(raw)).matchAll(/\/jobs\/view\/(\d+)/g)].map(m => m[1]); }
  catch { found = [...raw.matchAll(/\/jobs\/view\/(\d+)/g)].map(m => m[1]); }
  const byId = new Map();
  // Open the SEARCH split-view (currentJobId) — the ONLY layout where the #job-details JD pane renders
  // for a standalone offer. Direct /jobs/view/{id} nav renders nav chrome and no JD (LinkedIn behaviour).
  for (const id of found) byId.set(id, `https://www.linkedin.com/jobs/search/?currentJobId=${id}`);
  return [...byId.values()];
}

async function scanUrls(urls) {
  const survivors = [], ids = new Set();
  let rejected = 0, dup = 0, closed = 0;
  // Escalation guard: if the JD pane fails to render for FAIL_LIMIT offers IN A ROW (not stale-seen, not
  // closed — genuinely empty), LinkedIn's DOM changed under us. Stop and hand the selector refresh to the
  // LM supervisor instead of silently marking dozens of live offers as unreadable. Tune with --fail-limit.
  const FAIL_LIMIT = Math.max(1, parseInt(arg('--fail-limit', '8'), 10));
  let emptyStreak = 0;
  for (const url of urls) {
    const m = url.match(/currentJobId=(\d+)|\/jobs\/view\/(\d+)/); if (!m) continue;
    const id = m[1] || m[2];
    if (ids.has(id)) continue; ids.add(id);
    if (seen[id]) { dup++; continue; }
    const recordUrl = `https://www.linkedin.com/jobs/view/${id}/`;         // canonical URL for the offers map
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (/\/authwall|\/login/.test(page.url())) { console.error('Login wall — Chrome not logged in.'); break; }
      await page.waitForSelector('#job-details, .jobs-description__content, [class*="jobs-description"]', { timeout: 14000 }).catch(() => {});
      await page.waitForTimeout(1500);   // the pane hydrates after the selector attaches — let the JD text settle
      const data = await scrapeDetail();
      if (data.jd.length < 60) {                                           // JD didn't render → leave UNSEEN, retry next run
        ids.delete(id);
        if (++emptyStreak >= FAIL_LIMIT) {
          console.error(`\n⚠️  ENGINE-SELECTOR-STALE: ${emptyStreak} offers in a row returned an empty JD (<60 chars).`);
          console.error(`   LinkedIn's job DOM has likely changed. LM SUPERVISOR: refresh the JD/title selectors in`);
          console.error(`   engines/linkedin-scan.mjs → scrapeDetail() pick([...]) and the waitForSelector list against`);
          console.error(`   the current /jobs/search/?currentJobId={id} layout, then re-run. Aborting scan.`);
          break;
        }
        continue;
      }
      emptyStreak = 0;                                                     // a real JD read → reset the streak
      const title = (data.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (/no longer accepting applications|ya no se aceptan|esta oferta ya no/i.test(`${title} ${data.jd}`)) {
        seen[id] = { title, company: data.company, where: data.where, combo: 'gmail-urls', v: 'closed', firstSeen: new Date().toISOString(), easy: true };
        closed++; writeSeen(); continue;
      }
      const why = prefilter(`${title} ${data.jd}`);                         // RESTRICTIVE: TITLE + JD vs the CV config
      if (why) {
        seen[id] = { title, company: data.company, where: data.where, combo: 'gmail-urls', v: why, firstSeen: new Date().toISOString(), easy: true };
        rejected++;
      } else {
        survivors.push({ id, title, company: data.company, where: data.where, combo: 'gmail-urls', url: recordUrl, jd: data.jd.slice(0, 1500), jdLoaded: true });
        seen[id] = { title, company: data.company, where: data.where, combo: 'gmail-urls', v: 'survivor', firstSeen: new Date().toISOString(), easy: true };
      }
    } catch { /* transient → leave unseen, retry next run */ }
    writeSeen();                        // incremental (resumable + safe on hard stop)
    await page.waitForTimeout(600);     // gentle pacing (anti-detection)
  }
  console.log(`=== gmail-urls === scanned ${ids.size} | ${dup} seen | ${closed} closed | ${rejected} pre-filtered | ${survivors.length} SURVIVORS`);
  return { scannedIds: ids.size, rejected, dup, closed, survivors };
}

const outF = arg('--out', 'output/gmail-harvest/survivors.json');

if (urlsArg) {
  const urls = loadUrls(urlsArg);
  console.log(`URL-list mode: ${urls.length} LinkedIn offers from ${urlsArg} — CDP read + zero-token pre-filter, serial (anti-block).`);
  const r = await scanUrls(urls);
  writeSeen();
  writeFileSync(outF, JSON.stringify({ source: 'urls', input: urlsArg, scannedIds: r.scannedIds, rejected: r.rejected, dup: r.dup, closed: r.closed, survivors: r.survivors }, null, 2));
  console.log(`\nSurvivors + JD excerpts → ${outF}  (JD already captured → the LLM triages from the FILE, NO WebFetch). seen.json: ${Object.keys(seen).length}`);
} else if (ALL) {
  // FULL SWEEP — every title × location, one tab, serial. Consolidated output.
  const byCombo = [], all = [];
  for (const kw of ALL_TITLES) {
    for (const L of ALL_LOCATIONS) {
      const r = await scanCombo(kw, L.geo ? '' : L.loc, L.geo || '');
      byCombo.push({ combo: r.combo, scanned: r.scannedIds, rejected: r.rejected, dup: r.dup, survivors: r.survivors.length });
      all.push(...r.survivors);
      writeSeen();
      writeFileSync(outF, JSON.stringify({ sweep: true, tpr, byCombo, totalSurvivors: all.length, survivors: all }, null, 2));
    }
  }
  console.log(`\n=== FULL SWEEP done: ${all.length} survivors across ${byCombo.length} combos ===`);
  for (const s of all) console.log(`  ${s.id}  ${s.combo}  ${s.company} — ${s.title}  [${s.where}]`);
  console.log(`\nConsolidated survivors + JD excerpts → ${outF}  (triage these, then score 0–5). seen.json: ${Object.keys(seen).length}`);
} else {
  const r = await scanCombo(kwArg, geoArg ? '' : locArg, geoArg);
  writeFileSync(outF, JSON.stringify({ combo: r.combo, scannedIds: r.scannedIds, rejected: r.rejected, dup: r.dup, survivors: r.survivors }, null, 2));
  console.log(`\nSurvivors + JD excerpts → ${outF}  (triage these few, then apply). seen.json: ${Object.keys(seen).length}`);
}
await browser.close().catch(() => {}); // detaches CDP; does NOT close Chrome's own browser process
