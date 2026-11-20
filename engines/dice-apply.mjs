// ============================================================================
// dice-apply.mjs — Dice in-platform apply, FULLY AUTOMATIC (owner decision 2026-11-10).
//
// The second exception to GARY's "never click Submit" rule (the first is Computrabajo). Applies ONLY through
// Dice's own wizard (/job-applications/<id>/wizard) with the resume ALREADY on the user's Dice profile:
//   detail page → "Apply" → Step 1 (Resume & Cover letter) → Next → … → Step N (Review) → Submit.
// Skips (never sends) when: the apply leaves dice.com (external ATS), the job is already applied, the profile
// has no resume, or any step asks a REQUIRED question the wizard didn't pre-fill (recorded for the LM to
// resolve → NotebookLM RAG, never guessed). Input = the LM's triaged queue, never the raw feed.
//
// Usage:
//   node engines/board-sweep.mjs --site dice-recs        # 1. map (0 tokens) → output/board-sweep/dice-recs-jobs.json
//   (LM triage)                                          # 2. survivors → output/board-sweep/dice-apply-queue.json
//   node engines/dice-apply.mjs                          # 3. apply the queue (≤10/run)
//   node engines/dice-apply.mjs --dry-run                # walk the wizard to Submit and stop (no send)
//   node engines/dice-apply.mjs --urls "<job-detail-url>,<…>" --max 3
// Queue file: JSON array of job-detail URLs or of { url, title?, company? } (the LM writes it).
// Log: output/board-sweep/dice-applied.json  { "<url>": { status, at, title, company, note } }
//   status ∈ applied · dry-run · external · already-applied · needs-answer · error
//
// ANTI-BLOCK (mandatory — same budget as LinkedIn/Indeed/Computrabajo): ONE process, ONE tab, serial.
//   Detail 4–9 s · wizard step 2.5–4.5 s · between applications 30–60 s · ≤10 applications/run.
//   405/423/429, an uncleared 403/Cloudflare/captcha, or a sign-in wall → STOP, write
//   output/board-sweep/dice-block.json (shared with board-sweep) → no retry the same day.
// ============================================================================
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { acquireSiteLock } from './_site-lock.mjs';
import { breathe, machinePace } from './_machine-guard.mjs';
await acquireSiteLock('dice.com');   // ONE bot per site + machine budget (anti-block, anti-freeze) — see _site-lock.mjs

const arg = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry-run');
const MAX = Math.min(10, Math.max(1, parseInt(arg('--max', '10'), 10)));   // hard cap 10/run
const PACE = Math.max(1, parseFloat(arg('--pace', '1')) || 1);
const PORT = arg('--port', process.env.CDP_PORT || '9333');
const DIR = 'output/board-sweep';
const QUEUE = arg('--queue', `${DIR}/dice-apply-queue.json`);
const LOG = `${DIR}/dice-applied.json`;
const BLOCK = `${DIR}/dice-block.json`;
mkdirSync(DIR, { recursive: true });
const today = new Date().toISOString().slice(0, 10);

if (existsSync(BLOCK)) {
  try { const b = JSON.parse(readFileSync(BLOCK, 'utf8')); if (b.date === today) { console.error(`⛔ Dice blocked earlier today (${b.reason}). Not retrying until tomorrow.`); process.exit(2); } } catch {}
}

// ── Queue (LM-triaged) minus anything already handled ────────────────────────────────────────────────────
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const done = readJson(LOG, {});
const raw = arg('--urls', '') ? arg('--urls', '').split(',') : readJson(QUEUE, []);
const queue = (Array.isArray(raw) ? raw : []).map((x) => (typeof x === 'string' ? { url: x } : x))
  .map((x) => ({ ...x, url: String(x.url || '').trim().split('?')[0] }))
  .filter((x) => /^https:\/\/www\.dice\.com\/job-detail\//.test(x.url))
  .filter((x) => !done[x.url] || ['error', 'dry-run'].includes(done[x.url].status));
if (!queue.length) { console.log(`Nothing to apply (queue: ${QUEUE}).`); process.exit(0); }
console.log(`Dice apply — ${Math.min(MAX, queue.length)} of ${queue.length} queued${DRY ? ' [DRY-RUN: stops at Submit]' : ''}.`);
const record = (job, status, note = '') => {
  done[job.url] = { status, at: new Date().toISOString(), title: job.title || '', company: job.company || '', note };
  writeFileSync(LOG, JSON.stringify(done, null, 2));
  console.log(`  ${status.padEnd(21)} ${job.title || job.url}${note ? ` — ${note}` : ''}`);
};

// ── Browser + block guard (same rules as board-sweep) ────────────────────────────────────────────────────
let browser;
try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); }
catch { console.error(`CDP ${PORT} down — start the automation Chrome and retry.`); process.exit(1); }
const page = await browser.contexts()[0].newPage();
await page.bringToFront().catch(() => {});   // the user can watch the bot work
let ABORT = '', last403 = '';
const nap = async (a, z) => { await page.waitForTimeout(Math.round((a + Math.random() * (z - a)) * 1000 * PACE * machinePace())); await breathe(); };   // + machine back-off
page.on('response', (r) => {
  if (ABORT || r.request().resourceType() !== 'document' || !r.url().includes('dice.com')) return;
  if ([405, 423, 429].includes(r.status())) ABORT = `HTTP ${r.status()} on ${r.url().slice(0, 90)}`;
  else if (r.status() === 403) last403 = r.url().slice(0, 90);
});
const CHALLENGE_RE = /just a moment|verifying you are human|attention required|unusual traffic|are you a robot|captcha|access denied/i;
async function settle() {
  for (let t = 0; t < 8; t++) {
    if (ABORT) return false;
    const head = await page.evaluate(() => `${document.title}\n${(document.body?.innerText || '').slice(0, 1500)}`).catch(() => '');
    if (head.trim().length > 200 && !CHALLENGE_RE.test(head)) { last403 = ''; break; }
    if (t === 7) { ABORT = last403 ? `HTTP 403 not cleared on ${last403}` : 'bot challenge / captcha did not clear'; return false; }
    await page.waitForTimeout(2500);
  }
  if (/\/dashboard\/login|\/login\b/.test(new URL(page.url()).pathname)) { ABORT = 'signed out of Dice (login wall)'; return false; }
  return true;
}
const stop = () => {
  if (!ABORT) return false;
  writeFileSync(BLOCK, JSON.stringify({ site: 'dice', date: today, reason: ABORT }, null, 2));
  console.error(`\n⛔ DICE-BLOCK: ${ABORT}. Run STOPPED, progress saved. Do NOT retry today.`);
  return true;
};

// One wizard step, read in-page: step label, buttons, and required fields the wizard left empty.
const readStep = () => page.evaluate(() => {
  // body, not <main>: after the SPA route swap a stale <main> from the detail page can linger.
  const root = document.body;
  const text = (root.innerText || '').split('Technology Professionals')[0];
  const label = (el) => {
    const id = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    return ((id?.innerText) || el.getAttribute('aria-label') || el.closest('fieldset,div')?.querySelector('legend,label')?.innerText || el.name || '').trim().slice(0, 120);
  };
  const empty = [];
  for (const el of root.querySelectorAll('input,select,textarea')) {
    if (el.type === 'hidden' || el.type === 'file' || el.disabled) continue;
    const req = el.required || el.getAttribute('aria-required') === 'true';
    if (!req) continue;
    if (el.type === 'radio' || el.type === 'checkbox') {
      if (!root.querySelector(`input[name="${CSS.escape(el.name)}"]:checked`)) empty.push(label(el));
    } else if (!String(el.value || '').trim()) empty.push(label(el));
  }
  const btn = (re) => [...root.querySelectorAll('button')].some((b) => re.test((b.innerText || '').trim()) && !b.disabled);
  return {
    step: (text.match(/Step\s+\d+\s+of\s+\d+/i) || [''])[0],
    hasResume: /Resume\s*\*?[\s\S]{0,200}\.(pdf|docx?|rtf|txt)\b/i.test(text),
    empty: [...new Set(empty.filter(Boolean))],
    next: btn(/^next$/i), submit: btn(/^submit$/i),
    done: /application (has been )?(submitted|sent)|you('ve| have) applied|thank(s| you) for applying|successfully applied/i.test(text) || (!document.querySelector('a[href*="/job-applications/"][href$="/wizard"]') && /(^|\n)\s*Applied\s*(\n|$)/.test(text)),
  };
});
const click = (name) => page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first().click();

// ── Apply loop ───────────────────────────────────────────────────────────────────────────────────────────
let sent = 0;
for (const [i, job] of queue.slice(0, MAX).entries()) {
  if (i > 0) await nap(30, 60);                                   // between applications
  await nap(4, 9);
  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!(await settle())) break;
    // The apply control renders late (SPA) → wait for either the wizard link or the "Applied" state.
    await page.waitForFunction(() => document.querySelector('a[href*="/job-applications/"][href$="/wizard"]')
      || /(^|\n)\s*Applied\s*(\n|$)/.test(document.body?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
    const d = await page.evaluate(() => {
      const body = document.body.innerText || '';
      const apply = document.querySelector('a[href*="/job-applications/"][href$="/wizard"]');
      return {
        title: (document.querySelector('h1')?.innerText || '').trim(),
        // Applied ⇔ the Apply link is GONE and a line reads EXACTLY "Applied" (the control keeps an icon child,
        // so match its text). Not the title ("Applied AI Engineer"), not the generic "Create an alert based on
        // the job you applied for" prompt — that one shows on EVERY job page.
        applied: !apply && /(^|\n)\s*Applied\s*(\n|$)/.test(body),
        wizard: apply ? apply.getAttribute('href') : '',
        externalHint: /apply on company site|external site|redirect/i.test(body.slice(0, 5000)),
      };
    });
    job.title = job.title || d.title;
    if (d.applied) { record(job, 'already-applied'); continue; }
    if (!d.wizard) { record(job, 'external', d.externalHint ? 'apply on company site' : 'no Dice wizard link'); continue; }

    await nap(2.5, 4.5);
    await page.locator(`a[href="${d.wizard}"]`).first().click();   // the human path, not a direct URL
    // Dice is a SPA: the click swaps routes in place → wait for the wizard URL, then for its "Step X of Y".
    await page.waitForURL((u) => !u.hostname.endsWith('dice.com') || u.pathname.endsWith('/wizard'), { timeout: 20000 }).catch(() => {});
    if (!new URL(page.url()).hostname.endsWith('dice.com')) { record(job, 'external', new URL(page.url()).hostname); continue; }
    if (!(await settle())) break;
    await page.waitForFunction(() => /Step\s+\d+\s+of\s+\d+/i.test(document.body?.innerText || ''), null, { timeout: 15000 }).catch(() => {});

    let outcome = '';
    for (let s = 0; s < 8 && !outcome; s++) {
      const st = await readStep();
      if (process.env.DICE_DEBUG) console.log('   step', page.url(), JSON.stringify(st));
      if (st.done) { outcome = 'applied'; break; }
      if (s === 0 && !st.hasResume) { outcome = 'needs-answer: no resume on the Dice profile'; break; }
      if (st.empty.length) { outcome = `needs-answer: ${st.step} → ${st.empty.join(' | ')}`; break; }
      if (st.next) {
        await nap(2.5, 4.5);
        const before = st.step;
        await click('next');
        await page.waitForFunction((b) => ((document.body?.innerText || '').match(/Step\s+\d+\s+of\s+\d+/i) || [''])[0] !== b, before, { timeout: 15000 }).catch(() => {});
        continue;
      }
      if (st.submit) {
        if (DRY) { outcome = 'dry-run'; break; }
        await nap(2.5, 4.5);
        await click('submit');
        // After Submit Dice returns to the job page, which then shows "Applied".
        await page.waitForFunction(() => /application (has been )?(submitted|sent)|thank(s| you) for applying/i.test(document.body?.innerText || '')
          || (!document.querySelector('a[href*="/job-applications/"][href$="/wizard"]') && /(^|\n)\s*Applied\s*(\n|$)/.test(document.body?.innerText || '')),
          null, { timeout: 20000 }).catch(() => {});
        if (!(await settle())) break;
        // Submit clicked = applied (owner rule 2026-11-10; verified on 5/5 test sends). The note only says
        // whether Dice's "Applied" state was also seen, so a rare failed send can still be spotted in the log.
        outcome = (await readStep()).done ? 'applied' : 'applied: submit clicked (confirmation not seen)';
        break;
      }
      outcome = `error: unknown wizard state (${st.step || 'no step label'})`;
    }
    if (ABORT) break;
    const [status, ...note] = (outcome || 'error: wizard did not finish').split(': ');
    record(job, status, note.join(': '));
    if (status === 'applied') sent++;
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
