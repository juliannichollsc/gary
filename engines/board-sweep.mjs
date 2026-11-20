// ============================================================================
// board-sweep.mjs — session-based board mapper (CDP, 0 LLM tokens).
//
// Drives the user's logged-in automation Chrome (:9333) through a board's REMOTE-only search, paginates
// with human-like jittered pacing, and maps every offer {title, company, location, url, …} into a TEMP
// file the LM supervisor later triages against the candidate profile (two-way-fit gate):
//     output/board-sweep/<site>-jobs.json
// Riding the user's own session (cookies, real browser fingerprint) is what keeps us off IP/bot blocks;
// the pacing below keeps the request rate human. Same contract as himalayas-matches / linkedin-scan.
//
// Sites (adapters below): dice · dice-recs · hireline · glassdoor   (all free — no subscription)
//   dice-recs = Dice's logged-in "Recommended Jobs" feed (profile-matched, no keywords): every page is mapped,
//   cards older than --max-age days (default 7) are dropped, and each survivor's detail page is opened to
//   read the real "Posted" date (the card shows the UPDATED date) + capture the JD and the apply type.
//   Posted ≤ max-age → fresh. Posted older but Updated ≤ max-age → kept with `refreshed: true` (recruiters
//   re-bump old postings; the LM scores them LOWER). Neither → `stale: true` (kept only so re-runs skip it).
// Usage:
//   node engines/board-sweep.mjs --site dice-recs                     # recommended feed, ≤7 days, JD included
//   node engines/board-sweep.mjs --site dice                          # keywords from config/easyapply-filter.json → titles
//   node engines/board-sweep.mjs --site hireline --kw "React,Node.js" --pages 3
//   node engines/board-sweep.mjs --site glassdoor                     # map only (fromAge filter; JD pages 403 → no --jd)
// Flags: --kw "a,b" · --pages N (per keyword, default 3; dice-recs 30) · --jd · --max-views N (default 120)
//        --max-age D (days, sites that expose a date; default 7)
//        --pace X (>=1 slows every wait) · --fresh (drop prior results) · --no-prefilter · --port 9333
//
// ANTI-BLOCK (mandatory — mirrors source-linkedin §1 / indeed-offers):
//   ONE process, ONE tab, SERIAL. Results page 8–15 s · JD 4–9 s · between keywords 45–90 s · ≤120 views/run.
//   On 403/405/423/429, a persistent Cloudflare challenge, or a captcha → STOP, save progress, write
//   output/board-sweep/<site>-block.json → do NOT retry the same day (the engine refuses to).
// SESSION (opt-in per adapter: `needsSession` — today only glassdoor): after the first results page the Conexiones
//   rule (engines/connections.mjs) is applied to the engine's page; logged out → `⏸ <SITE>-LOGIN-NEEDED`, tab closed,
//   exit 6, nothing mapped → the LM asks the user to sign in from Conexiones and re-runs. Never logs in for the user.
// ============================================================================
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { acquireSiteLock } from './_site-lock.mjs';
import { breathe, machinePace } from './_machine-guard.mjs';
import { CONNECTIONS, verifyPage } from './connections.mjs';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SITE = arg('--site', '');
const MAX_AGE = Math.max(0, parseInt(arg('--max-age', '7'), 10));
const FRESH = process.argv.includes('--fresh');
const PREFILTER = !process.argv.includes('--no-prefilter');
const PACE = Math.max(1, parseFloat(arg('--pace', '1')) || 1);
const MAX_VIEWS = Math.max(1, parseInt(arg('--max-views', '120'), 10));
const PORT = arg('--port', process.env.CDP_PORT || '9333');

const enc = encodeURIComponent;

// Dice job cards (search + recommended share the markup). Runs IN the page.
const diceExtract = () => [...document.querySelectorAll('[data-testid="job-card"]')].map((card) => {
  const a = card.querySelector('a[data-testid="job-search-job-detail-link"]') || card.querySelector('a[href*="/job-detail/"]');
  if (!a) return null;
  const ls = (card.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean);
  // Search cards: one "Remote • 9d ago" line. Recommended cards: "Remote" / "•" / "4d ago" on separate lines.
  // Either way that date is the UPDATED date, not the posting date.
  const mi = ls.findIndex((x) => x.includes('•'));
  let location = '', posted = '', after = mi + 1;
  if (mi >= 0 && ls[mi] === '•') { location = ls[mi - 1] || ''; posted = ls[mi + 1] || ''; after = mi + 2; }
  else if (mi >= 0) { [location = '', posted = ''] = ls[mi].split('•').map((x) => x.trim()); }
  const applyType = ls.find((x) => /^(easy apply|apply now)$/i.test(x)) || '';
  return { url: a.href.split('?')[0], title: (a.innerText || '').trim(), company: ls[0] === applyType ? '' : ls[0] || '',
    location, posted, applyType, employment: ls[after] || '', salary: ls[after + 1] || '' };
}).filter(Boolean);
// "Today" / "Yesterday" / "4d ago" / "2w ago" / "1mo ago" → days (null = unknown → keep).
const diceCardAge = (t) => {
  const s = (t || '').toLowerCase();
  if (/today|just now|\bh(ours?)? ago/.test(s)) return 0;
  if (/yesterday/.test(s)) return 1;
  const m = s.match(/(\d+)\+?\s*(d|w|mo)/);
  return m ? Number(m[1]) * ({ d: 1, w: 7, mo: 30 })[m[2]] : null;
};
// Detail page: "Posted 17 days ago • Updated 3 hours ago" (also "today", "30+ days ago") → days, per label.
const diceDetailDays = (label) => (text) => {
  const m = (text || '').match(new RegExp(`${label}\\s+(today|(\\d+)\\+?\\s*(minute|hour|day|week|month)s?\\s+ago)`, 'i'));
  if (!m) return null;
  if (/today/i.test(m[1]) || /minute|hour/i.test(m[3] || '')) return 0;
  return Number(m[2]) * ({ day: 1, week: 7, month: 30 })[m[3].toLowerCase()];
};
const dicePostedDays = diceDetailDays('Posted');
const diceUpdatedDays = diceDetailDays('Updated');

// ── Site adapters ────────────────────────────────────────────────────────────────────────────────────────
// searchUrl(kw, page) → REMOTE-only results URL. `loadMore` adapters paginate in-page (click) instead.
// extract() runs IN the page and returns raw cards; keep selectors stable-attribute-first.
const SITES = {
  dice: {
    host: 'dice.com',
    searchUrl: (kw, p) => `https://www.dice.com/jobs?q=${enc(kw)}&filters.workplaceTypes=Remote&page=${p}`,
    extract: diceExtract,
    cardAge: diceCardAge,
    postedDays: dicePostedDays,
    updatedDays: diceUpdatedDays,
    jdSel: ['[class*="jobDescription"]', '[data-testid="jobDescriptionHtml"]', 'main'],
  },

  'dice-recs': {
    host: 'dice.com',
    blockKey: 'dice',          // same account as `dice` → one shared same-day block
    noKeywords: true,          // the feed is matched to the user's Dice profile
    alwaysJd: true,            // detail visit is required to confirm the real "Posted" date
    defaultPages: 30,
    searchUrl: (_, p) => `https://www.dice.com/recommended-jobs?page=${p}`,
    extract: diceExtract,
    cardAge: diceCardAge,
    postedDays: dicePostedDays,
    updatedDays: diceUpdatedDays,
    jdSel: ['[class*="jobDescription"]', '[data-testid="jobDescriptionHtml"]', 'main'],
  },

  hireline: {
    host: 'hireline.io',
    // /remoto/empleos = remote-only listing. Filters (site params): k = keyword · l = latam | remoto-mx | remoto-co
    // · jk = job kind (2 full-time, 6 freelance, 3/4/5 grad/intern; empty = all) · jd = posted (1 = 2 weeks — the
    // shortest; the card's "Hace N días" trims it to --max-age). The remote LATAM feed is small, so with no --kw the
    // whole listing is mapped and the LM triages it. --hl-l / --hl-jk / --hl-jd come from the user's preferences.
    noKeywords: !arg('--kw', ''),
    searchUrl: (kw, p) => `https://hireline.io/remoto/empleos?k=${kw.startsWith('(') ? '' : enc(kw)}`
      + `&l=${enc(arg('--hl-l', 'latam'))}&jk=${enc(arg('--hl-jk', ''))}&sal=&jd=${enc(arg('--hl-jd', '1'))}&page=${p}`,
    cardAge: (t) => {                                   // "Hoy." · "Ayer." · "Hace 4 días." · "Hace más de 30 días."
      const s = (t || '').toLowerCase();
      if (/hoy/.test(s)) return 0;
      if (/ayer/.test(s)) return 1;
      const m = s.match(/(\d+)\s*(d[ií]a|semana|mes)/);
      return m ? Number(m[1]) * ({ d: 1, s: 7, m: 30 })[m[2][0]] : null;
    },
    extract: () => [...document.querySelectorAll('a.hl-vacancy-card')].map((a) => {
      const ls = (a.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean);
      // ["Hoy.", "<Title> en <Company>", "<salary>", "Remoto: LATAM", "<type>"]
      const head = ls[1] || '';
      const cut = head.lastIndexOf(' en ');
      return { url: a.href.split('?')[0], title: cut > 0 ? head.slice(0, cut) : head, company: cut > 0 ? head.slice(cut + 4) : '',
        location: ls.find((x) => /^remoto/i.test(x)) || 'Remoto', posted: ls[0] || '', salary: ls[2] || '' };
    }),
    jdSel: ['.vacancy-description', '[class*="description"]', 'main'],
  },

  glassdoor: {
    host: 'glassdoor.com',
    // IS11047 = Glassdoor's "Remote" location; KO = keyword char range inside the slug ("remote-" is 0..6).
    // fromAge = the site's own "Date posted" filter (1/3/7/14/30 days). Since 2026-11 the cards no longer print
    // the job age (no [data-test="job-age"]), so this server-side filter IS the recency gate: rows are stamped
    // `dateFilter: "≤Nd (Glassdoor)"` instead of a per-card date.
    searchUrl: (kw) => {
      const slug = kw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const age = [1, 3, 7, 14, 30].find((d) => d >= MAX_AGE);
      return `https://www.glassdoor.com/Job/remote-${slug}-jobs-SRCH_IL.0,6_IS11047_KO7,${7 + slug.length}.htm${age ? `?fromAge=${age}` : ''}`;
    },
    dateFilter: () => { const age = [1, 3, 7, 14, 30].find((d) => d >= MAX_AGE); return age ? `≤${age}d (Glassdoor)` : ''; },
    // Opening /job-listing/ pages = HTTP 403 hard block (2026-11-06) → Glassdoor is MAP ONLY: --jd is ignored.
    noJd: 'job pages answer 403 to automation (2026-11-06 block) — map only, the user opens each JD',
    needsSession: 'Glassdoor',   // logged out the search is walled by sign-up modals → ask the user to sign in first
    loadMore: '[data-test="load-more"]',
    extract: () => [...document.querySelectorAll('li[data-test="jobListing"]')].map((li) => {
      const t = li.querySelector('[data-test="job-title"]');
      if (!t) return null;
      const wrap = li.querySelector('[data-test="job-card-wrapper"]');
      return { url: t.href.split('&')[0], title: (t.innerText || '').trim(),
        company: ((wrap?.innerText || '').split('\n')[0] || '').trim(),
        location: (li.querySelector('[data-test="emp-location"]')?.innerText || '').trim(),
        posted: (li.querySelector('[data-test="job-age"]')?.innerText || '').trim(),
        salary: (li.querySelector('[data-test="detailSalary"]')?.innerText || '').trim(),
        snippet: (li.querySelector('[data-test="descSnippet"]')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300) };
    }).filter(Boolean),
    jdSel: ['[class*="JobDetails_jobDescription"]', '[data-test="jobDescriptionContent"]', 'main'],
  },
};

const S = SITES[SITE];
if (!S) { console.error(`usage: node engines/board-sweep.mjs --site <${Object.keys(SITES).join('|')}> [--kw "a,b"] [--pages N] [--jd]`); process.exit(1); }
await acquireSiteLock(S.host);   // ONE bot per site + machine budget (anti-block, anti-freeze) — dice + dice-recs share dice.com
const PAGES = Math.max(1, parseInt(arg('--pages', String(S.defaultPages || 3)), 10));
const WANT_JD = (S.alwaysJd || process.argv.includes('--jd')) && !S.noJd;
if (S.noJd && process.argv.includes('--jd')) console.log(`--jd ignored for ${SITE}: ${S.noJd}`);

// ── Keywords + title pre-filter come from the candidate config (never hardcoded) ─────────────────────────
let CFG = {};
const CFG_FILE = 'config/easyapply-filter.json';
if (existsSync(CFG_FILE)) { try { CFG = JSON.parse(readFileSync(CFG_FILE, 'utf8')); } catch (e) { console.log(`${CFG_FILE} unreadable (${e.message}).`); } }
const KEYWORDS = S.noKeywords ? [SITE === 'dice-recs' ? '(profile recommendations)' : '(all listings)']
  : (arg('--kw', '') ? arg('--kw', '').split(',') : (CFG.titles || [])).map((s) => s.trim()).filter(Boolean).filter((k) => !k.includes('{{'));
if (!KEYWORDS.length) { console.error(`No keywords: pass --kw "a,b" or generate ${CFG_FILE} (titles) first.`); process.exit(1); }
const REJECT = PREFILTER ? (CFG.reject || []).filter((r) => r && r.re && !r.re.includes('{{')).map((r) => ({ re: new RegExp(r.re, 'i'), why: r.why })) : [];

// ── Output (temp, resumable) + same-day block guard ──────────────────────────────────────────────────────
const DIR = 'output/board-sweep';
mkdirSync(DIR, { recursive: true });
const OUT = `${DIR}/${SITE}-jobs.json`;
const BLOCK = `${DIR}/${S.blockKey || SITE}-block.json`;
const today = new Date().toISOString().slice(0, 10);
if (existsSync(BLOCK)) {
  try {
    const b = JSON.parse(readFileSync(BLOCK, 'utf8'));
    if (b.date === today) { console.error(`⛔ ${SITE} blocked earlier today (${b.reason}). Not retrying until tomorrow.`); process.exit(2); }
  } catch {}
}
const byUrl = new Map();
if (!FRESH && existsSync(OUT)) { try { for (const j of JSON.parse(readFileSync(OUT, 'utf8')).jobs || []) byUrl.set(j.url, j); } catch {} }
const save = () => writeFileSync(OUT, JSON.stringify({ site: SITE, updated: new Date().toISOString(), keywords: KEYWORDS, jobs: [...byUrl.values()] }, null, 2));

// ── Browser (attach only — never relaunch) ───────────────────────────────────────────────────────────────
let browser;
try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); }
catch { console.error(`CDP ${PORT} down — start the automation Chrome (engines/start-chrome-debug.sh / .cmd) and retry.`); process.exit(1); }
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.bringToFront().catch(() => {});   // the user can watch the bot work

let views = 0, ABORT = '', stopped = false;
const nap = async (minS, maxS) => { await page.waitForTimeout(Math.round((minS + Math.random() * (maxS - minS)) * 1000 * PACE * machinePace())); await breathe(); };   // + machine back-off
// Throttle statuses (405/423/429) on a top-level document of the site = hard block → stop at once.
// 403 is softer: Cloudflare serves its "Just a moment" challenge with a 403 and it auto-clears in the real
// browser, so a 403 only becomes a block if settle() can't get past it.
let last403 = '';
page.on('response', (r) => {
  if (ABORT || r.request().resourceType() !== 'document' || !r.url().includes(S.host)) return;
  if ([405, 423, 429].includes(r.status())) ABORT = `HTTP ${r.status()} on ${r.url().slice(0, 90)}`;
  else if (r.status() === 403) last403 = r.url().slice(0, 90);
});
const CHALLENGE_RE = /just a moment|verifying you are human|attention required|unusual traffic|are you a robot|captcha|access denied/i;
// Poll until the page has real content and no challenge text (~20 s), before judging it.
async function settle() {
  for (let t = 0; t < 8; t++) {
    if (ABORT) return false;
    const head = await page.evaluate(() => `${document.title}\n${(document.body?.innerText || '').slice(0, 1500)}`).catch(() => '');
    if (head.trim().length > 200 && !CHALLENGE_RE.test(head)) { last403 = ''; return true; }
    await page.waitForTimeout(2500);
  }
  if (!ABORT) ABORT = last403 ? `HTTP 403 not cleared on ${last403}` : 'bot challenge / captcha did not clear';
  return false;
}
const stopNow = () => {
  if (stopped) return true;
  if (ABORT) {
    stopped = true;
    writeFileSync(BLOCK, JSON.stringify({ site: SITE, date: today, reason: ABORT }, null, 2));
    console.error(`\n⛔ ${SITE.toUpperCase()}-BLOCK: ${ABORT}. Run STOPPED, progress saved. Do NOT retry today.`);
    return true;
  }
  if (views >= MAX_VIEWS) { stopped = true; console.error(`\n⏸  --max-views ${MAX_VIEWS} reached — stopping cleanly (resume later).`); return true; }
  return false;
};
async function open(url) {
  views++;
  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
  catch (e) { console.log(`  navigation failed (${e.message.split('\n')[0]}) — skipping`); return false; } // timeout ≠ block
  return settle();
}
async function lazyScroll() { for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 1400).catch(() => {}); await page.waitForTimeout(600 + Math.random() * 600); } }

// ── 1. Map: keyword × page ───────────────────────────────────────────────────────────────────────────────
let rejected = 0, tooOld = 0;
const seenRun = new Set(); // URLs seen on a results page THIS run (pagination-exhaustion check)
outer:
for (const [ki, kw] of KEYWORDS.entries()) {
  if (ki > 0) { console.log(`  … pausing between keywords`); await nap(45, 90); }
  if (stopNow()) break;
  for (let p = 1; p <= PAGES; p++) {
    if (p === 1 || !S.loadMore) {
      if (p > 1) await nap(8, 15);
      if (!(await open(S.searchUrl(kw, p)))) break outer;
      if (S.needsSession && ki === 0 && p === 1) {   // the user's own session (Conexiones) — logged out → ask, don't map
        const sess = await verifyPage(page, CONNECTIONS.find((c) => c.site === S.needsSession));
        if (!sess.yes) {
          console.error(`\n⏸ ${SITE.toUpperCase()}-LOGIN-NEEDED: no ${S.needsSession} session in the automation browser (${sess.how}).`
            + ` Ask the user to sign in from Conexiones → ${S.needsSession} → Conectar (their own account) and press "Verificar", then run this again.`);
          await page.close().catch(() => {});
          await browser.close();
          process.exit(6);
        }
        console.log(`${S.needsSession} session: ✓ (${sess.how})`);
      }
    } else {
      // in-page pagination: dismiss any sign-up modal, then click "show more"
      await nap(8, 15);
      await page.keyboard.press('Escape').catch(() => {});
      const more = await page.$(S.loadMore);
      if (!more) break;
      await more.click().catch(() => {});
      views++;
      await page.waitForTimeout(3000);
      if (!(await settle())) break outer;
    }
    await lazyScroll();
    const cards = await page.evaluate(S.extract).catch(() => []);
    let added = 0, unseen = 0;
    for (const c of cards) {
      if (!c.url || !c.title) continue;
      if (!seenRun.has(c.url)) { seenRun.add(c.url); unseen++; }
      if (byUrl.has(c.url)) continue;
      const why = REJECT.find((r) => r.re.test(c.title))?.why;
      if (why) { rejected++; continue; }
      // The card date is a cheap first cut; for Dice it's the UPDATED date (recruiters "refresh" old
      // postings), so the real Posted date is confirmed on the detail page below.
      const age = S.cardAge ? S.cardAge(c.posted) : null;
      if (age !== null && age > MAX_AGE) { tooOld++; continue; }
      byUrl.set(c.url, { site: SITE, kw, ...c, ...(S.dateFilter && !c.posted ? { dateFilter: S.dateFilter() } : {}), mapped: today });
      added++;
    }
    save();
    console.log(`  [${kw}] page ${p}: ${cards.length} cards, +${added} new (total ${byUrl.size})`);
    if (!cards.length || (!unseen && !S.loadMore)) break; // exhausted or only repeats
    if (stopNow()) break outer;
  }
}

// ── 2. Optional JD capture (paced, resumable) ────────────────────────────────────────────────────────────
if (WANT_JD && !ABORT) {
  // `stale` rows from before the refreshed/updatedDays split (no updatedDays) are re-checked once.
  const todo = [...byUrl.values()].filter((j) => (!j.stale || j.updatedDays === undefined) && (!j.description || j.description.startsWith('ERROR')));
  console.log(`JD capture: ${todo.length} to fetch.`);
  for (const j of todo) {
    if (stopNow()) break;
    await nap(4, 9);
    if (!(await open(j.url))) { if (ABORT) break; j.description = 'ERROR: not loaded'; continue; }
    if (S.postedDays) {
      const head = await page.evaluate(() => (document.body?.innerText || '').slice(0, 4000)).catch(() => '');
      j.postedDays = S.postedDays(head);
      j.updatedDays = S.updatedDays ? S.updatedDays(head) : null;
      delete j.stale; delete j.refreshed;
      if (j.postedDays !== null && j.postedDays > MAX_AGE) {
        const upd = j.updatedDays ?? (S.cardAge ? S.cardAge(j.posted) : null);
        if (upd !== null && upd <= MAX_AGE) j.refreshed = true;        // old posting, recently re-bumped → lower score
        else { j.stale = true; tooOld++; save(); continue; }           // old and not refreshed → skip its JD
      }
    }
    j.description = await page.evaluate((sels) => {
      for (const s of sels) { const el = document.querySelector(s); const t = (el?.innerText || '').trim(); if (t.length > 200) return t.replace(/\n{3,}/g, '\n\n').slice(0, 6000); }
      return 'ERROR: description not found';
    }, S.jdSel).catch(() => 'ERROR: extract failed');
    save();
  }
}

save();
stopNow();
const live = [...byUrl.values()].filter((j) => !j.stale);
const withJd = live.filter((j) => j.description && !j.description.startsWith('ERROR')).length;
const refreshedN = live.filter((j) => j.refreshed).length;
console.log(`Saved → ${OUT} (${live.length} offers${WANT_JD ? `, ${withJd} with JD` : ''}${refreshedN ? `, ${refreshedN} refreshed (lower score)` : ''}; ${rejected} dropped by title pre-filter; ${tooOld} older than ${MAX_AGE}d; ${views} views)`);
await page.close().catch(() => {});
await browser.close(); // detaches CDP only; the browser stays open
