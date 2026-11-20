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
// FILTER MAPPING IS HUMAN-LIKE (2026-11 conversational layout): typed TITLE + ZONE, the Past week tag, modality +
// Easy Apply read from the card, "Page N" buttons — see applyFilterTags() below.
// PORTABLE: titles/locations are candidate config — for a different CV, derive from their profile.
// ============================================================================
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { acquireSiteLock } from './_site-lock.mjs';
import { breathe, machinePace } from './_machine-guard.mjs';
await acquireSiteLock('linkedin.com');   // ONE bot per site + machine budget (anti-block, anti-freeze) — see _site-lock.mjs

const arg = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ALL = process.argv.includes('--all');
const kwArg = arg('--kw', 'Full Stack Developer');
const locArg = arg('--loc', 'Latin America');  // text location (LinkedIn resolves it; no invented geoIds)
const geoArg = arg('--geo', '');               // optional geoId (overrides loc text if given)
const tpr = arg('--tpr', 'r604800');           // r86400 = 24h, r604800 = past week
// HARD ≤N-day gate (owner order 2026-11-10: max 1 week). LinkedIn's "Past week" tag can silently fail to apply in the
// conversational layout, and reposted/refreshed offers keep old dates → EVERY card and JD is checked against its own
// "N days/weeks/months ago" text (EN/ES). Older → not opened (card) / rejected (detail). Unknown age → kept.
const MAX_AGE_DAYS = parseInt(arg('--max-age', String({ r86400: 1, r604800: 7, r2592000: 30 }[tpr] ?? 7)), 10);
function postedDays(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(just now|moments? ago|justo ahora|recién|hace un momento)\b/.test(t)) return 0;
  const UNIT = { minute: 0, min: 0, hour: 0, day: 1, week: 7, month: 30, year: 365, minuto: 0, hora: 0, 'día': 1, dia: 1, semana: 7, mes: 30, 'año': 365, ano: 365 };
  let m = t.match(/(\d+|an?|one)\s*(minute|min|hour|day|week|month|year)s?\s+ago/);
  if (!m) m = t.match(/hace\s+(\d+|un|una)\s*(minuto|hora|día|dia|semana|mes|año|ano)(?:s|es)?\b/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : 1;
  return n * UNIT[m[2]];
}
const tooOld = (text) => { const d = postedDays(text); return d != null && d > MAX_AGE_DAYS ? d : 0; };
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
// Search filters are the USER'S (owner order 2026-11-10): titles from the CV (RAG / gary-context.md), zone + modality
// ASKED at search time, written into config/easyapply-filter.json. Never a silent default: without them the search
// modes refuse to run (the Gmail --urls mode doesn't search, so it doesn't need them).
if (!arg('--urls', '') && !arg('--kw', '') && (!existsSync(CFG_FILE) || /\{\{/.test(JSON.stringify([CFG.titles, CFG.locations, CFG.workType])))) {
  console.error('⛔ LINKEDIN-FILTERS missing: config/easyapply-filter.json has no confirmed titles/locations/workType.'
    + ' LM: take the titles from the CV (NotebookLM RAG / gary-context.md), ASK the user the zone(s) and modality,'
    + ' write them there, then re-run.');
  process.exit(2);
}
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
// ONE worker, ONE tab, SERIAL. NEVER run several linkedin-scan processes in parallel (one per tab/partition):
// the whole account shares ONE rate budget, so N workers = N× the request rate → 429 + LinkedIn "integrity"
// account checkpoint. Parallelism is across SOURCES only (e.g. Gmail harvest beside this scan).
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});   // wide = list + detail split view

// ── ANTI-BLOCK PACING (mandatory — documented in .claude/skills/source-linkedin §1) ──────────────────────
// Human-like, JITTERED waits (never fixed intervals, never bursts). Defaults ≈ 8–10 offers/min max:
//   card/offer open: 4–9 s · results page: 8–15 s · between combos: 60–150 s · per-run cap: --max-views 120
// --pace <x> scales every wait (e.g. --pace 1.5 slower). Below 1 is refused: those are the floor.
const PACE = Math.max(1, parseFloat(arg('--pace', '1')) || 1);
const MAX_VIEWS = Math.max(1, parseInt(arg('--max-views', '120'), 10));
let views = 0, ABORT = '';
const nap = async (minS, maxS) => { await page.waitForTimeout(Math.round((minS + Math.random() * (maxS - minS)) * 1000 * PACE * machinePace())); await breathe(); };   // + machine back-off
// Any 429 on a LinkedIn document → stop the whole run (never retry into a throttle).
page.on('response', (r) => { if (r.status() === 429 && /linkedin\.com/.test(r.url()) && !ABORT) ABORT = `HTTP 429 on ${r.url().slice(0, 80)}`; });
// Checkpoint / "unusual activity" / security verification = the account-integrity wall → STOP for the user.
async function blocked() {
  if (ABORT) return ABORT;
  const u = page.url();
  if (/\/checkpoint|\/challenge|\/authwall|\/login|\/uas\//.test(u)) return (ABORT = `wall: ${u.slice(0, 80)}`);
  const t = await page.evaluate(() => (document.body?.innerText || '').slice(0, 4000)).catch(() => '');
  if (/unusual activity|actividad inusual|security verification|verificaci[oó]n de seguridad|let'?s do a quick security check|too many requests/i.test(t)) return (ABORT = 'LinkedIn integrity/security check on page');
  return '';
}
const stopNow = () => { if (ABORT) { console.error(`\n⛔ LINKEDIN-BLOCK: ${ABORT}. Run STOPPED + progress saved. Do NOT retry today — let the user clear any check in Chrome:9333, then resume later (seen.json makes it resumable).`); return true; } if (views >= MAX_VIEWS) { console.error(`\n⏸  --max-views ${MAX_VIEWS} reached — stopping cleanly (resume in a later session).`); return true; } return false; };

// Scrape the detail PANE (the reliable source). Older layouts rendered the JD only in the SEARCH split-view
// (/jobs/search/?currentJobId={id}); since 2026-11-13 the Gmail path opens the e-mail's own link instead (see
// loadUrls — the crafted split-view URL landed on the AI-powered search, a bot signature) and the 2026-11
// fallbacks below (expandable-text-box + document.title) read the offer page; --split-view keeps the old path. Selectors are ordered stable-id-first then GENERIC [class*=…] fallbacks
// so a LinkedIn class rename still matches; if it stops matching entirely, the consecutive-empty guard
// in scanUrls escalates to the LM supervisor to refresh these selectors.
const scrapeDetail = () => page.evaluate(() => {
  const pick = (sels) => { for (const s of sels) { const el = document.querySelector(s); if (el && el.innerText.trim().length > 5) return el.innerText.replace(/\s+/g, ' ').trim(); } return ''; };
  const out = {
    jd: pick(['#job-details', '.jobs-description__content', '.jobs-description-content__text', '.jobs-box__html-content', '.show-more-less-html__markup', '[class*="jobs-description__content"]', 'article[class*="jobs-description"]', '[class*="jobs-description"]']),
    company: pick(['.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name', '[class*="unified-top-card__company-name"]']).slice(0, 60),
    where: pick(['.job-details-jobs-unified-top-card__primary-description-container', '.job-details-jobs-unified-top-card__tertiary-description-container', '.jobs-unified-top-card__primary-description', '[class*="unified-top-card__primary-description"]']).slice(0, 140),
    title: pick(['.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title', 'h1']).slice(0, 120),
  };
  // 2026-11-10 layout (/jobs/search-results/, obfuscated classes): the JD is the largest
  // [data-testid="expandable-text-box"]; title/company come from document.title ("Role | Company | LinkedIn");
  // location/workplace from the top-card meta line ("Colombia · 2 days ago · …") + Remote/Hybrid/On-site chip.
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  if (out.jd.length < 60) {
    const boxes = [...document.querySelectorAll('[data-testid="expandable-text-box"]')].sort((a, b) => b.innerText.length - a.innerText.length);
    if (boxes[0]) out.jd = clean(boxes[0].innerText);
  }
  out.easy = [...document.querySelectorAll('button,a')].some((b) => /^\s*(Easy Apply|Solicitud sencilla)\s*$/i.test(b.innerText || '') || /^Easy Apply to /i.test(b.getAttribute('aria-label') || ''));
  const dt = document.title.split(' | ');
  if (!out.title && dt.length >= 3) out.title = dt[0].slice(0, 120);
  if (!out.company && dt.length >= 3) out.company = dt[1].slice(0, 60);
  if (!out.where) {
    const meta = [...document.querySelectorAll('p,span,div')].find(e => { const t = clean(e.innerText); return t.length > 8 && t.length < 220 && / · /.test(t) && /(ago|hace|applicant|solicitud|reposted|publicad)/i.test(t) && !e.querySelector('p,div'); });
    const chip = [...document.querySelectorAll('button,span,a')].map(e => clean(e.innerText)).find(t => /^(Remote|Hybrid|On-site|Remoto|Híbrido|Presencial)$/i.test(t));
    out.where = clean([meta ? meta.innerText : '', chip || ''].join(' · ')).slice(0, 140);
  }
  return out;
});

// ── HUMAN-LIKE FILTER MAPPING (owner order 2026-11-10: LinkedIn must not detect the bot or the AI) ──────────
// LinkedIn's 2026-11 jobs search is CONVERSATIONAL (/jobs/search-results/): the legacy URL filters
// (f_WT / f_TPR / f_AL / geoId / &start=) are IGNORED by the new layout and a hand-built filter URL is a bot
// signature. So the mapping behaves like a person:
//   1. TYPE what a person types in LinkedIn's own box ("Describe the job you want"): TITLE + ZONE, human
//      keystroke jitter. NEVER a long prompt-like sentence (reads as AI) and never a crafted URL.
//   2. ONE filter tag, like a person: Date posted = Past week (All filters dialog). Nothing else by default —
//      every extra click is more activity to analyse and the pre-filter + LM triage already judge fit.
//      (Experience / Employment / AI-suggested tags exist as OPT-IN in linkedinFilters, off unless set.)
//   3. Modality and Easy Apply → filtered HERE from the card text ("(Remote)", "Easy Apply"): 0 extra requests,
//      the card is not even opened.
//   4. Paginate with the "Page N" buttons, hover + wheel the list, jittered dwell times.
// If the new search box isn't there (old layout / A-B test) the legacy URL path is used as fallback.
const LF = CFG.linkedinFilters || {};
const real = (v) => v != null && !/\{\{/.test(JSON.stringify(v));                      // ignore unfilled template values
const LF_EXP = real(LF.experience) ? [].concat(LF.experience) : [];
const LF_EMP = real(LF.employment) ? [].concat(LF.employment) : [];
const LF_TAGS = real(LF.tags) ? LF.tags : [];                                        // opt-in: 'auto' | ['Frontend', …]
// Easy Apply is a FLAG, not a filter (owner order): EVERY offer is mapped; `apply: 'auto'` (Easy Apply) feeds the
// auto-apply engines, `apply: 'manual'` survivors go to the offers map for the USER to apply by hand.
const EASY_ONLY = LF.easyApplyOnly === true;                                          // opt-in only
const DATE_LABEL = { r86400: /^(Past 24 hours|Últimas 24 horas)$/i, r604800: /^(Past week|Última semana|Semana pasada)$/i, r2592000: /^(Past month|Último mes|Mes pasado)$/i };
const BOX = '[data-testid="typeahead-input"], input[placeholder*="Describe the job" i], input[placeholder*="Describe el empleo" i]';
const CARD = '[componentkey^="job-card-component-ref-"]';
// GARY_LI_HOME = offline regression fixture (engines/fixtures/linkedin-search-results.html) — never set in real runs.
const JOBS_HOME = process.env.GARY_LI_HOME || 'https://www.linkedin.com/jobs/';

// Owner order 2026-11-10 (screenshot: "Full Stack Developer Colombia" + Date posted NOT applied): do it like a person
// — (1) type ONLY the role, (2) pick the REGION in LinkedIn's own location control ("📍 Colombia ▾" beside
// "N results"), (3) tick Date posted → Past week in its own pill. Never put the place inside the query.
const humanQuery = (kw) => String(kw).replace(/\s+/g, ' ').trim();
const REGION_OF = (loc, geo) => (geo === '92000000' || /^(worldwide|anywhere|global)$/i.test(loc || '')) ? 'Worldwide' : (loc || '');
// Accepted modality (workType 1=on-site 2=remote 3=hybrid) checked against the card's "(Remote)/(Hybrid)/(On-site)".
const WANT_MODES = new Set(String(WT).split(',').map((x) => ({ '1': 'on-site', '2': 'remote', '3': 'hybrid' })[x.trim()]).filter(Boolean));
const cardModeOk = (mode) => !mode || !WANT_MODES.size || WANT_MODES.has(mode);
// On-site / hybrid only count IN THE USER'S CITY (onboarding "Ubicación" → easyapply-filter.json `city`, optional).
// Remote cards are judged by region later (triage). No `city` set → no city gate (previous behavior).
const CITY = real(CFG.city) && CFG.city ? String(CFG.city) : '';
const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const cityOk = (mode, text) => !CITY || !mode || mode === 'remote' || fold(text).includes(fold(CITY));
// EVERY card this run saw, with what happened to it → output/linkedin-jobs.json (the temp map for the LM, like
// board-sweep's <site>-jobs.json). Survivors keep their JD in the survivors file; this is the full picture.
const MAPPED = [];
const mapRec = (c, combo, outcome, extra = {}) => MAPPED.push({ id: c.id, url: `https://www.linkedin.com/jobs/view/${c.id}/`, title: c.title, card: (c.raw || '').slice(0, 220), mode: c.mode || '', easy: !!c.easy, combo, outcome, ...extra });
const CLOSED_RE = /no longer accepting applications|ya no (se )?acepta(n)? (solicitudes|postulaciones)|esta oferta ya no/i;

// Suggested tag ↔ title match: "Frontend Developer React" → Frontend · "AI Engineer" → Gen AI · "Backend …" → Backend.
const STOP = new Set(['senior', 'sr', 'developer', 'engineer', 'jobs', 'job', 'remote', 'lead', 'the', 'and', 'with']);
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').trim();
function pickTags(suggested, kw) {
  if (Array.isArray(LF_TAGS)) return suggested.filter((t) => LF_TAGS.some((w) => norm(w) === norm(t)));
  if (LF_TAGS !== 'auto') return [];
  const kwN = norm(kw), kwFlat = kwN.replace(/ /g, ''), toks = new Set(kwN.split(' ').filter((x) => x.length >= 2 && !STOP.has(x)));
  return suggested.filter((t) => { const tn = norm(t); return kwFlat.includes(tn.replace(/ /g, '')) || tn.split(' ').some((x) => toks.has(x)); });
}

async function typeSearch(q) {
  let box = page.locator(BOX).filter({ visible: true }).first();
  if (!(await box.count())) {
    await page.goto(JOBS_HOME, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await nap(4, 8);
    box = page.locator(BOX).filter({ visible: true }).first();
  }
  if (!(await box.count())) return false;                                               // old layout → legacy path
  await box.hover({ timeout: 4000 }).catch(() => {}); await nap(0.3, 0.9);
  await box.click({ timeout: 6000 }); await nap(0.3, 0.8);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A'); await nap(0.2, 0.5);
  await page.keyboard.press('Backspace'); await nap(0.4, 1.2);
  if (await box.inputValue().catch(() => '')) await box.fill('');                       // previous query must be gone
  await box.pressSequentially(q, { delay: 60 + Math.random() * 90 });
  await nap(0.8, 2.2);
  if ((await box.inputValue().catch(() => q)).trim() !== q) {                           // autocomplete/typo guard
    console.warn(`  ⚠ LINKEDIN-QUERY: box held "${await box.inputValue().catch(() => '?')}" instead of "${q}" — retyping.`);
    await box.fill(q); await nap(0.5, 1.2);
  }
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/jobs\/search-results\//, { timeout: 20000 }).catch(() => {});
  await nap(4, 8);
  return true;
}

// Tag the on-screen element that matches `sel` (+ optional text) CLOSEST to the anchor, so we click the control the
// user sees — LinkedIn keeps hidden duplicates (the All-filters dialog) of the same inputs in the DOM.
async function tagNear(sel, anchorSel, textSrc, tag) {
  return page.evaluate(({ sel, anchorSel, textSrc, tag }) => {
    document.querySelectorAll(`[data-gary="${tag}"]`).forEach((e) => e.removeAttribute('data-gary'));
    const a = anchorSel ? document.querySelector(anchorSel) : null;
    const ar = a ? a.getBoundingClientRect() : { left: 0, top: 0 };
    const re = textSrc ? new RegExp(textSrc, 'i') : null;
    let best = null, bd = Infinity;
    for (const e of document.querySelectorAll(sel)) {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) continue;          // on screen only
      if (re && !re.test((e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())) continue;
      const d = Math.hypot(r.left - ar.left, r.top - ar.top);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) best.setAttribute('data-gary', tag);
    return best ? (best.innerText || best.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60) : null;
  }, { sel, anchorSel, textSrc, tag });
}
const RESULTS_RE = /^\s*[\d,.]+\+?\s+(results|resultados)\b/i;
// The "📍 <place> ▾" control beside "N results": a clickable element in the results header that isn't the
// "How promoted jobs are ranked / How AI search works" links.
async function tagRegionControl() {
  return page.evaluate((src) => {
    document.querySelectorAll('[data-gary="region"]').forEach((e) => e.removeAttribute('data-gary'));
    const re = new RegExp(src, 'i');
    const hdr = [...document.querySelectorAll('h1,h2,h3,p,span,div')].find((e) => re.test(e.innerText || '') && (e.innerText || '').length < 160);
    let box = hdr;
    for (let i = 0; i < 4 && box; i++) {
      const c = [...box.querySelectorAll('button,[role=button],[aria-haspopup],[aria-expanded]')]
        .find((e) => { const t = (e.innerText || '').replace(/\s+/g, ' ').trim(); return t && t.length < 60 && !/promoted|ai search|results/i.test(t); });
      if (c) { c.setAttribute('data-gary', 'region'); return (c.innerText || '').replace(/\s+/g, ' ').trim(); }
      box = box.parentElement;
    }
    return null;
  }, RESULTS_RE.source);
}

async function setRegion(region) {
  if (!region) return null;
  const cur = await tagRegionControl();
  if (cur == null) { console.warn(`  ⚠ LINKEDIN-REGION: location control not found — results stay on LinkedIn's default place.`); return null; }
  if (cur.toLowerCase() === region.toLowerCase()) return region;                         // already there
  const ctl = page.locator('[data-gary="region"]').first();
  await ctl.hover({ timeout: 4000 }).catch(() => {}); await nap(0.4, 1.1);
  await ctl.click({ timeout: 6000 }).catch(() => {}); await nap(1.2, 2.5);
  // Live DOM (mapped 2026-11-10): the control opens a location input with a "Clear location" (×) button and the
  // suggestions as LINKS (<a>Colombia</a>, <a>Medellín, Antioquia, Colombia</a>) — not role=option items.
  // Mapped live 2026-11-10: "Clear location" leaves the FOCUS in the location field (not exposed as a visible <input>),
  // so the region is typed with the keyboard right after it; LinkedIn then lists it as a link (<a>Latin America</a>).
  const clear = page.getByRole('button', { name: /^(Clear location|Borrar ubicación)$/i }).first();
  if (await clear.count()) { await clear.hover({ timeout: 3000 }).catch(() => {}); await nap(0.3, 0.8); await clear.click({ timeout: 4000 }).catch(() => {}); await nap(0.6, 1.4); }
  else { await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {}); await page.keyboard.press('Backspace').catch(() => {}); await nap(0.4, 1); }
  await page.keyboard.type(region, { delay: 70 + Math.random() * 90 });
  await nap(2, 3.5);
  const input = page.locator('input:focus').first();
  const esc = region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const opt = await tagNear('a, [role=option], [role=listbox] li, [role=menuitem], [role=menuitemradio]', '[data-gary="region"]', `^${esc}\\b`, 'region-opt');
  if (opt) { const o = page.locator('[data-gary="region-opt"]').first(); await o.hover({ timeout: 3000 }).catch(() => {}); await nap(0.3, 0.8); await o.click({ timeout: 5000 }).catch(() => {}); }
  else if (await input.count()) await page.keyboard.press('Enter');
  await nap(4, 8);
  const now = await tagRegionControl();
  if (!now || !now.toLowerCase().includes(region.toLowerCase())) { console.warn(`  ⚠ LINKEDIN-REGION not applied: control shows "${now ?? '?'}" instead of "${region}".`); return null; }
  return now;
}

async function setDatePosted() {
  const label = { r86400: 'Past 24 hours', r604800: 'Past week', r2592000: 'Past month' }[tpr] || 'Past week';
  const PILL = '[aria-label="Filter by Date posted"], [aria-label="Filtrar por Fecha de publicación"]';
  const pill = page.locator(PILL).first();
  await pill.waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
  if (!(await pill.count())) return { ok: false, why: 'no "Date posted" pill' };
  await pill.hover({ timeout: 4000 }).catch(() => {}); await nap(0.4, 1.1);
  await pill.click({ timeout: 6000 }).catch(() => {}); await nap(1.5, 3);
  if (!(await tagNear(`input[aria-label="${label}"]`, PILL, '', 'date-opt'))) {
    if (!(await tagNear('label, span, div', PILL, `^${label}$`, 'date-opt'))) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, why: `"${label}" option not on screen` }; }
  }
  await page.locator('[data-gary="date-opt"]').first().click({ timeout: 5000, force: true }).catch(() => {});
  await nap(0.6, 1.4);
  // Live DOM (mapped 2026-11-10): the popover's "Show results" is a LINK (<a>Show results</a> beside <button>Reset</button>)
  // — picking "Past week" alone does NOTHING until it is clicked.
  if (await tagNear('a, button, [role=button]', PILL, '^(Show.{0,14}results?|Mostrar.{0,14}resultados|Apply|Aplicar|Done|Listo)$', 'date-show')) {
    const show = page.locator('[data-gary="date-show"]').first();
    await show.hover({ timeout: 4000 }).catch(() => {}); await nap(0.3, 0.9);
    await show.click({ timeout: 6000 }).catch(() => {});
  } else await page.keyboard.press('Escape').catch(() => {});
  await nap(4, 8);
  // verify like a person would. Mapped live 2026-11-10: once applied the pill is RENAMED (aria-label "Filter by Past
  // week", text "Past week") and the URL carries f_TPR=r604800 — the "Filter by Date posted" pill no longer exists.
  const state = await page.evaluate(({ label, tpr }) => {
    const p = document.querySelector(`[aria-label="Filter by ${label}"]`);
    const txt = p ? (p.innerText || '').replace(/\s+/g, ' ').trim() : '';
    return { txt, on: !!p || new URLSearchParams(location.search).get('f_TPR') === tpr };
  }, { label, tpr }).catch(() => ({ txt: '', on: false }));
  return { ok: state.on, why: state.on ? label : `pill still reads "${state.txt}"` };
}

// Tick one option in the "All filters" dialog by its visible label (input aria-label or <label> text).
async function tick(dlg, re) {
  const byLabel = dlg.getByLabel(re).first();
  if (await byLabel.count()) {
    if (await byLabel.isChecked().catch(() => false)) return true;
    await byLabel.check({ timeout: 4000 }).catch(async () => { await dlg.getByText(re).first().click({ timeout: 4000 }).catch(() => {}); });
  } else {
    const t = dlg.getByText(re).first(); if (!(await t.count())) return false;
    await t.click({ timeout: 4000 }).catch(() => {});
  }
  await nap(0.6, 1.6);
  return true;
}
const exact = (txt) => new RegExp(`^\\s*${txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');

// Find the filter controls like a person waits for the page: the results header renders a few seconds after the
// query; LinkedIn names vary ("All filters", "Todos los filtros", "Show 30+ results"). Dialog = the one listing
// "Date posted". Fallback: the "Date posted" pill in the results bar (same radio options + Show results).
const DATE_HDR = /Date posted|Fecha de publicaci[oó]n/i;
async function openFilters() {
  const btn = page.getByRole('button', { name: /All filters|Todos los filtros|Show all filters/i }).first();
  await btn.waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
  if (await btn.count()) {
    await btn.hover({ timeout: 4000 }).catch(() => {}); await nap(0.4, 1.1);
    await btn.click({ timeout: 6000 }).catch(() => {});
    const dlg = page.locator('[role=dialog]').filter({ hasText: DATE_HDR }).last();
    await dlg.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await dlg.count()) { await nap(1, 2.5); return dlg; }
    await page.keyboard.press('Escape').catch(() => {}); await nap(0.8, 1.6);
  }
  const pill = page.locator('label, button, [role=button]').filter({ hasText: /^\s*(Date posted|Fecha de publicaci[oó]n)\s*$/i }).first();
  if (await pill.count()) {
    await pill.hover({ timeout: 4000 }).catch(() => {}); await nap(0.4, 1.1);
    await pill.click({ timeout: 6000 }).catch(() => {}); await nap(1.5, 3);
    const pop = page.locator('[role=dialog], [role=menu], [role=listbox], [data-testid*="popover" i], [class*="popover" i]').filter({ hasText: /Past week|Última semana|Past 24 hours/i }).last();
    if (await pop.count()) return pop;
    return page.locator('body');                                                         // options rendered inline
  }
  return null;
}

async function applyFilterTags(kw) {
  const dlg = await openFilters();
  if (!dlg) { console.warn(`  ⚠ LINKEDIN-DATE-FILTER not applied (no "All filters" button nor "Date posted" pill) — the ≤${MAX_AGE_DAYS}-day gate on each card/JD still enforces it.`); return null; }
  const suggested = await dlg.evaluate((d) => {
    const h = [...d.querySelectorAll('h2,h3')].find((e) => /suggested|sugerid/i.test(e.innerText || ''));
    const box = h && h.parentElement;
    return box ? [...box.querySelectorAll('label')].map((l) => (l.innerText || '').trim()).filter(Boolean) : [];
  }).catch(() => []);
  const picked = { date: '', experience: [], employment: [], tags: [] };
  const dRe = DATE_LABEL[tpr] || DATE_LABEL.r604800;
  if (await tick(dlg, dRe)) picked.date = dRe.source.replace(/^\^\(|\)\$$/g, '').split('|')[0];
  else console.warn(`  ⚠ LINKEDIN-DATE-FILTER: "${dRe.source}" option not found in the dialog — relying on the ≤${MAX_AGE_DAYS}-day card/JD gate.`);
  for (const e of LF_EXP) if (await tick(dlg, exact(e))) picked.experience.push(e);
  for (const e of LF_EMP) if (await tick(dlg, exact(e))) picked.employment.push(e);
  for (const t of pickTags(suggested, kw)) if (await tick(dlg, exact(t))) picked.tags.push(t);
  if (LF.underTenApplicants === true) await tick(dlg, /^Under 10 applicants$/i);
  if (LF.verified === true) await tick(dlg, /^Verified$/i);
  await nap(0.8, 2);
  const show = dlg.getByRole('button', { name: /Show.{0,12}results|Mostrar.{0,12}resultados|^Apply$|^Aplicar$/i }).first();
  if (await show.count()) {
    await show.hover({ timeout: 4000 }).catch(() => {}); await nap(0.3, 0.9);
    await show.click({ timeout: 8000 }).catch(() => {});
  } else await page.keyboard.press('Escape').catch(() => {});
  await nap(4, 8);
  const total = await page.evaluate(() => ((document.querySelector('main') || document.body).innerText.match(/([\d,.]+)\s+(results|resultados)/i) || [])[1] || '?').catch(() => '?');
  console.log(`  LinkedIn filter tags → date: ${picked.date || '-'} · exp: ${picked.experience.join('/') || '-'} · type: ${picked.employment.join('/') || '-'} · tags: ${picked.tags.join(', ') || '-'} (suggested: ${suggested.join(', ') || '-'}) · ${total} results`);
  return picked;
}

const readCards = () => page.$$eval(`a[href*="/jobs/view/"], ${CARD}`, (els) => {
  const o = [], s = new Set();
  for (const el of els) {
    const ck = el.getAttribute('componentkey');
    const id = ck ? ck.replace('job-card-component-ref-', '') : ((el.href || '').match(/\/jobs\/view\/(\d+)/) || [])[1];
    if (!id || !/^\d{6,}$/.test(id) || s.has(id)) continue;
    s.add(id);
    const txt = el.innerText || '';
    const title = ck ? (txt.split('\n').map((t) => t.trim()).filter(Boolean)[0] || '') : (el.getAttribute('aria-label') || txt);
    const m = ck && txt.match(/\((Remote|Remoto|Hybrid|Híbrido|On-site|Presencial)\)/i);
    const mode = m ? ({ remote: 'remote', remoto: 'remote', hybrid: 'hybrid', 'híbrido': 'hybrid', 'on-site': 'on-site', presencial: 'on-site' })[m[1].toLowerCase()] : '';
    o.push({ id, title: title.replace(/\s+/g, ' ').trim().slice(0, 90), easy: ck ? /Easy Apply|Solicitud sencilla/i.test(txt) : true, mode, raw: txt.replace(/\s+/g, ' ').slice(0, 400) });
  }
  return o;
});

async function scrollList() {
  const first = page.locator(CARD).first();
  if (await first.count()) await first.hover({ timeout: 3000 }).catch(() => {});        // wheel scrolls under the pointer
  for (let s = 0; s < 4 + Math.floor(Math.random() * 3); s++) { await page.mouse.wheel(0, 900 + Math.random() * 900).catch(() => {}); await nap(0.6, 1.6); }
}

// Scan ONE (title, location) combo offer-by-offer. Shared `seen`/`page`. Returns its survivors.
async function scanCombo(kw, loc, geo) {
  const comboLabel = `${geo || loc}/${kw}`;
  const survivors = [], ids = new Set();
  let rejected = 0, dup = 0, notEasy = 0, otherMode = 0, stale = 0;
  const human = await typeSearch(humanQuery(kw));
  if (human) {
    const region = await setRegion(REGION_OF(loc, geo));
    const date = await setDatePosted();
    if (!date.ok) console.warn(`  ⚠ LINKEDIN-DATE-FILTER not applied (${date.why}) — the ≤${MAX_AGE_DAYS}-day gate on each card/JD still enforces it.`);
    const total = await page.evaluate((src) => ((document.querySelector('main') || document.body).innerText.match(new RegExp(src.replace('^\\s*', ''), 'i')) || [])[0] || '?', RESULTS_RE.source).catch(() => '?');
    console.log(`  LinkedIn search → role: "${humanQuery(kw)}" · region: ${region || '(default)'} · date: ${date.ok ? date.why : '-'} · ${total}`);
    if (LF_EXP.length || LF_EMP.length || (Array.isArray(LF_TAGS) ? LF_TAGS.length : LF_TAGS === 'auto') || LF.underTenApplicants || LF.verified) await applyFilterTags(kw);   // opt-in extras only
  } else console.log('  (classic LinkedIn layout — legacy URL filters)');
  const locPart = geo ? `geoId=${geo}` : `location=${encodeURIComponent(loc)}`;
  const legacyBase = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(kw)}&${locPart}&${FILTERS}`;
  for (let p = 0; p < maxPages; p++) {
    if (stopNow()) break;
    if (p > 0) {
      await nap(8, 15);                                                                 // between results pages
      if (human) {
        const next = page.locator(`button[aria-label="Page ${p + 1}"], button[aria-label="Página ${p + 1}"]`).first();
        if (!(await next.count())) { console.log(`  [${comboLabel}] no page ${p + 1} — end of results.`); break; }
        await next.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {}); await next.hover({ timeout: 4000 }).catch(() => {}); await nap(0.4, 1.2);
        await next.click({ timeout: 8000 }).catch(() => {});
        await nap(3, 6);
      }
    }
    if (!human) {
      try { await page.goto(`${legacyBase}&start=${p * 25}`, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
      catch (e) { console.error(`  [${comboLabel}] page ${p + 1} nav failed (${e.message.split('\n')[0]}) — stopping combo, results kept.`); break; }
      await nap(2.5, 5);
    }
    await scrollList();
    if (await blocked()) break;
    const cards = await readCards();
    let pageNew = 0;
    for (const c of cards) {
      if (ids.has(c.id)) continue;
      ids.add(c.id); pageNew++;
      if (seen[c.id]) { dup++; mapRec(c, comboLabel, `seen before (${seen[c.id].v})`); continue; }
      if (!c.easy) notEasy++;
      if (EASY_ONLY && !c.easy) { mapRec(c, comboLabel, 'skipped: not Easy Apply (opt-in)'); continue; }
      if (!cardModeOk(c.mode)) { otherMode++; mapRec(c, comboLabel, `skipped: modality ${c.mode}`); continue; }   // not opened
      if (!cityOk(c.mode, c.raw)) { otherMode++; mapRec(c, comboLabel, `skipped: ${c.mode} outside ${CITY}`); continue; }
      if (tooOld(c.raw)) { stale++; mapRec(c, comboLabel, `skipped: older than ${MAX_AGE_DAYS}d (card)`); continue; }
      if (stopNow()) break;
      views++;
      try {
        const card = page.locator(`a[href*="/jobs/view/${c.id}"], [componentkey="job-card-component-ref-${c.id}"]`).first();
        await card.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {}); await card.hover({ timeout: 4000 }).catch(() => {}); await nap(0.3, 1);
        await card.click({ timeout: 8000 });
        await page.waitForFunction((id) => location.href.includes('currentJobId=' + id), c.id, { timeout: 8000 }).catch(() => {});
        await page.waitForSelector('.jobs-description__content, #job-details, [data-testid="expandable-text-box"]', { timeout: 8000 }).catch(() => {});
        await nap(1.5, 3);                                                   // let the JD pane settle (reading time)
        if (await blocked()) break;
        const data = await scrapeDetail();
        if (data.jd.length < 60) { ids.delete(c.id); mapRec(c, comboLabel, 'JD not loaded (retried next run)'); continue; } // leave UNSEEN
        const easy = c.easy || data.easy;                                    // card or detail shows "Easy Apply"
        if (CLOSED_RE.test(`${data.title} ${data.jd} ${data.where}`)) {     // validity: closed offers never survive
          seen[c.id] = { title: c.title, company: data.company, where: data.where, combo: comboLabel, v: 'closed', firstSeen: new Date().toISOString(), easy };
          rejected++; mapRec(c, comboLabel, 'closed', { company: data.company, where: data.where }); await nap(4, 9); continue;
        }
        const oldD = tooOld(data.where);
        const why = oldD ? `older than ${MAX_AGE_DAYS}d (${oldD}d)` : prefilter(`${c.title} ${data.jd}`);   // ≤N-day gate, then TITLE + JD vs the CV config
        if (oldD) stale++;
        if (why) {
          seen[c.id] = { title: c.title, company: data.company, where: data.where, combo: comboLabel, v: why, firstSeen: new Date().toISOString(), easy };
          rejected++; mapRec(c, comboLabel, `rejected: ${why}`, { company: data.company, where: data.where });
        } else {
          const rec = { id: c.id, title: c.title, company: data.company, where: data.where, combo: comboLabel, url: `https://www.linkedin.com/jobs/view/${c.id}/`, easy, apply: easy ? 'auto' : 'manual', jd: data.jd.slice(0, 1500), jdLoaded: data.jd.length >= 60 };
          survivors.push(rec);
          seen[c.id] = { title: c.title, company: data.company, where: data.where, combo: comboLabel, v: 'survivor', firstSeen: new Date().toISOString(), easy };
          mapRec(c, comboLabel, `survivor (${rec.apply})`, { company: data.company, where: data.where });
        }
      } catch (e) { /* leave unseen → retry next run */ }
      await nap(4, 9);                                                       // between offers: ~8–10/min max
    }
    console.log(`  [${comboLabel}] page ${p + 1}: ${pageNew} new ids (survivors ${survivors.length} [${survivors.filter((x) => x.easy).length} Easy Apply → auto, ${survivors.filter((x) => !x.easy).length} → manual], rejected ${rejected}, non-Easy-Apply cards ${notEasy}, other modality ${otherMode}, older than ${MAX_AGE_DAYS}d ${stale})`);
    writeSeen(); // incremental persistence (resumable + safe on hard stop)
    if (pageNew === 0 && p > 0) break;
  }
  console.log(`=== ${comboLabel} === scanned ${ids.size} | ${dup} seen | ${notEasy} non-Easy-Apply (mapped for manual) | ${otherMode} other modality | ${stale} older than ${MAX_AGE_DAYS}d | ${rejected} pre-filtered | ${survivors.length} SURVIVORS (${survivors.filter((x) => x.easy).length} auto · ${survivors.filter((x) => !x.easy).length} manual)`);
  return { combo: comboLabel, scannedIds: ids.size, rejected, dup, notEasy, survivors };
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
// OPEN WHAT A PERSON OPENS (owner order 2026-11-13 — LinkedIn must not detect the bot or the AI): a person
// reading a job-alert e-mail CLICKS its link → LinkedIn's own e-mail link (/comm/jobs/view/{id}/?trackingId=…)
// → the offer page. So each offer opens through the e-mail's OWN link (fallback: the canonical
// /jobs/view/{id}/ share link). The old path built /jobs/search/?currentJobId={id} for every offer: a crafted
// URL that lands on LinkedIn's AI-powered search ("You're now using AI-powered job search" toast) dozens of
// times in a row — a bot signature. It stays only as the opt-in --split-view escape hatch.
const SPLIT_VIEW = process.argv.includes('--split-view');
function loadUrls(file) {
  const raw = readFileSync(file, 'utf8');
  let links = [];
  try { links = [...JSON.stringify(JSON.parse(raw)).matchAll(/https?:\/\/[^"\s]*?\/jobs\/view\/(\d+)[^"\s]*/g)]; }
  catch { links = [...raw.matchAll(/https?:\/\/\S*?\/jobs\/view\/(\d+)\S*/g)]; }
  const byId = new Map();
  for (const m of links) {
    const id = m[1];
    if (byId.has(id)) continue;
    const link = m[0].replace(/\\u0026/g, '&');
    byId.set(id, SPLIT_VIEW ? `https://www.linkedin.com/jobs/search/?currentJobId=${id}`
      : (/linkedin\.com\/(comm\/)?jobs\/view\//.test(link) ? link : `https://www.linkedin.com/jobs/view/${id}/`));
  }
  return [...byId.values()];
}

// A person READS the offer: dwell + a few jittered wheel scrolls over the page, then opens "…more" on the JD
// if it is collapsed (bounded, never waits on a missing control).
async function readLikeAPerson() {
  const steps = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < steps; i++) {
    await page.mouse.move(300 + Math.random() * 700, 250 + Math.random() * 450, { steps: 8 }).catch(() => {});
    await page.mouse.wheel(0, 250 + Math.random() * 450).catch(() => {});
    await nap(1.2, 3.2);
  }
  const more = page.locator('button:has-text("…more"), button:has-text("... more"), button:has-text("See more"), button:has-text("Ver más"), [data-testid="expandable-text-button"]').first();
  if (await more.isVisible({ timeout: 1500 }).catch(() => false)) {
    await more.hover({ timeout: 3000 }).catch(() => {}); await nap(0.3, 0.9);
    await more.click({ timeout: 4000 }).catch(() => {}); await nap(0.8, 1.8);
  }
}

async function scanUrls(urls) {
  const survivors = [], ids = new Set();
  let rejected = 0, dup = 0, closed = 0;
  // Escalation guard: if the JD pane fails to render for FAIL_LIMIT offers IN A ROW (not stale-seen, not
  // closed — genuinely empty), LinkedIn's DOM changed under us. Stop and hand the selector refresh to the
  // LM supervisor instead of silently marking dozens of live offers as unreadable. Tune with --fail-limit.
  // Default 3 (not 8): if the offer page stops rendering a JD, that costs ≤3 views of the user's account, never 8.
  const FAIL_LIMIT = Math.max(1, parseInt(arg('--fail-limit', '3'), 10));
  let emptyStreak = 0;
  for (const url of urls) {
    const m = url.match(/currentJobId=(\d+)|\/jobs\/view\/(\d+)/); if (!m) continue;
    const id = m[1] || m[2];
    if (ids.has(id)) continue; ids.add(id);
    if (seen[id]) { dup++; continue; }
    if (stopNow()) break;
    views++;
    const recordUrl = `https://www.linkedin.com/jobs/view/${id}/`;         // canonical URL for the offers map
    try {
      // Arrive like the e-mail click it is: Gmail as the referrer, then read the page before scraping.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000, referer: 'https://mail.google.com/' });
      if (await blocked()) break;
      await page.waitForSelector('#job-details, .jobs-description__content, [class*="jobs-description"], [data-testid="expandable-text-box"]', { timeout: 14000 }).catch(() => {});
      await page.waitForTimeout(1500);   // the pane hydrates after the selector attaches — let the JD text settle
      await readLikeAPerson();
      if (await blocked()) break;
      const data = await scrapeDetail();
      if (data.jd.length < 60) {                                           // JD didn't render → leave UNSEEN, retry next run
        ids.delete(id);
        if (++emptyStreak >= FAIL_LIMIT) {
          console.error(`\n⚠️  ENGINE-SELECTOR-STALE: ${emptyStreak} offers in a row returned an empty JD (<60 chars).`);
          console.error(`   LinkedIn's job DOM has likely changed. LM SUPERVISOR: refresh the JD/title selectors in`);
          console.error(`   engines/linkedin-scan.mjs → scrapeDetail() pick([...]) and the waitForSelector list against`);
          console.error(`   the current offer page (${SPLIT_VIEW ? '/jobs/search/?currentJobId={id}' : 'e-mail link → /jobs/view/{id}/'}), then re-run. Aborting scan.`);
          break;
        }
        continue;
      }
      emptyStreak = 0;                                                     // a real JD read → reset the streak
      const title = (data.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (/no longer accepting applications|ya no se aceptan|esta oferta ya no/i.test(`${title} ${data.jd}`)) {
        seen[id] = { title, company: data.company, where: data.where, combo: 'gmail-urls', v: 'closed', firstSeen: new Date().toISOString(), easy: !!data.easy };
        closed++; writeSeen(); continue;
      }
      const oldD = tooOld(data.where);                                     // alert e-mails resurface reposted/old offers
      const why = oldD ? `older than ${MAX_AGE_DAYS}d (${oldD}d)` : prefilter(`${title} ${data.jd}`);   // ≤N-day gate, then TITLE + JD vs the CV config
      console.log(`  [${views}] ${id}  ${data.company || '?'} — ${title}  [${data.where}]  → ${why || 'SURVIVOR'}`);
      if (why) {
        seen[id] = { title, company: data.company, where: data.where, combo: 'gmail-urls', v: why, firstSeen: new Date().toISOString(), easy: !!data.easy };
        rejected++;
      } else {
        survivors.push({ id, title, company: data.company, where: data.where, combo: 'gmail-urls', url: recordUrl, easy: !!data.easy, apply: data.easy ? 'auto' : 'manual', jd: data.jd.slice(0, 1500), jdLoaded: true });
        seen[id] = { title, company: data.company, where: data.where, combo: 'gmail-urls', v: 'survivor', firstSeen: new Date().toISOString(), easy: !!data.easy };
      }
    } catch { /* transient → leave unseen, retry next run */ }
    writeSeen();                        // incremental (resumable + safe on hard stop)
    await nap(4, 9);                    // anti-block pacing: ~8–10 offers/min max, jittered
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
  let first = true;
  const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  sweep: for (const kw of shuffle([...ALL_TITLES])) {         // random order each run — never the same query sequence
    for (const L of shuffle([...ALL_LOCATIONS])) {
      if (stopNow()) break sweep;
      if (!first) { console.log('  …pausing between combos (anti-block)'); await nap(60, 150); }
      first = false;
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
if (MAPPED.length) {
  const mapF = arg('--map-out', 'output/linkedin-jobs.json');
  writeFileSync(mapF, JSON.stringify({ date: new Date().toISOString(), tpr, city: CITY || null, count: MAPPED.length, jobs: MAPPED }, null, 2));
  console.log(`Full map of every card this run (survivors + rejected/skipped with the reason) → ${mapF}`);
}
await page.close().catch(() => {});    // close OUR tab — leftover tabs pile up in the automation Chrome
await browser.close().catch(() => {}); // detaches CDP; does NOT close Chrome's own browser process
