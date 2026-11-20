// computrabajo-apply.mjs — FULLY AUTOMATIC Computrabajo apply (owner decision 2026-10-30) for offers
// that are applied to ON computrabajo.com. Runs over CDP on the ONE logged-in automation Chrome (:9333).
//
// Flow mapped live 2026-10-30 — ALWAYS through the SEARCH LISTING (split grid), never the standalone
// offer page: there the button points to candidato…/match/?oi=, a route Computrabajo's own JS files as
// "post-apply" (could send without our gate/questionnaire handling). Inputs are therefore SEARCH URLs
// (e.g. https://co.computrabajo.com/trabajo-de-react-en-teletrabajo); the engine walks the cards.
//   card      : <article> with a[href*="/ofertas-de-trabajo/"] ending in the 32-hex offer id (OI)
//   detail    : click card → [data-offers-grid-detail-container] — header (company · city · modality) + "Resumen"
//               (contract · schedule · modality · salary "$ X (Mensual)" or none) + description.
//   Aplicar   : [data-apply-ac][offer-detail-not-applied] → POST candidato…/candidate/apply/?oi=<OI>
//               → JSON {result:"OfferHasKQ", html} ⇒ questionnaire; any other success ⇒ APPLIED directly;
//               redirect to a non-computrabajo host ⇒ external → OUT OF SCOPE (skipped).
//   KQ form   : [form-apply-kq] [div-kq][data-div-kq-id=N]: <label> question + textarea
//               KillerQuestions[N].OpenQuestion (open) | radios KillerQuestions[N].ClosedQuestion (closed).
//               Employer-written ("cuál sería tu aspiración salarial", "nivel académico", YOE, stack…).
//   Send      : a[data-apply-ac-kq] "Enviar mi HdV" → POST candidato…/candidate/kq/apply.
//
// CANDIDATE-AGNOSTIC: the gate + salary/modality answers come ONLY from flags the supervisor LM passes
// from THIS user's NotebookLM RAG (asked at onboarding — never another user's values, never hardcoded):
//   --roles "<regex>" (title must match: the user's role map, e.g. "react|frontend|full ?stack")
//   --min-salary <COP/month>   --modalidad remoto|remoto+ciudad|cualquiera   [--ciudad <name>]
//   [--sin-salario aplicar|saltar]   [--aspiracion <COP>]  (defaults to --min-salary)
// Other questions → apply-fieldmap answerFor(); any required one without an answer ⇒ NEEDS_ANSWERS
// (recorded to output/apply-pending-fields.json, NOT sent; resolve from the RAG via learn() and re-run).
//
// ANTI-BLOCK (same model as LinkedIn / Indeed), JITTERED: ONE tab, SERIAL · 4–9 s per offer view ·
// 2.5–4.5 s per step · 30–60 s between applications · ≤10 applications per run (--max, cap 15) ·
// --pace N slows all (N<1 refused). AUTO-STOP on HTTP 429 / captcha / login wall → writes
// output/computrabajo-block.json and refuses to run again the same day. output/computrabajo-seen.json
// makes runs resumable.
//
// Usage: node engines/computrabajo-apply.mjs --roles <re> --min-salary <COP> --modalidad <m> [--ciudad <c>] [flags] <search-url…>
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { answerFor, loadMap, recordUnknowns } from './apply-fields.mjs';
import { acquireSiteLock } from './_site-lock.mjs';
import { breathe, machinePace } from './_machine-guard.mjs';
await acquireSiteLock('computrabajo.com');   // ONE bot per site + machine budget (anti-block, anti-freeze) — see _site-lock.mjs

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const ROLES = opt('--roles', '');
const MIN = Number(String(opt('--min-salary', '')).replace(/[^0-9]/g, ''));
const MODALIDAD = opt('--modalidad', '');
const CIUDAD = opt('--ciudad', '');
// --answers <json>: per-run answers the supervisor LM derives from THIS user's RAG / gary-context (never committed;
// lives under output/): [{ "re": "<regex over the question>", "value": "<answer>" }]. Checked before the fieldmap.
const RUN_ANSWERS = (() => { const f = opt('--answers', ''); if (!f) return []; try { return JSON.parse(readFileSync(f, 'utf8')).map(a => ({ re: new RegExp(a.re, 'i'), value: String(a.value) })); } catch (e) { console.error(`--answers ilegible: ${e.message}`); process.exit(1); } })();
const SIN_SALARIO = opt('--sin-salario', 'aplicar');
const ASPIRACION = String(opt('--aspiracion', '') || MIN);
const MAX_PER_RUN = Math.min(Number(opt('--max', 10)), 15);
const PACE = Number(opt('--pace', 1));

const usage = 'Usage: node engines/computrabajo-apply.mjs --roles "<regex>" --min-salary <COP> --modalidad remoto|remoto+ciudad|cualquiera [--ciudad <c>] [--sin-salario aplicar|saltar] [--aspiracion <COP>] [--max 10] [--pace 1.5] <search-url…>';
// No defaults on purpose: these are the USER's preferences — ask them (onboarding → RAG), never assume.
if (!ROLES || !MIN || !['remoto', 'remoto+ciudad', 'cualquiera'].includes(MODALIDAD)) { console.error(`Faltan las preferencias del usuario (pregúntalas, no las supongas).\n${usage}`); process.exit(1); }
if (MODALIDAD === 'remoto+ciudad' && !CIUDAD) { console.error('--modalidad remoto+ciudad requiere --ciudad (pregúntala al usuario).'); process.exit(1); }
if (!(PACE >= 1)) { console.error('--pace < 1 rechazado: los tiempos por defecto son el mínimo seguro.'); process.exit(1); }
if (!args.length) { console.error(usage); process.exit(1); }

const CDP = `http://127.0.0.1:${process.env.GARY_BROWSER_PORT || 9333}`;
const ROOT = process.cwd();
const SEEN_FILE = `${ROOT}/output/computrabajo-seen.json`;
const BLOCK_FILE = `${ROOT}/output/computrabajo-block.json`;
const FINAL = new Set(['APPLIED', 'ALREADY_APPLIED', 'SKIP_EXTERNAL', 'SKIP_SALARY', 'SKIP_MODALITY', 'CLOSED']);
const ROLE_RE = new RegExp(ROLES, 'i');
const today = () => new Date().toISOString().slice(0, 10);
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const jitter = async (a, b) => { await new Promise(r => setTimeout(r, (a + Math.random() * (b - a)) * PACE * machinePace())); await breathe(); };   // + machine back-off
const oiOf = (u) => (String(u).match(/([0-9A-F]{32})/) || [, u])[1];
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let ABORT = '';

const SEL = {
  detail: '[data-offers-grid-detail-container]',
  apply: '[data-apply-ac][offer-detail-not-applied]',
  reapply: '[data-apply-ac]:has-text("Volver a aplicar")',
  kqForm: '[form-apply-kq]',
  kq: '[form-apply-kq] [div-kq]',
  send: 'a[data-apply-ac-kq]',
};

async function blocked(page) {
  if (ABORT) return true;
  if (/\/acceso\/|\/login/i.test(page.url())) return !!(ABORT = 'sesión cerrada (login wall)');
  if (/captcha|verifica que eres humano|Just a moment|Additional Verification/i.test((await page.locator('body').innerText().catch(() => '')).slice(0, 3000))) return !!(ABORT = 'captcha / verificación anti-bot');
  return false;
}

// Gate on the detail's header + "Resumen" (before "Descripción de la oferta"): salary + modality + city.
function gate(detailText) {
  const head = detailText.split(/Descripci[oó]n de la oferta/i)[0];
  const sal = head.match(/\$\s?([\d.]+)(?:,\d+)?\s*\((Mensual|Quincenal|Anual|Por hora)?/i);
  let cop = null;
  if (sal) {
    cop = Number(sal[1].replace(/\./g, ''));
    if (/anual/i.test(sal[2] || '')) cop /= 12; else if (/quincenal/i.test(sal[2] || '')) cop *= 2; else if (/hora/i.test(sal[2] || '')) cop *= 192;
  }
  if (cop != null && cop < MIN) return { skip: 'SKIP_SALARY', note: `salario publicado ${Math.round(cop)} < mínimo del usuario` };
  if (cop == null && SIN_SALARIO === 'saltar') return { skip: 'SKIP_SALARY', note: 'sin salario publicado y el usuario pidió saltar esas' };
  const h = norm(head);
  const hybrid = /presencial y remoto|hibrido/.test(h);          // Computrabajo: Presencial | Remoto | Presencial y remoto
  const remote = !hybrid && /\bremoto\b|teletrabajo/.test(h);
  const inCity = CIUDAD && h.includes(norm(CIUDAD));
  if (MODALIDAD === 'remoto' && !remote) return { skip: 'SKIP_MODALITY', note: 'no es remoto' };
  if (MODALIDAD === 'remoto+ciudad' && !remote && !inCity) return { skip: 'SKIP_MODALITY', note: 'presencial/híbrido fuera de la ciudad del usuario' };
  return { cop };
}

// Answer one employer question. Salary/modality come from the user's flags; the rest from the fieldmap.
function answerKq(q, map) {
  const n = norm(q);
  if (/aspiraci|salari|cuanto aceptas|pretensi|expectativa (economica|salarial)/.test(n)) return ASPIRACION;
  if (/modalidad|remot|presencial|hibrid/.test(n) && /prefier|acept|dispon|modalidad/.test(n)) {
    return MODALIDAD === 'remoto' ? 'Remoto' : MODALIDAD === 'remoto+ciudad' ? `Remoto, o presencial/híbrido en ${CIUDAD}` : 'Remoto, híbrido o presencial';
  }
  const ra = RUN_ANSWERS.find(a => a.re.test(n) || a.re.test(q));
  if (ra) return ra.value;
  const a = answerFor(q, map);
  return a && a.policy !== 'ASK_USER' && a.value != null && !/\{\{/.test(String(a.value)) ? String(a.value) : null;
}

async function fillKq(page) {
  const map = loadMap();
  const unknown = [];
  for (const d of await page.locator(SEL.kq).all()) {
    const q = (await d.locator('label').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const ans = answerKq(q, map);
    const ta = d.locator('textarea, input[type=text]');
    const radios = d.locator('input[type=radio]');
    if (await ta.count()) {
      if (await ta.first().inputValue()) continue;
      if (ans == null) { unknown.push({ label: q, policy: 'UNKNOWN' }); continue; }
      await ta.first().pressSequentially(ans, { delay: 30 + Math.random() * 50 });
    } else if (await radios.count()) {
      if (await radios.evaluateAll(ns => ns.some(n => n.checked))) continue;
      let ok = false;
      if (ans != null) for (const r of await radios.all()) {
        const t = norm(await r.evaluate(n => n.closest('label')?.innerText || ''));
        const v = norm(ans);
        if (t && (t === v || t.startsWith(v) || v.startsWith(t) || (/^(si|yes)/.test(v) && /^(si|yes)/.test(t)) || (/^no\b/.test(v) && /^no\b/.test(t)))) {
          await r.evaluate(n => n.closest('label').click()); ok = true; break;
        }
      }
      if (!ok) unknown.push({ label: q, policy: ans == null ? 'UNKNOWN' : 'NO_MATCHING_OPTION', options: await radios.evaluateAll(ns => ns.map(n => n.closest('label')?.innerText?.trim()).filter(Boolean)) });
    }
    await jitter(400, 1000);
  }
  return unknown;
}

async function applyOne(page, card) {
  const { url } = card;
  await card.el.click();
  await jitter(4000, 9000);
  if (await blocked(page)) return { url, status: 'BLOCK', note: ABORT };
  const det = page.locator(SEL.detail).first();
  const text = (await det.innerText().catch(() => '')).replace(/\s+/g, ' ');
  if (!text) return { url, status: 'CLOSED', note: 'sin detalle (¿oferta cerrada?)' };
  const title = text.split(/ Remoto | Presencial | Híbrido /)[0].slice(0, 90);
  if (await det.locator(SEL.reapply).isVisible().catch(() => false) && !(await det.locator(SEL.apply).isVisible().catch(() => false))) return { url, title, status: 'ALREADY_APPLIED' };
  const g = gate(text);
  if (g.skip) return { url, title, status: g.skip, note: g.note };
  const btn = det.locator(SEL.apply).first();
  if (!(await btn.isVisible().catch(() => false))) return { url, title, status: 'CLOSED', note: 'sin botón Aplicar' };

  // Aplicar: watch the POST /candidate/apply answer, and any tab/navigation leaving computrabajo.
  const resP = page.waitForResponse(r => /\/candidate\/apply\/?\?/.test(r.url()) && r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
  const popupP = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await btn.click();
  const res = await resP;
  const json = res ? await res.json().catch(() => ({})) : {};
  const popup = await popupP;
  const extUrl = [json.redirect && json.url, popup?.url(), page.url()].find(u => u && /^https?:/.test(u) && !/computrabajo\.com/.test(new URL(u).hostname));
  if (extUrl) { if (popup) await popup.close().catch(() => {}); return { url, title, status: 'SKIP_EXTERNAL', note: 'se aplica en el sitio de la empresa — fuera de alcance' }; }
  if (popup) await popup.close().catch(() => {});
  await jitter(2500, 4500);
  if (await blocked(page)) return { url, title, status: 'BLOCK', note: ABORT };

  if (json.result !== 'OfferHasKQ') {
    return /applied|success|ok/i.test(JSON.stringify(json)) || res?.ok()
      ? { url, title, status: 'APPLIED', note: 'sin preguntas — postulación enviada' }
      : { url, title, status: 'ERROR', note: `respuesta inesperada: ${JSON.stringify(json).slice(0, 120)}` };
  }
  // Conversational KQ variant (mapped live 2026-11-10, ConversationVariant=A): one question per step
  // ([data-div-kq-id] + label[data-kq-question-text] + hidden [data-kq-answer-hidden]); the answer is typed into
  // the chat box #inputText + Enter, which fills that step's hidden input and reveals the next one. "Enviar mi HdV"
  // only becomes visible after the last step. Any step without a known answer → leave UNSENT (NEEDS_ANSWERS);
  // never send unless EVERY step's hidden input holds a value (no empty answers, ever).
  const steps = await page.locator('[form-apply-kq] [data-div-kq-id]').count();
  const legacy = await page.locator(SEL.kq).count();
  if (steps > legacy) {
    const unknownC = await fillKqConversational(page, steps);
    const allFilled = await page.locator('[form-apply-kq] [data-kq-answer-hidden]').evaluateAll(ns => ns.length > 0 && ns.every(n => n.value.trim()));
    if (unknownC.length || !allFilled) {
      if (unknownC.length) recordUnknowns('Computrabajo', title, url, unknownC);
      await page.locator('a[back-show-detail-container-click]').first().click().catch(() => {});
      return { url, title, status: 'NEEDS_ANSWERS', unknown: unknownC, note: `NO enviada: cuestionario conversacional (${steps} pasos) — ${unknownC.length ? 'preguntas sin respuesta en el RAG' : 'pasos sin completar'}` };
    }
    await jitter(2500, 4500);
    const sendC = page.waitForResponse(r => /\/candidate\/kq\/apply/.test(r.url()), { timeout: 20000 }).catch(() => null);
    await page.locator(`${SEL.send}:visible`).first().click({ timeout: 15000 });
    const sentC = await sendC;
    return sentC?.ok() ? { url, title, status: 'APPLIED', note: `cuestionario conversacional (${steps}) respondido — "Enviar mi HdV" enviado` } : { url, title, status: 'ERROR', note: `envío KQ conversacional sin confirmación (${sentC?.status()})` };
  }
  const unknown = await fillKq(page);
  if (unknown.length) {
    recordUnknowns('Computrabajo', title, url, unknown);
    await page.locator('a[back-show-detail-container-click]').first().click().catch(() => {});   // leave it unsent
    return { url, title, status: 'NEEDS_ANSWERS', unknown, note: 'NO enviada: resolver desde el RAG del usuario (learn) y re-correr' };
  }
  await jitter(2500, 4500);
  const sendP = page.waitForResponse(r => /\/candidate\/kq\/apply/.test(r.url()), { timeout: 20000 }).catch(() => null);
  await page.locator(SEL.send).first().click();
  const sent = await sendP;
  return sent?.ok() ? { url, title, status: 'APPLIED', note: 'preguntas respondidas — "Enviar mi HdV" enviado' } : { url, title, status: 'ERROR', note: `envío KQ sin confirmación (${sent?.status()})` };
}

async function fillKqConversational(page, steps) {
  const map = loadMap();
  const unknown = [];
  for (let i = 0; i < steps; i++) {
    const step = page.locator('[form-apply-kq] [data-div-kq-id]').nth(i);
    await step.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await jitter(2500, 4500);                                   // the label is "typed" in — let it settle
    const q = ((await step.locator('label').first().getAttribute('data-kq-question-text').catch(() => '')) ||
               (await step.locator('label').first().innerText().catch(() => ''))).replace(/\s+/g, ' ').trim();
    const ans = answerKq(q, map);
    if (ans == null || !String(ans).trim()) { unknown.push({ label: q, policy: 'UNKNOWN' }); break; }
    await page.locator('#inputText').pressSequentially(String(ans), { delay: 30 + Math.random() * 50 });
    await page.keyboard.press('Enter');
    await jitter(2500, 4500);
    const v = await step.locator('[data-kq-answer-hidden]').inputValue().catch(() => '');
    if (!v.trim()) { unknown.push({ label: q, policy: 'STEP_NOT_ACCEPTED' }); break; }
  }
  return unknown;
}

const block = readJson(BLOCK_FILE, null);
if (block?.date === today()) { console.error(`⛔ COMPUTRABAJO-BLOCK hoy (${block.reason}). No se reintenta el mismo día.`); process.exit(2); }
const seen = readJson(SEEN_FILE, {});

let browser;
try { browser = await chromium.connectOverCDP(CDP); }
catch { console.error(`CDP down en ${CDP} — inicia el navegador de automatización.`); process.exit(1); }
const ctx = browser.contexts()[0];
const page = await ctx.newPage();                 // ONE tab for the whole run
// ≥1440 px keeps the split-grid layout; at ~960 px Computrabajo opens the detail as a modal + .overlay that
// blocks every later card click (seen 2026-11-10: 12 ERROR click timeouts after the first apply).
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
page.on('response', r => { if (r.status() === 429 && /computrabajo\.com/.test(r.url())) ABORT ||= 'HTTP 429'; });

// ≤N-day recency gate (owner order 2026-11-10: max 1 week). Two layers, since this engine SENDS:
//  (1) [opt-in --pubdate] search URLs get Computrabajo's "últimos N días" filter (?pubdate=N, N ∈ 1|3|7|15|30);
//  (2) each card's "Hace N días / Ayer / Hoy / Hace más de 30 días" is read and anything older is skipped unopened.
const MAX_AGE_DAYS = Math.max(1, parseInt(opt('--max-age', '7'), 10));
// (1) is OPT-IN (--pubdate): the ?pubdate param is unverified on the live site and shrank listings to ~3 cards on
// 2026-11-11 — the per-card age gate (2) is the default, deterministic ≤N-day guarantee.
const USE_PUBDATE = args.includes('--pubdate');
const withPubdate = (u) => { const x = new URL(u); const n = [1, 3, 7, 15, 30].find(v => v >= MAX_AGE_DAYS) || 30; x.searchParams.set('pubdate', String(n)); return x.href; };
function cardAgeDays(t) {
  const n = norm(t);
  if (/\bhoy\b|hace (unos )?minutos?|hace \d+ (minutos?|horas?)/.test(n)) return 0;
  if (/\bayer\b/.test(n)) return 1;
  if (/hace mas de 30 dias/.test(n)) return 31;
  const m = n.match(/hace (\d+|un|una) (dias?|semanas?|mes(?:es)?)/);
  if (!m) return null;
  const k = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : 1;
  return k * (m[2].startsWith('dia') ? 1 : m[2].startsWith('semana') ? 7 : 30);
}

const counts = {};
let applies = 0, views = 0;
const bump = (st) => { counts[st] = (counts[st] || 0) + 1; };
outer:
for (const search of args) {
  if (views) await jitter(8000, 15000);           // next results page
  await page.goto(USE_PUBDATE ? withPubdate(search) : search, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await jitter(3000, 6000);
  if (await blocked(page)) break;
  for (const el of await page.locator('article').all()) {
    const href = await el.locator('a[href*="/ofertas-de-trabajo/"]').first().getAttribute('href').catch(() => null);
    if (!href) continue;
    const oi = oiOf(href), url = new URL(href, 'https://co.computrabajo.com').href.split('#')[0];
    const title = (await el.locator('h2, a[href*="/ofertas-de-trabajo/"]').first().innerText().catch(() => '')).trim();
    if (FINAL.has(seen[oi]?.status)) continue;
    let r;
    const age = cardAgeDays(await el.innerText().catch(() => ''));
    if (age != null && age > MAX_AGE_DAYS) r = { url, title, status: 'SKIP_OLD', note: `publicada hace ~${age} días (> ${MAX_AGE_DAYS})` };   // no click needed
    else if (!ROLE_RE.test(title)) r = { url, title, status: 'SKIP_ROLE' };          // no click needed
    else {
      if (applies >= MAX_PER_RUN) { console.log(`⏸  --max ${MAX_PER_RUN} alcanzado — el resto queda para la siguiente corrida.`); break outer; }
      if (applies) await jitter(30000, 60000);    // between applications — protect the account
      r = await applyOne(page, { el, url }).catch(e => ({ url, title, status: 'ERROR', note: String(e.message).slice(0, 160) }));
      views++;
    }
    console.log(JSON.stringify(r));
    bump(r.status);
    if (r.status === 'SKIP_ROLE' || r.status === 'SKIP_OLD') continue;   // not persisted: role map / window may change
    if (r.status === 'APPLIED') applies++;
    seen[oi] = { status: r.status, date: today() };
    writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
    if (ABORT) {
      writeFileSync(BLOCK_FILE, JSON.stringify({ date: today(), reason: ABORT }, null, 2));
      console.error(`\n⛔ COMPUTRABAJO-BLOCK: ${ABORT}. Corrida DETENIDA + progreso guardado. NO reintentar hoy.`);
      break outer;
    }
  }
}
console.log(`Resumen: ${JSON.stringify(counts)}`);
await page.close().catch(() => {});
await browser.close();
