// indeed-apply.mjs — fill an Indeed Apply ("Postúlate rápidamente") application up to the REVIEW step
// and STOP. Runs over CDP on the ONE logged-in automation Chrome (:9333); never launches a browser,
// never clicks Submit ("Enviar tu postulación"), never solves a captcha.
//
// Flow mapped live 2026-10-30 on co.indeed.com → smartapply.indeed.com/beta/indeedapply/form/<module>/…:
//   viewjob   : a[data-testid="viewjob-indeed-apply"] → href to smartapply. Absent ⇒ "Postularse en el
//               sitio de la empresa" (external) → MANUAL: kept for the USER to apply on the company site
//               (output/indeed-manual.json), never followed or filled by the bot (owner order 2026-11-10).
//   contact-info-module      : name/email/phone/city — usually prefilled from the Indeed profile
//   resume-selection-module  : radio cards (structured "CV Indeed" vs uploaded file); keep the selection
//   questions-module/questions/N : employer questions. Each = [data-testid="input-q_<hash>"] wrapper,
//        question text in [data-testid="input-q_<hash>-label"], required ⇔ "-label-asterisk" present;
//        controls named q_<hash> (text/number/textarea/radio/checkbox/select)
//   review-module            : STOP here — the final send is the user's click.
// Anti-bot traps: hidden `hp-continue-button-N` honeypot buttons, and on the questions step the REAL
// Continuar button carries a RANDOM hash data-testid → we only click a VISIBLE, non-hp button by TEXT.
// Invisible reCAPTCHA Enterprise rides along; if its challenge frame shows up → hand off to the user.
//
// ASK-IN-THE-MIDDLE + RESUME (owner order 2026-11-10 — same flow for every user, answers from THEIR RAG):
//   unknown required questions → the engine PAUSES that application with its tab left open on the step, writes
//   output/indeed-pending.json (jk → tab id + every pending question: name/label/type/options; NO answers) and
//   prints "⏸ INDEED-NEEDS-ANSWERS". The supervisor LM answers: facts from the NotebookLM RAG, open questions
//   composed truthfully from the CV/RAG, and only what the RAG lacks (address, postal code…) ASKED to the user —
//   then writes output/indeed-answers.json ({ "<jk>": [{ "name": "q_…", "value": "…" }] } — by name, label or re)
//   and runs `--resume`: the engine re-attaches to THE SAME TAB (never opens another one), fills, and continues
//   to the review step. The answers file is per-run and DELETED after use (PII never stays on disk; durable
//   facts go to the RAG). A rerun of a paused jk without --resume also re-uses its tab.
//
// ANTI-BLOCK (same model as LinkedIn — source-linkedin §1 / linkedin-scan.mjs), JITTERED, never batched:
//   ONE tab at a time, SERIAL · 2.5–4.5 s per form step · 4–9 s on each viewjob · 30–60 s between
//   applications · ≤10 applications per run (--max, hard cap 15) · --pace N slows everything (N<1 refused).
//   NEVER run two indeed-apply processes at once (one account budget). AUTO-STOP on HTTP 429, a visible
//   captcha/Cloudflare challenge, or the sign-in wall (secure.indeed.com/auth) → writes
//   output/indeed-block.json and REFUSES to run again the same day (the user clears it in Chrome:9333).
//   output/indeed-seen.json makes runs resumable: offers with a final outcome are never reprocessed.
//
// Usage: node engines/indeed-apply.mjs [--max 10] [--pace 1.5] <jk | viewjob-url> [more…]
//        node engines/indeed-apply.mjs --resume [--answers output/indeed-answers.json] [jk …]   (default: every paused jk)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { answerFor, fillForm, loadMap, recordUnknowns } from './apply-fields.mjs';
import { coerce, describeSpec, fieldSpec, validAfter } from './field-types.mjs';
import { acquireSiteLock } from './_site-lock.mjs';
import { breathe, machinePace } from './_machine-guard.mjs';
await acquireSiteLock('indeed.com');   // ONE bot per site + machine budget (anti-block, anti-freeze) — see _site-lock.mjs

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = Number(args[i + 1]); args.splice(i, 2); return v; };
const strFlag = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const boolFlag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const RESUME = boolFlag('--resume');
const ANSWERS_FILE = strFlag('--answers', RESUME ? 'output/indeed-answers.json' : '');
const MAX_PER_RUN = Math.min(flag('--max', 10), 15);
const PACE = flag('--pace', 1);
if (!(PACE >= 1)) { console.error('--pace < 1 rechazado: los tiempos por defecto son el mínimo seguro.'); process.exit(1); }
const MAX_STEPS = 12;
const CDP = `http://127.0.0.1:${process.env.GARY_BROWSER_PORT || 9333}`;
const ROOT = process.cwd();
const SEEN_FILE = `${ROOT}/output/indeed-seen.json`;
const BLOCK_FILE = `${ROOT}/output/indeed-block.json`;
const PENDING_FILE = `${ROOT}/output/indeed-pending.json`;
const FINAL = new Set(['READY', 'ALREADY_SENT', 'MANUAL_EXTERNAL', 'CLOSED', 'ALREADY_APPLIED', 'SKIP_EXTERNAL', 'NO_INDEED_APPLY']);  // never reprocess these (last two = legacy)
const MANUAL_FILE = `${process.cwd()}/output/indeed-manual.json`;
const today = () => new Date().toISOString().slice(0, 10);
let ABORT = '';

const SEL = {
  applyBtn: '[data-testid="viewjob-indeed-apply"]',
  question: '[data-testid^="input-q_"]:not([data-testid$="-label"]):not([data-testid$="-input"]):not([data-testid$="-asterisk"]):not([data-testid$="-radio-cards"]):not([data-testid*="-single-select-"]):not([data-testid*="-multi-select-"])',
  resumeRadio: 'input[name="resume-selection"]',
  captchaFrame: 'iframe[src*="recaptcha"][src*="bframe"], iframe[src*="challenges.cloudflare.com"]',
};
const NEXT_RE = /^(continuar|continue|revisar tu postulaci[oó]n|review your application|siguiente|next)$/i;
const SUBMIT_RE = /enviar|submit|postularse$|send/i;

const jitter = async (a, b) => { await new Promise(r => setTimeout(r, (a + Math.random() * (b - a)) * PACE * machinePace())); await breathe(); };   // + machine back-off
const toUrl = (x) => /^https?:/.test(x) ? x : `https://co.indeed.com/viewjob?jk=${x}`;
const jkOf = (x) => (String(x).match(/jk=([0-9a-f]+)/i) || [, x])[1];
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const pending = readJson(PENDING_FILE, {});
const savePending = () => writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));

// Per-run answers from the supervisor LM ({ jk: [{ name | label | re, value }] } or a flat list for every jk).
const RUN_ANSWERS = (() => {
  if (!ANSWERS_FILE) return {};
  if (!existsSync(ANSWERS_FILE)) { if (RESUME) console.log(`(sin ${ANSWERS_FILE}: se reanuda solo con lo que ya hay en el formulario)`); return {}; }
  try { const a = JSON.parse(readFileSync(ANSWERS_FILE, 'utf8')); return Array.isArray(a) ? { '*': a } : a; }
  catch (e) { console.error(`--answers ilegible: ${e.message}`); process.exit(1); }
})();
const normQ = (t) => String(t || '').toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();
function runAnswer(jk, name, label) {
  for (const a of [...(RUN_ANSWERS[jk] || []), ...(RUN_ANSWERS['*'] || [])]) {
    if (a.value == null || String(a.value).trim() === '') continue;
    if ((a.name && a.name === name) || (a.label && normQ(a.label) === normQ(label)) || (a.re && new RegExp(a.re, 'i').test(label))) return { value: String(a.value), policy: 'FILL' };
  }
  return null;
}
const targetIdOf = async (page) => {
  const s = await page.context().newCDPSession(page);
  try { return (await s.send('Target.getTargetInfo')).targetInfo.targetId; } finally { await s.detach().catch(() => {}); }
};
// The tab a paused application was left on (by CDP target id, else by its job header) — re-used, never duplicated.
async function findPausedTab(ctx, jk) {
  const p = pending[jk]; if (!p) return null;
  for (const page of ctx.pages()) {
    if (!/smartapply\.indeed\.com/.test(page.url())) continue;
    if (p.targetId && (await targetIdOf(page).catch(() => '')) === p.targetId) return page;
  }
  for (const page of ctx.pages()) {
    if (!/smartapply\.indeed\.com/.test(page.url())) continue;
    const head = await page.locator('[data-testid="ia-JobHeader-headerContainer"]').first().innerText({ timeout: 3000 }).catch(() => '');
    const h = head.replace(/\s+/g, ' ');
    if (p.title && h.includes(p.title) && (!p.company || h.includes(p.company))) return page;
  }
  return null;
}

// Block = sign-in wall, VISIBLE captcha/Cloudflare challenge (the invisible reCAPTCHA iframe alone is
// normal), or an HTTP 429 seen by the response listener. Sets ABORT so the whole run stops.
async function blocked(page) {
  if (ABORT) return true;
  if (/secure\.indeed\.com\/auth|\/account\/login/.test(page.url())) return !!(ABORT = 'sesión cerrada (sign-in wall)');
  for (const f of await page.locator(SEL.captchaFrame).all()) if (await f.isVisible().catch(() => false)) return !!(ABORT = 'captcha visible');
  if (/Additional Verification Required|verifica que eres humano|Verify you are human/i.test(await page.locator('body').innerText().catch(() => ''))) return !!(ABORT = 'verificación anti-bot');
  return false;
}
const watch = (page) => page.on('response', r => { if (r.status() === 429 && /indeed\.com/.test(r.url())) ABORT ||= 'HTTP 429'; });

// The only safe "next" button: visible, text-matched, not a honeypot, never a submit.
async function nextButton(page) {
  for (const b of await page.locator('button:visible').all()) {
    const tid = (await b.getAttribute('data-testid')) || '';
    const t = (await b.innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
    if (tid.startsWith('hp-') || SUBMIT_RE.test(t)) continue;
    if (NEXT_RE.test(t)) return b;
  }
  return null;
}

// Pick the option whose visible label matches the answer (Yes/Sí/No or text prefix).
function optionMatches(optLabel, value) {
  const o = optLabel.toLowerCase().trim(), v = String(value).toLowerCase().trim();
  if (/^(yes|s[ií])\b/.test(v)) return /^(yes|s[ií])\b/.test(o);
  if (/^no\b/.test(v)) return /^no\b/.test(o);
  return o === v || o.startsWith(v) || v.startsWith(o);
}

// Fill one questions-module page. Returns the required questions we could not answer.
async function fillQuestions(page, jk) {
  const map = loadMap();
  const unknown = [], filled = [];
  for (const w of await page.locator(SEL.question).all()) {
    const tid = await w.getAttribute('data-testid');
    const name = tid.replace(/^input-/, '');
    const q = (await page.locator(`[data-testid="${tid}-label"]`).innerText().catch(() => '')).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
    if (!q) continue;
    const required = (await page.locator(`[data-testid="${tid}-label-asterisk"]`).count()) > 0;
    const ctl = page.locator(`:is(input, select, textarea)[name="${name}"]`);   // the fieldset carries the name too
    // FIELD CONTRACT (field-types.mjs): what this control accepts — type, min/max, length, pattern, options.
    const spec = await fieldSpec(ctl).catch(() => ({ type: '', options: [] }));
    const type = spec.type;
    const pend = (policy, extra = {}) => unknown.push({ name, label: q, type, required, accepts: describeSpec(spec), options: spec.options, policy, ...extra });
    const ans = runAnswer(jk, name, q) || answerFor(q, map);
    const usable = ans && ans.policy !== 'ASK_USER' && ans.value != null && !/\{\{/.test(String(ans.value));
    try {
      if (type === 'radio' || type === 'checkbox') {
        if (await ctl.evaluateAll(ns => ns.some(n => n.checked))) continue;   // already answered (draft/profile)
        const fit = usable ? coerce(spec, ans.value) : { ok: false, why: 'no answer' };
        let ok = false;
        if (fit.ok) for (const opt of await ctl.all()) {
          const id = await opt.getAttribute('id');
          const lab = (await page.locator(`label[for="${id}"]`).innerText().catch(() => '')).trim();
          if (lab === fit.value || optionMatches(lab, fit.value)) { await page.locator(`label[for="${id}"]`).click(); ok = true; break; }
        }
        if (ok) filled.push(`${q} = ${fit.value}`);
        else if (required) pend(usable ? 'TYPE_MISMATCH' : 'UNKNOWN', usable ? { why: fit.why, given: String(ans.value) } : {});
      } else if (type === 'select') {
        if (await ctl.inputValue()) continue;
        const fit = usable ? coerce(spec, ans.value) : { ok: false, why: 'no answer' };
        // bounded: a label that isn't there must PAUSE the application, never hang (2026-11-10 freeze)
        if (fit.ok && await ctl.selectOption({ label: fit.value }, { timeout: 5000 }).then(() => true).catch(() => false)) filled.push(`${q} = ${fit.value}`);
        else if (fit.ok) { if (required) pend('TYPE_MISMATCH', { why: `option "${fit.value}" could not be selected`, given: String(ans.value) }); }
        else if (required) pend(usable ? 'TYPE_MISMATCH' : 'UNKNOWN', usable ? { why: fit.why, given: String(ans.value) } : {});
      } else if (!type) {
        // custom widget (combobox / listbox built from divs) — the bot can't fill it safely → ask, never skip silently
        const opts = await w.locator('[role=option], li, label').allInnerTexts().catch(() => []);
        if (required) pend('UNSUPPORTED_CONTROL', { why: 'custom dropdown/widget — not a native field', options: opts.map((t) => t.trim()).filter(Boolean).slice(0, 20) });
      } else if (type) {
        if (await ctl.inputValue()) continue;
        if (usable) {
          const fit = coerce(spec, ans.value);
          if (!fit.ok) { if (required) pend('TYPE_MISMATCH', { why: fit.why, given: String(ans.value) }); await jitter(300, 900); continue; }   // never type garbage
          const val = fit.value;
          const d = val.length > 200 ? 12 + Math.random() * 18 : 40 + Math.random() * 60;   // human-ish typing (long answers a bit faster)
          await ctl.pressSequentially(val, { delay: d });
          await jitter(300, 700);
          const after = await validAfter(ctl);
          if (!after.ok) {                                                   // the form rejected it → clear + ask again
            await ctl.fill('').catch(() => {});
            pend('INVALID_AFTER_FILL', { why: after.why, given: val });
          } else filled.push(`${q} = ${ans.policy === 'FLAG' ? val + ' [FLAG]' : val}`);
        } else if (required) pend(ans ? 'ASK_USER' : 'UNKNOWN');
      }
    } catch (e) { if (required) pend('FILL_ERROR', { error: String(e.message).slice(0, 80) }); }
    await jitter(300, 900);
  }
  return { filled, unknown };
}

async function applyOne(ctx, input) {
  const url = toUrl(input), jk = jkOf(input);
  const paused = await findPausedTab(ctx, jk);
  if (paused) {                                               // RESUME on the SAME tab — never a second one
    watch(paused);
    await paused.bringToFront().catch(() => {});
    console.log(`↺ ${jk}: reanudando en la misma pestaña (${pending[jk].title})`);
    return walk(paused, { url, jk, title: pending[jk].title, company: pending[jk].company });
  }
  if (RESUME && pending[jk]) console.log(`(${jk}: la pestaña pausada ya no está — se reabre UNA vez; Indeed guarda el borrador)`);
  const page = await ctx.newPage();
  watch(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await jitter(4000, 9000);
  if (await blocked(page)) return { url, status: 'BLOCK', note: ABORT };
  const title = (await page.title()).split(' - ')[0];
  const btn = page.locator(SEL.applyBtn).first();
  if (!(await btn.count())) {
    // Auto-apply ONLY in-Indeed ("Postúlate rápidamente"). No Indeed Apply button ⇒ closed / already applied (said by
    // the page) or, otherwise, an EXTERNAL apply on the company site → MANUAL for the user (never followed here).
    // 2026-11-10: 7 external offers were mislabeled "sin Indeed Apply" because the company-site CTA text varies —
    // so "external" is the default once closed/applied are ruled out, and the CTA href is captured when visible.
    const body = await page.locator('body').innerText().catch(() => '');
    const company = (await page.locator('[data-testid="inlineHeader-companyName"], [data-company-name]').first().innerText({ timeout: 2000 }).catch(() => '')).trim();
    await page.close().catch(() => {});
    if (/este empleo ya no está disponible|esta oferta (ha )?(expirado|caducado)|this job has expired|no longer available|ya no acepta/i.test(body))
      return { url, title, status: 'CLOSED', note: 'oferta cerrada' };
    if (/ya (te )?postulaste|you applied|postulaci[oó]n enviada|applied on/i.test(body))
      return { url, title, status: 'ALREADY_APPLIED', note: 'ya postulada' };
    const ext = /sitio (web )?de la (empresa|compa[nñ][ií]a)|company('s)? (site|website)|apply on company/i.test(body);
    return { url, title, company, status: 'MANUAL_EXTERNAL', note: `${ext ? 'se postula en el sitio de la empresa' : 'sin Indeed Apply'} → aplica el USUARIO (manual, el bot no la sigue)` };
  }
  // A saved draft turns the "Postúlate" link into a <button> with no href ("Continuar postulación") — click it then
  // (seen 2026-11-10: goto(null) → "expected string, got object"). Same tab: Indeed Apply opens in place.
  const href = await btn.getAttribute('href');
  if (href) await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  else { await btn.click(); await page.waitForURL(/smartapply\.indeed\.com|indeedapply/i, { timeout: 30000 }).catch(() => {}); }
  await jitter(2000, 3000);
  // Header reads "<title> <company> - <location>".
  const company = ((await page.locator('[data-testid="ia-JobHeader-headerContainer"]').first().innerText().catch(() => ''))
    .replace(/\s+/g, ' ').replace(title, '').split(' - ')[0].trim()) || 'Indeed';
  return walk(page, { url, jk, title, company });
}

// Pause = keep the tab on this step + record every pending question so the LM can answer / ask the user.
async function pause(page, meta, mod, unknown, log) {
  recordUnknowns(meta.company, meta.title, meta.url, unknown);
  pending[meta.jk] = { jk: meta.jk, url: meta.url, company: meta.company, title: meta.title, step: mod,
    targetId: await targetIdOf(page).catch(() => ''), at: new Date().toISOString(), questions: unknown };
  savePending();
  console.log(`⏸ INDEED-NEEDS-ANSWERS ${meta.jk} (${meta.company} — ${meta.title}): ${unknown.length} pregunta(s) en ${mod}. `
    + `Pestaña en pausa; responde en output/indeed-answers.json y corre --resume (misma pestaña).`);
  return { url: meta.url, company: meta.company, title: meta.title, status: 'NEEDS_ANSWERS', log, unknown, note: 'pausada en la misma pestaña → --resume' };
}

async function walk(page, meta) {
  const { url, jk, title, company } = meta;
  const log = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    await jitter(2500, 4500);
    if (await blocked(page)) return { url, title, status: 'BLOCK', log, note: ABORT };
    const path = new URL(page.url()).pathname;
    const mod = (path.match(/form\/([^/]+)/) || [, path])[1];

    if (/review/.test(mod) || (await page.locator('button:visible').filter({ hasText: /enviar tu postulaci|submit your application/i }).count())) {
      return { url, company, title, status: 'READY', log, note: 'revisa y haz clic TÚ en "Enviar tu postulación"' };
    }
    if (/post-apply|confirmation/.test(mod)) return { url, title, status: 'ALREADY_SENT', log };

    if (mod.startsWith('questions')) {
      const { filled, unknown } = await fillQuestions(page, jk);
      log.push(`${mod}: ${filled.length} llenadas`);
      if (unknown.length) return pause(page, meta, mod, unknown, log);
    } else if (mod.startsWith('resume')) {
      const picked = await page.locator(SEL.resumeRadio).evaluateAll(ns => ns.some(n => n.checked)).catch(() => true);
      if (!picked) return { url, title, status: 'NEEDS_RESUME', log, note: 'sube/selecciona un CV en Indeed' };
      log.push('resume: ok');
    } else {
      // contact-info / work-experience / unknown modules: generic label-based filler, then continue.
      const { filled, unknown } = await fillForm(page.locator('main, form').first(), page);
      log.push(`${mod}: ${filled.length} llenadas`);
      if (unknown.length) return pause(page, meta, mod, unknown, log);
    }

    const next = await nextButton(page);
    if (!next) return { url, title, status: 'STUCK', log, note: `sin botón Continuar en ${mod}` };
    const before = page.url();
    await next.click();
    await page.waitForURL(u => u.toString() !== before, { timeout: 15000 }).catch(() => {});
    if (page.url() === before) return { url, title, status: 'VALIDATION', log, note: `Continuar no avanzó en ${mod} (¿campo requerido/validación?)` };
  }
  return { url, title, status: 'STUCK', log, note: 'demasiados pasos' };
}

const block = readJson(BLOCK_FILE, null);
if (block?.date === today()) {
  console.error(`⛔ INDEED-BLOCK hoy (${block.reason}). No se reintenta el mismo día — despeja la verificación en Chrome:9333 y vuelve mañana.`);
  process.exit(2);
}
const seen = readJson(SEEN_FILE, {});
if (RESUME && !args.length) args.push(...Object.keys(pending));
const inputs = args.filter(x => !FINAL.has(seen[jkOf(x)]?.status));
if (!args.length) { console.error(RESUME ? 'Nada en pausa (output/indeed-pending.json vacío).' : 'Usage: node engines/indeed-apply.mjs [--max 10] [--pace 1.5] <jk | viewjob-url> [more…]  ·  --resume [--answers f] [jk…]'); process.exit(1); }
if (inputs.length < args.length) console.log(`(${args.length - inputs.length} ya procesadas antes — omitidas, ver output/indeed-seen.json)`);

let browser;
try { browser = await chromium.connectOverCDP(CDP); }
catch { console.error(`CDP down en ${CDP} — inicia el navegador de automatización (Ajustes / engines/start-chrome-debug).`); process.exit(1); }
const ctx = browser.contexts()[0];

const counts = {};
for (const [i, x] of inputs.slice(0, MAX_PER_RUN).entries()) {
  if (i) await jitter(30000, 60000);            // between applications — protect the account
  const r = await applyOne(ctx, x).catch(e => ({ url: toUrl(x), status: 'ERROR', note: String(e.message).slice(0, 160) }));
  console.log(JSON.stringify(r));
  counts[r.status] = (counts[r.status] || 0) + 1;
  seen[jkOf(x)] = { status: r.status, date: today() };
  writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
  if (r.status === 'MANUAL_EXTERNAL') {                  // manual queue for the offers map (user applies on the company site)
    const man = readJson(MANUAL_FILE, {});
    man[jkOf(x)] = { jk: jkOf(x), url: r.url, title: r.title, company: r.company || '', date: today(), apply: 'manual' };
    writeFileSync(MANUAL_FILE, JSON.stringify(man, null, 2));
  }
  if (r.status !== 'NEEDS_ANSWERS' && pending[jkOf(x)]) { delete pending[jkOf(x)]; savePending(); }
  if (ABORT) {
    writeFileSync(BLOCK_FILE, JSON.stringify({ date: today(), reason: ABORT }, null, 2));
    console.error(`\n⛔ INDEED-BLOCK: ${ABORT}. Corrida DETENIDA + progreso guardado. NO reintentar hoy — el usuario despeja la verificación en Chrome:9333 y se retoma otro día.`);
    break;
  }
}
if (inputs.length > MAX_PER_RUN) console.log(`⏸  --max ${MAX_PER_RUN} alcanzado — el resto queda para la siguiente corrida.`);
console.log(`Resumen: ${JSON.stringify(counts)}`);
console.log('>>> GARY NO envía: revisa cada pestaña READY y haz clic tú en "Enviar tu postulación".');
if (counts.MANUAL_EXTERNAL) console.log(`✋ ${counts.MANUAL_EXTERNAL} oferta(s) se postulan en el sitio de la empresa → MANUALES para el usuario (output/indeed-manual.json → mapa de ofertas).`);
if (Object.keys(pending).length) console.log(`⏸ En pausa (misma pestaña, esperando respuestas): ${Object.values(pending).map((p) => `${p.jk} ${p.company}`).join(' · ')} → output/indeed-pending.json`);
if (ANSWERS_FILE && existsSync(ANSWERS_FILE)) { try { unlinkSync(ANSWERS_FILE); } catch {} }   // per-run answers never stay on disk
await browser.close();                          // detaches CDP only; tabs stay open for the user
