// Multi-tab PARALLEL LinkedIn Easy Apply filler. One CDP connect → opens N tabs and
// fills N Easy Apply applications to the "Submit application" step IN PARALLEL, leaving
// each modal open for the user's 1-click Submit. Persists progress (never reprocesses),
// rotates location in the configured order, accepts the configured on-site city, and honors a
// USD-2700 floor in any currency. The filler is dumb: unknown input → skip offer + record it.
//
// Prereq: the dedicated debug Chrome on :9333 (engines/start-chrome-debug.cmd). Usage: node engines/easyapply-batch.mjs [N tabs=3]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fillForm, recordUnknowns } from './apply-fields.mjs';

const TARGET = parseInt(process.argv[2] || '3', 10);   // how many Submit-ready apps to accumulate (tabs left open)
const CONCURRENCY = parseInt(process.argv[3] || '2', 10); // tabs filled at once — 2 is reliable; 3+ contends on LinkedIn
const ROOT = process.cwd(); // GARY runs engines with CWD = project root (never a hardcoded career-ops path)
const CV = { frontend: `${ROOT}/docs/roles/frontend/cv-base-frontend.pdf`, fullstack: `${ROOT}/docs/roles/fullstack/cv-base-fullstack.pdf` };
// candidate values come from config/apply-fieldmap.json + config/profile.yml — never hardcode PII
const PHONE = '{{PHONE}}';
const SEEN_FILE = `${ROOT}/output/easyapply-seen.json`;

// Location rotation in the configured order. onsite=true searches without the remote filter (on-site city).
const LOCS = [
  { n: 'Latin America', g: '91000005' },
  { n: 'United States', g: '103644278' },
  { n: 'Canada', g: '101174742' },
  { n: 'European Union', g: '91000000' },
  { n: 'United Kingdom', g: '101165590' },
  { n: 'Worldwide', g: '92000000' },
  { n: '{{CITY}} (on-site OK)', g: '105287833', onsite: true },
];
const ROLES = ['Frontend Developer', 'Full Stack Developer', 'React Developer', 'Angular Developer', 'Mobile Developer'];
const url = (kw, g, onsite, start) =>
  `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(kw)}&geoId=${g}` +
  `&f_AL=true&f_JT=F&f_TPR=r604800&sortBy=DD${onsite ? '' : '&f_WT=2'}&start=${start}`;

const titleFits = (t) => /front|react|angular|next|vue|mobile|react native|ui engineer|full.?stack|software engineer|web developer/i.test(t)
  && !/\b(staff|principal|lead|manager|director|head|vp|architect)\b/i.test(t)
  && !/\b(junior|jr\.?|entry|intern|trainee|becario|practicante|graduate|apprentice)\b/i.test(t);
const descDisqualifies = (d) => /\b(10\+? years|7-10 years|at least 8 years|9\+ years)\b/i.test(d)
  || /\baws\b[^.]{0,40}(required|must have|expert|strong experience|proficien)/i.test(d)
  || /\b(java|c#|\.net|golang|\bgo\b|rust|salesforce|sap)\b[^.]{0,30}(required|expert|strong|proficien)/i.test(d)
  || /\b(c1\/c2|c1 or c2|c2 level)\b/i.test(d) || /english[^.]{0,30}\b(c1|c2)\b/i.test(d);
// Comp floor: USD 2,700/mo (~32,400/yr) in ANY currency. Reject only if it clearly states LESS.
const RATES = { usd: 1, us$: 1, $: 1, eur: 1.08, '€': 1.08, gbp: 1.27, '£': 1.27, cad: 0.73, mxn: 0.058, cop: 0.00025, ars: 0.001, brl: 0.18 };
function compTooLow(d) {
  const re = /(usd|us\$|eur|gbp|cad|mxn|cop|ars|brl|[$€£])\s*([\d.,]{2,})\s*(k|mil|million|millones)?\s*(?:\/|per|al)?\s*(month|mo\b|mes|year|yr|annum|año|hour|hr|hora)?/gi;
  let m, lowest = Infinity;
  while ((m = re.exec(d))) {
    const cur = (m[1] || '$').toLowerCase();
    let amt = parseFloat(m[2].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
    if (!isFinite(amt)) continue;
    if (/k|mil/i.test(m[3] || '')) amt *= 1000; if (/million|millones/i.test(m[3] || '')) amt *= 1e6;
    let usd = amt * (RATES[cur] || 1);
    const per = (m[4] || '').toLowerCase();
    if (/year|yr|annum|año/.test(per)) usd /= 12; else if (/hour|hr|hora/.test(per)) usd *= 160;
    if (usd > 200) lowest = Math.min(lowest, usd); // ignore tiny/garbage matches
  }
  return lowest !== Infinity && lowest < 2700; // only reject when a real figure is clearly below floor
}
const variantOf = (t) => /full.?stack|backend|node|software engineer/i.test(t) && !/front|react|angular|ui/i.test(t) ? 'fullstack' : 'frontend';

const loadSeen = () => { try { return new Set(JSON.parse(readFileSync(SEEN_FILE, 'utf8'))); } catch { return new Set(); } };
const appliedCompanies = () => { try { return readFileSync(`${ROOT}/data/applications.md`, 'utf8').split('\n').filter(l => l.startsWith('|')).map(l => (l.split('|')[3] || '').trim().toLowerCase()).filter(Boolean); } catch { return []; } };

let browser;
for (let i = 0; i < 5; i++) {
  try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); break; }
  catch (e) { if (i === 4) { console.error('CDP down after 5 retries — relaunch the debug Chrome (engines/start-chrome-debug.cmd).'); process.exit(1); } await new Promise(r => setTimeout(r, 3500)); }
}
const ctx = browser.contexts()[0];
const log = (m) => console.log(m);
const seen = loadSeen();
const applied = appliedCompanies();

// PHASE 1 — collect candidate offer IDs (title-fit, not seen, not applied-company), in location order.
const scout = ctx.pages().find(p => p.url().includes('linkedin.com')) || await ctx.newPage();
const candidates = [];
outer:
for (const loc of LOCS) {
  for (const role of ROLES) {
    if (candidates.length >= TARGET * 3) break outer;
    try {
      await scout.goto(url(role, loc.g, loc.onsite, 0), { waitUntil: 'domcontentloaded', timeout: 40000 });
      await scout.waitForSelector('li[data-occludable-job-id]', { timeout: 12000 }).catch(() => {});
      await scout.waitForTimeout(1500);
      if (/\/authwall|\/login/.test(scout.url())) { log('login wall — STOP'); break outer; }
      for (let s = 0; s < 3; s++) { await scout.mouse.wheel(0, 1600).catch(() => {}); await scout.waitForTimeout(600); }
      const cards = await scout.$$eval('li[data-occludable-job-id]', els => els.map(li => ({
        id: li.getAttribute('data-occludable-job-id'),
        title: (li.querySelector('.job-card-list__title, [class*="job-card-list__title"], a strong, a')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70),
        company: (li.querySelector('.artdeco-entity-lockup__subtitle, [class*="subtitle"]')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        applied: /(^|\s)Applied(\s|$)|Solicitado|Application submitted/i.test(li.innerText || ''),
      })));
      for (const c of cards) {
        if (!c.id || seen.has(c.id)) continue;
        seen.add(c.id);
        if (c.applied) continue;                              // card already shows "Applied" → skip, next
        if (!titleFits(c.title)) continue;
        if (applied.includes(c.company.toLowerCase())) continue;
        candidates.push({ ...c, loc: loc.n });
        if (candidates.length >= TARGET * 3) break;
      }
      log(`[${loc.n} / ${role}] candidates so far: ${candidates.length}`);
    } catch (e) { log(`[${loc.n}/${role}] ${e.message.split('\n')[0]}`); }
  }
}
log(`\nCollected ${candidates.length} candidates. Filling up to ${TARGET} in PARALLEL tabs...\n`);

// fill one Easy Apply modal on a given page to the Submit step (don't submit). Returns outcome.
async function fillModal(page, meta) {
  const allUnknown = [];
  const fin = (o) => { recordUnknowns(meta.company, meta.title, `https://www.linkedin.com/jobs/view/${meta.id}/`, allUnknown); return o; };
  for (let step = 0; step < 8; step++) {
    const dlg = page.locator('div[role=dialog]').first();
    if (!(await dlg.count())) return fin('modal-closed');
    await page.waitForTimeout(1000);
    try { const { unknown } = await fillForm(dlg, page); for (const u of unknown) if (!allUnknown.find(x => x.label === u.label)) allUnknown.push(u); } catch {}
    const ph = dlg.getByRole('textbox', { name: /phone|teléfono|móvil|mobile/i }).first();
    try { if (await ph.count() && !(await ph.inputValue().catch(() => 'x'))) await ph.fill(PHONE, { timeout: 2000 }); } catch {}
    const submit = dlg.getByRole('button', { name: /Submit application|Enviar solicitud/i }).first();
    if (await submit.count() && await submit.isVisible().catch(() => false)) return fin('READY-to-submit'); // leave open — his click
    const before = (await dlg.innerText().catch(() => '')).slice(0, 240);
    const next = dlg.getByRole('button', { name: /Next|Siguiente|Continue|Review|Revisar/i }).first();
    if (!(await next.count()) || !(await next.isVisible().catch(() => false))) return fin('stuck');
    await next.click({ timeout: 3500 }).catch(() => {});
    await page.waitForTimeout(1400);
    const err = await dlg.locator('[role=alert], .artdeco-inline-feedback--error, .fb-dash-form-element__error-text').first().count().catch(() => 0);
    if (err || (await dlg.innerText().catch(() => '')).slice(0, 240) === before) return fin('screening-question');
  }
  return fin('incomplete');
}

async function processOffer(c) {
  const page = await ctx.newPage();
  const r = { ...c, outcome: '', page };
  try {
    await page.goto(`https://www.linkedin.com/jobs/view/${c.id}/`, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForSelector('.jobs-apply-button, .job-details-jobs-unified-top-card__job-title', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(2800);
    r.title = (await page.locator('.job-details-jobs-unified-top-card__job-title, .t-24').first().innerText({ timeout: 4000 }).catch(() => '')) || c.title;
    r.company = (await page.locator('.job-details-jobs-unified-top-card__company-name a').first().innerText({ timeout: 2500 }).catch(() => '')) || c.company;
    if (!titleFits(r.title)) { r.outcome = 'skip-fit'; await page.close(); return r; }
    const desc = await page.locator('#job-details, .jobs-description__content').first().innerText({ timeout: 3000 }).catch(() => '');
    if (descDisqualifies(desc) || compTooLow(desc)) { r.outcome = compTooLow(desc) ? 'skip-comp' : 'skip-reqs'; await page.close(); return r; }
    if (await page.getByText(/^Applied\b|Solicitado/i).first().count().catch(() => 0)) { r.outcome = 'already-applied'; await page.close(); return r; }
    // Easy Apply button — wait + retry (in parallel tabs it renders slower); broaden the selector.
    const easyBtn = page.locator('.jobs-apply-button, button[aria-label*="Easy Apply" i]').filter({ hasText: /Easy Apply|Solicitud sencilla/i }).first();
    let hasEasy = false;
    for (let k = 0; k < 4; k++) { if (await easyBtn.count().catch(() => 0)) { hasEasy = true; break; } await page.waitForTimeout(1200); }
    if (!hasEasy) {
      // is there ANY apply button (i.e. external apply)? distinguish "external" from "not loaded"
      const anyApply = await page.locator('.jobs-apply-button, button[aria-label*="apply" i]').first().count().catch(() => 0);
      r.outcome = anyApply ? 'no-easyapply' : 'apply-not-loaded'; await page.close(); return r;
    }
    await easyBtn.click({ timeout: 6000 });
    await page.waitForSelector('div[role=dialog]', { timeout: 10000 }).catch(() => {});
    try { const fi = page.locator('div[role=dialog] input[type=file]').first(); if (await fi.count()) await fi.setInputFiles(CV[variantOf(r.title)], { timeout: 3000 }); } catch {}
    r.outcome = await fillModal(page, r);
    if (r.outcome !== 'READY-to-submit') { // not ready → record + close the tab to keep things clean
      try { await page.keyboard.press('Escape'); await page.waitForTimeout(500); const dq = page.getByRole('button', { name: /Discard|Descartar|Save|Guardar/i }).first(); if (await dq.count()) await dq.click({ timeout: 1500 }).catch(() => {}); await page.close(); } catch {}
    }
    return r; // READY ones keep their tab+modal OPEN for the user
  } catch (e) { r.outcome = 'error:' + e.message.split('\n')[0].slice(0, 30); try { await page.close(); } catch {} return r; }
}

// PHASE 2 — process candidates with a concurrency pool of TARGET; stop when TARGET are READY.
const ready = []; const queue = [...candidates]; let active = 0;
await new Promise((resolve) => {
  const pump = () => {
    if (ready.length >= TARGET || (queue.length === 0 && active === 0)) return resolve();
    while (active < CONCURRENCY && queue.length && ready.length < TARGET) {
      const c = queue.shift(); active++;
      processOffer(c).then((r) => {
        active--;
        if (r.outcome === 'READY-to-submit') { ready.push(r); log(`  ✅ LISTA (pestaña abierta): ${r.company} | ${r.title.slice(0, 38)}  [${ready.length}/${TARGET}]`); }
        else log(`  ⤷ ${r.outcome}: ${r.company || c.company} | ${(r.title || c.title).slice(0, 30)}`);
        pump();
      });
    }
  };
  pump();
});

writeFileSync(SEEN_FILE, JSON.stringify([...seen]));
console.log(`\n=== ${ready.length}/${TARGET} LISTAS para tu Submit (cada una en su pestaña abierta) ===`);
ready.forEach(r => console.log(`  ✅ ${r.company} | ${r.title.slice(0, 45)} | https://www.linkedin.com/jobs/view/${r.id}/`));
console.log(`(seen persistido: ${seen.size} ofertas ya procesadas — la próxima corrida continúa, no reprocesa)`);
process.exit(0);
