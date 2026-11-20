// ============================================================================
// hireline-apply.mjs — Hireline in-platform apply, FULLY AUTOMATIC (owner decision 2026-11-10).
//
// The third exception to GARY's "never click Submit" rule (after Computrabajo and Dice). Applies ONLY through
// Hireline's own form, which it pre-fills from the user's Hireline profile + the CV already uploaded there:
//   detail → "Enviar mi CV" (/remoto/aplicar/<id>) → form #myForm (basic info, salary, English, relocation,
//   skills, "Ya tienes un CV") → "Aplicar a la vacante" → /candidato/dashboard?application=success
// Skips (never sends) when: no Hireline apply link (external / closed), already applied, no CV on the profile,
// or any REQUIRED field the form left empty (recorded as `needs-answer` for the LM to resolve via the RAG).
// The phone is the one field Hireline does NOT pre-fill (its mask is 10–11 digits, the profile keeps the
// international form): the LM passes it per run with --phone from the candidate's RAG — never stored in a file.
//
// Usage:
//   node engines/board-sweep.mjs --site hireline --jd             # 1. map (0 tokens) → output/board-sweep/hireline-jobs.json
//   (LM triage)                                                   # 2. survivors → output/board-sweep/hireline-apply-queue.json
//   node engines/hireline-apply.mjs --phone "<10-11 digits>"      # 3. apply the queue (≤10/run)
//   node engines/hireline-apply.mjs --dry-run --phone "…"         # walk to "Aplicar a la vacante" and stop
//   node engines/hireline-apply.mjs --urls "<detail-url>,<…>" --max 3 --phone "…"
// Queue file: JSON array of detail URLs or of { url, title?, company? } (the LM writes it).
// Log: output/board-sweep/hireline-applied.json  { "<url>": { status, at, title, company, note } }
//   status ∈ applied · dry-run · external · already-applied · needs-answer · error
//
// ANTI-BLOCK (mandatory — same budget as LinkedIn/Indeed/Dice): ONE process, ONE tab, serial.
//   Detail 4–9 s · form actions 2.5–4.5 s · between applications 30–60 s · ≤10 applications/run.
//   405/423/429, an uncleared 403/Cloudflare/captcha, or a sign-in wall → STOP, write
//   output/board-sweep/hireline-block.json (shared with board-sweep) → no retry the same day.
// ============================================================================
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { acquireSiteLock } from './_site-lock.mjs';
import { breathe, machinePace } from './_machine-guard.mjs';
await acquireSiteLock('hireline.io');   // ONE bot per site + machine budget (anti-block, anti-freeze) — see _site-lock.mjs

const arg = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry-run');
const MAX = Math.min(10, Math.max(1, parseInt(arg('--max', '10'), 10)));   // hard cap 10/run
const PACE = Math.max(1, parseFloat(arg('--pace', '1')) || 1);
const PORT = arg('--port', process.env.CDP_PORT || '9333');
const PHONE = (arg('--phone', '') || '').replace(/\D/g, '');
const DIR = 'output/board-sweep';
const QUEUE = arg('--queue', `${DIR}/hireline-apply-queue.json`);
const LOG = `${DIR}/hireline-applied.json`;
const BLOCK = `${DIR}/hireline-block.json`;
mkdirSync(DIR, { recursive: true });
const today = new Date().toISOString().slice(0, 10);

if (existsSync(BLOCK)) {
  try { const b = JSON.parse(readFileSync(BLOCK, 'utf8')); if (b.date === today) { console.error(`⛔ Hireline blocked earlier today (${b.reason}). Not retrying until tomorrow.`); process.exit(2); } } catch {}
}

// ── Queue (LM-triaged) minus anything already handled ────────────────────────────────────────────────────
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const done = readJson(LOG, {});
const raw = arg('--urls', '') ? arg('--urls', '').split(',') : readJson(QUEUE, []);
const queue = (Array.isArray(raw) ? raw : []).map((x) => (typeof x === 'string' ? { url: x } : x))
  .map((x) => ({ ...x, url: String(x.url || '').trim().split('?')[0] }))
  .filter((x) => /^https:\/\/hireline\.io\/.+\/empleos\/.+\/\d+$/.test(x.url))
  .filter((x) => !done[x.url] || ['error', 'dry-run'].includes(done[x.url].status));
if (!queue.length) { console.log(`Nothing to apply (queue: ${QUEUE}).`); process.exit(0); }
console.log(`Hireline apply — ${Math.min(MAX, queue.length)} of ${queue.length} queued${DRY ? ' [DRY-RUN: stops before "Aplicar a la vacante"]' : ''}.`);
const record = (job, status, note = '') => {
  done[job.url] = { status, at: new Date().toISOString(), title: job.title || '', company: job.company || '', note };
  writeFileSync(LOG, JSON.stringify(done, null, 2));
  console.log(`  ${status.padEnd(16)} ${job.title || job.url}${note ? ` — ${note}` : ''}`);
};

// ── Browser + block guard (same rules as board-sweep / dice-apply) ───────────────────────────────────────
let browser;
try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); }
catch { console.error(`CDP ${PORT} down — start the automation Chrome and retry.`); process.exit(1); }
const page = await browser.contexts()[0].newPage();
await page.bringToFront().catch(() => {});   // the user can watch the bot work
let ABORT = '', last403 = '';
const nap = async (a, z) => { await page.waitForTimeout(Math.round((a + Math.random() * (z - a)) * 1000 * PACE * machinePace())); await breathe(); };   // + machine back-off
page.on('response', (r) => {
  if (ABORT || r.request().resourceType() !== 'document' || !r.url().includes('hireline.io')) return;
  if ([405, 423, 429].includes(r.status())) ABORT = `HTTP ${r.status()} on ${r.url().slice(0, 90)}`;
  else if (r.status() === 403) last403 = r.url().slice(0, 90);
});
const CHALLENGE_RE = /just a moment|verifying you are human|attention required|unusual traffic|are you a robot|captcha|access denied/i;
async function settle() {
  for (let t = 0; t < 8; t++) {
    if (ABORT) return false;
    const head = await page.evaluate(() => `${document.title}\n${(document.body?.innerText || '').slice(0, 1500)}`).catch(() => '');
    if (head.trim().length > 200 && !CHALLENGE_RE.test(head)) { last403 = ''; return true; }
    if (t === 7) { ABORT = last403 ? `HTTP 403 not cleared on ${last403}` : 'bot challenge / captcha did not clear'; return false; }
    await page.waitForTimeout(2500);
  }
  return true;
}
// Signed out = the header shows the login button (visible) — the hidden login modal is always in the DOM.
const signedOut = () => page.evaluate(() => [...document.querySelectorAll('a,button')]
  .some((e) => e.offsetParent !== null && /^iniciar sesi[oó]n$/i.test((e.textContent || '').trim())));
const stop = () => {
  if (!ABORT) return false;
  writeFileSync(BLOCK, JSON.stringify({ site: 'hireline', date: today, reason: ABORT }, null, 2));
  console.error(`\n⛔ HIRELINE-BLOCK: ${ABORT}. Run STOPPED, progress saved. Do NOT retry today.`);
  return true;
};

// Required fields the form left empty (labels), CV presence and phone state — read in-page.
const readForm = () => page.evaluate(() => {
  const form = document.getElementById('myForm');
  if (!form) return null;
  const vis = (e) => e.offsetParent !== null;
  const label = (el) => {
    let c = el;
    for (let i = 0; i < 3 && c; i++) { c = c.parentElement; const l = c?.querySelector('label'); if (l) return l.innerText.replace('*', '').trim().slice(0, 90); }
    return el.name;
  };
  const empty = [];
  for (const el of form.querySelectorAll('input,select,textarea')) {
    if (el.type === 'hidden' || el.type === 'file' || el.disabled || !vis(el)) continue;
    const req = el.required || el.hasAttribute('ng-required') || el.getAttribute('aria-required') === 'true';
    if (!req) continue;
    const v = el.tagName === 'SELECT' ? (el.selectedIndex > 0 ? el.value : '') : String(el.value || '').trim();
    if (!v) empty.push({ name: el.name, label: label(el) });
  }
  const text = document.body.innerText || '';
  // Only a VISIBLE phone input counts: once the profile has a number Hireline hides it (a hidden copy stays).
  const tel = [...form.querySelectorAll('input[name="telefono"]')].find(vis);
  return { empty, hasCv: /ya tienes un cv/i.test(text), phoneField: !!tel, phone: (tel?.value || '').trim() };
});

// ── Apply loop ───────────────────────────────────────────────────────────────────────────────────────────
let sent = 0;
for (const [i, job] of queue.slice(0, MAX).entries()) {
  if (i > 0) await nap(30, 60);                                   // between applications
  await nap(4, 9);
  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!(await settle())) break;
    if (await signedOut()) { ABORT = 'signed out of Hireline (login wall)'; break; }
    const d = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a[href*="/aplicar/"]')].find((e) => e.offsetParent !== null);
      const body = document.body.innerText || '';
      return {
        title: (document.querySelector('h1')?.innerText || '').trim(),
        apply: a ? a.getAttribute('href') : '',
        applied: /ya has aplicado|ya (te )?(postulaste|aplicaste)|ya enviaste tu cv/i.test(body),
        closed: /vacante (cerrada|ya no est[aá] disponible)|ya no acepta/i.test(body),
      };
    });
    job.title = job.title || d.title;
    if (d.applied && !d.apply) { record(job, 'already-applied'); continue; }
    if (!d.apply) { record(job, 'external', d.closed ? 'vacancy closed' : 'no Hireline apply link'); continue; }
    if (!new URL(d.apply, 'https://hireline.io').hostname.endsWith('hireline.io')) { record(job, 'external', d.apply); continue; }

    await nap(2.5, 4.5);
    // The page repeats "Enviar mi CV" 3× (mobile + sticky bar are hidden) → click the VISIBLE one; if an
    // overlay (ads) intercepts the pointer, fall back to a DOM click on that same link.
    const link = page.locator('a[href*="/aplicar/"]').filter({ visible: true }).first();
    await link.click({ timeout: 8000 }).catch(() => link.evaluate((a) => a.click()));
    await page.waitForSelector('#myForm', { timeout: 20000 }).catch(() => {});
    if (!(await settle())) break;
    await page.waitForTimeout(2500);                                       // let Angular bind the profile data

    let f = await readForm();
    if (!f) { record(job, 'error', 'apply form (#myForm) not found'); continue; }
    if (!f.hasCv) { record(job, 'needs-answer', 'no CV on the Hireline profile'); continue; }
    // Phone: Hireline doesn't pre-fill it (10–11-digit mask). Type the RAG-provided number if it's empty.
    if (f.phoneField && !f.phone.replace(/\D/g, '')) {
      if (!PHONE) { record(job, 'needs-answer', 'phone empty → pass --phone from the RAG'); continue; }
      const tel = page.locator('#myForm input[name="telefono"]').filter({ visible: true }).first();
      await tel.click({ timeout: 8000 }).catch(() => tel.evaluate((el) => el.focus()));
      await nap(0.5, 1);
      await tel.pressSequentially(PHONE.slice(-10), { delay: 90 });   // the mask takes the national number
      await page.keyboard.press('Tab');
      await page.waitForTimeout(1200);
      f = await readForm();
    }
    if (f.empty.length) { record(job, 'needs-answer', f.empty.map((x) => x.label || x.name).join(' | ')); continue; }
    if (DRY) { record(job, 'dry-run'); continue; }

    await nap(2.5, 4.5);
    // The submit is a <p ng-click="submitForm(null)">; the click must land on its inner "Aplicar" text node
    // element (a click on the container's padding does nothing).
    const btn = page.locator('#myForm [ng-click^="submitForm"]').first();
    const inner = btn.locator(':scope *', { hasText: /aplicar/i }).last();
    await ((await inner.count()) ? inner : btn.getByText(/aplicar/i).first()).click();
    const ok = await page.waitForURL(/application=success/, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!ok && !(await settle())) break;
    // Submit clicked = applied (owner rule 2026-11-10, same as Dice); the note says if the success page was seen.
    record(job, 'applied', ok ? 'confirmed (dashboard?application=success)' : 'submit clicked (success page not seen)');
    sent++;
  } catch (e) {
    record(job, 'error', e.message.split('\n')[0].slice(0, 160));
  }
  if (stop()) break;
}
stop();
console.log(`Done: ${sent} sent${DRY ? ' (dry-run)' : ''}. Log → ${LOG}`);
await page.goto('about:blank').catch(() => {});
await page.close().catch(() => {});
await browser.close();
