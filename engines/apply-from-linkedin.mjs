// Best-effort apply assistant for a LinkedIn job, driving the dedicated debug Chrome (:9333)
// over CDP (logged-in, isolated profile → not flagged; never the user's personal browser).
// Opens the posting, clicks Apply / Easy Apply, fills SAFE fields + EEO self-ID + the standard
// application answers, attaches the CV, and by DEFAULT parks at the Submit step (the user's click).
// LinkedIn Easy Apply is GARY's ONE fully-automatable node: with the explicit opt-in --submit flag
// (per-offer authorization by the user) the bot presses "Submit application" itself. Captcha is
// ALWAYS the user's — never solved. Without --submit, GARY never submits.
//
// Handles: JazzHR / applytojob.com (resumator-* fields — full map), generic ATS
// (Greenhouse/Ashby/Workable safe fields), and LinkedIn Easy Apply modals.
//
// Prereq:  engines\start-chrome-debug.cmd  (debug Chrome on :9333, --remote-allow-origins=*).
// Usage:   node engines/apply-from-linkedin.mjs "<linkedin-job-url>" "<cvPath>" [--submit] [--resume]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fillForm, recordUnknowns } from './apply-fields.mjs';  // smart bilingual (EN/ES) engine + pending collection

const url = process.argv[2];
const cvPath = process.argv[3] || '';
// --submit: LinkedIn Easy Apply ONLY — the bot presses "Submit application" at the end. This is an
// OPT-IN flag the user passes with explicit per-offer authorization (their bot, their call). Without it
// (DEFAULT) the application is parked at the Submit step for the user's own click. Captcha is never solved.
const doSubmit = process.argv.includes('--submit');
// --resume: continue the ALREADY-OPEN Easy Apply modal (after answering a screening question via the
// chat → learn()) — no navigation, no restart. Connects to the open /apply/ tab and keeps clicking Next.
const resume = process.argv.includes('--resume');
if (!url && !resume) { console.error('Usage: node engines/apply-from-linkedin.mjs "<url>" "<cvPath>" [--submit] [--resume]'); process.exit(1); }

// Standard application answers placeholder block. Keep in sync with the job-search skill
// "Application form answers" section.
// candidate values come from config/apply-fieldmap.json + config/profile.yml — never hardcode PII
const P = {
  first: '{{FIRST}}', last: '{{LAST}}', email: '{{EMAIL}}',
  phone: '{{PHONE}}',                      // single field; if a separate country code → pick {{PHONE_COUNTRY_CODE}} / {{COUNTRY}}
  address: '{{ADDRESS}}', city: '{{CITY}}', state: '{{STATE}}', postal: '{{POSTAL}}', country: '{{COUNTRY}}',
  linkedin: '{{LINKEDIN_URL}}', github: '{{GITHUB_URL}}',
  languages: '{{LANGUAGES}}',
  skills: '{{SKILLS}}',
  salary: '{{SALARY}}',                    // compensation preference — sourced from config/profile.yml (compensation.*)
  gender: '{{GENDER}}', ethnicity: '{{ETHNICITY}}',
  education: '{{EDUCATION}}',               // highest-education self-map; FLAG for the user
  veteranNo: /not a (protected )?veteran|i am not/i,
  disabilityNo: /no,? i (do not|don.t) have|not have a disability/i,
};

function winAlert(title, msg) {
  const ps = `Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show('${msg.replace(/'/g, "''")}','${title.replace(/'/g, "''")}','OK','Information')`;
  spawn('powershell', ['-NoProfile', '-Command', ps], { detached: true, stdio: 'ignore' }).unref();
}

let browser;
try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); }
catch { console.error('CDP down. Run engines\\start-chrome-debug.cmd first.'); process.exit(1); }
const ctx = browser.contexts()[0];
let easyApply = false, clicked = false;
const page = resume
  ? (ctx.pages().find(p => /\/apply\//.test(p.url())) || ctx.pages().find(p => p.url().includes('linkedin.com')) || await ctx.newPage())
  : await ctx.newPage();
const filled = [];
const log = (m) => console.log(m);

if (resume) {
  // Continue the application already open in the modal (after a learn()) — NO navigation, NO restart.
  easyApply = true; clicked = true;
  await page.bringToFront().catch(() => {});
  log('RESUME: continuing the already-open Easy Apply modal (no navigation, same application).');
} else {
  console.log(`Opening in the debug Chrome: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.mouse.wheel(0, 400).catch(() => {});
  await page.waitForTimeout(1500);

  // 0) Already-applied? LinkedIn shows an "Applied" / "Solicitud enviada" badge/button after applying.
  const alreadyApplied = await page.getByText(/^Applied\b|Solicitud enviada|Ya te postulaste|Te postulaste/i).first().count().catch(() => 0);
  if (alreadyApplied) { console.log('ALREADY-APPLIED — skipping (no action): ' + url); await browser.close().catch(() => {}); process.exit(2); }

  // 1) Click the Apply / Easy Apply button — try several strategies.
  const strategies = [
    () => page.locator('.jobs-apply-button, button.jobs-apply-button').first(),
    () => page.getByRole('button', { name: /Easy Apply|Solicitud sencilla/i }).first(),
    () => page.getByRole('button', { name: /^Apply$|^Solicitar$|Apply now|Solicitar ahora/i }).first(),
    () => page.getByRole('link', { name: /^Apply$|Apply on|Solicitar/i }).first(),
  ];
  for (const make of strategies) {
    try {
      const btn = make();
      if (!(await btn.count())) continue;
      await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      const label = (await btn.innerText().catch(() => '')) || (await btn.getAttribute('aria-label').catch(() => '')) || 'Apply';
      easyApply = /easy apply|solicitud sencilla/i.test(label);
      await btn.click({ timeout: 5000 });
      clicked = true;
      log(`Clicked "${label.trim()}" (${easyApply ? 'Easy Apply' : 'external/Apply'})`);
      await page.waitForTimeout(3500);
      break;
    } catch {}
  }
  if (!clicked) log('Could not find/click an Apply button — likely external ATS or guest view; manual apply.');
}

// Locate the working page (external ATS may open a new tab).
let workPage = page;
if (!easyApply) {
  await page.waitForTimeout(2500);
  const ext = ctx.pages().reverse().find((p) => !p.url().includes('linkedin.com') && /^https?:/.test(p.url()));
  if (ext) { workPage = ext; await ext.bringToFront().catch(() => {}); log(`External apply tab: ${ext.url().slice(0, 70)}`); }
}

// --- Fillers (push to `filled` only on real success — no false positives) ---
async function fillByName(root, name, val, label) {
  try { const el = root.locator(`[name="${name}"]`).first(); if (!(await el.count())) return; await el.fill(val, { timeout: 3500 }); filled.push(label); } catch {}
}
async function selByName(root, name, optLabel, label) {
  try { const el = root.locator(`select[name="${name}"]`).first(); if (!(await el.count())) return; await el.selectOption({ label: optLabel }, { timeout: 3500 }); filled.push(label); } catch {}
}
async function radioByValue(root, name, value, label) {
  try { const el = root.locator(`input[name="${name}"][value="${value}"]`).first(); if (!(await el.count())) return; await el.check({ timeout: 3000 }); filled.push(label); } catch {}
}

// JazzHR (applytojob.com) — full resumator-* field map.
async function fillJazzHR(root) {
  await fillByName(root, 'resumator-firstname-value', P.first, 'firstName');
  await fillByName(root, 'resumator-lastname-value', P.last, 'lastName');
  await fillByName(root, 'resumator-email-value', P.email, 'email');
  await fillByName(root, 'resumator-phone-value', P.phone, 'phone');
  await fillByName(root, 'resumator-address-value', P.address, 'address');
  await fillByName(root, 'resumator-city-value', P.city, 'city');
  await fillByName(root, 'resumator-state-value', P.state, 'state');
  await fillByName(root, 'resumator-postal-value', P.postal, 'postal');
  await fillByName(root, 'resumator-languages-value', P.languages, 'languages');
  await fillByName(root, 'resumator-salary-value', P.salary, 'salary');
  await selByName(root, 'resumator-education-value', P.education, `education=${P.education} [FLAG]`);
  await selByName(root, 'resumator-eeo_gender-value', P.gender, 'gender=Male');
  await selByName(root, 'resumator-eeo_race-value', P.ethnicity, 'ethnicity=Hispanic or Latino');
  await radioByValue(root, 'resumator-eeoc_veteran-value', '2', 'veteran=No');       // value 2 = "I am not a protected veteran"
  await radioByValue(root, 'resumator-eeoc_disability-value', '2', 'disability=No');  // value 2 = "No, I do not have a disability"
  if (cvPath) { try { await root.locator('input[type=file][name="resumator-resume-value"], input[type=file]').first().setInputFiles(cvPath, { timeout: 4000 }); filled.push('CV attached'); } catch {} }
}

// Generic ATS / Greenhouse / Ashby safe fields (when not JazzHR).
async function fillGeneric(root) {
  const tb = (re) => root.getByRole('textbox', { name: re }).first();
  const tryFill = async (re, val, label) => { try { const el = tb(re); if (await el.count()) { const cur = await el.inputValue().catch(() => ''); if (!cur) { await el.fill(val, { timeout: 3000 }); filled.push(label); } } } catch {} };
  await tryFill(/first name|nombre/i, P.first, 'firstName');
  await tryFill(/last name|apellido/i, P.last, 'lastName');
  await tryFill(/email|correo/i, P.email, 'email');
  await tryFill(/phone|teléfono|móvil/i, P.phone, 'phone');
  await tryFill(/city|ciudad/i, P.city, 'city');
  await tryFill(/street|address|direcci[oó]n|calle/i, P.address, 'street');
  await tryFill(/zip|postal/i, P.postal, 'postal');
  await tryFill(/state|province|provincia|departamento|estado/i, P.state, 'state');
  await tryFill(/country|pa[ií]s/i, P.country, 'country');
  await tryFill(/skill ?set|skills|tecnolog[ií]as/i, P.skills, 'skillset');
  await tryFill(/linkedin/i, P.linkedin, 'linkedin');
  await tryFill(/github/i, P.github, 'github');
  if (cvPath) { try { await root.locator('input[type=file]').first().setInputFiles(cvPath, { timeout: 4000 }); filled.push('CV attached'); } catch {} }
}

let screeningLeft = false;
if (easyApply) {
  // Step through the Easy Apply modal. Fill safe fields + resume; STOP at Submit
  // (his) AND at any screening question (his — eligibility/legal). Never loops.
  await page.waitForTimeout(2500); // let the modal render after the Easy Apply click
  // PAGE-LEVEL advance: the modal uses hashed class names, so drive the NAMED buttons directly.
  // Fill via the SMART bilingual engine (apply-fields.fillForm: skill_years, EN/ES, collects
  // unknowns), click Next/Review until "Submit application", then STOP (GARY never clicks Submit).
  const allUnknown = [];
  let reviewStuck = 0;
  for (let step = 0; step < 12; step++) {
    const submit = page.getByRole('button', { name: /Submit application|Enviar solicitud/i }).first();
    if ((await submit.count()) && await submit.isVisible().catch(() => false)) {
      // LinkedIn Easy Apply: with --submit (explicit per-offer authorization) the bot sends it;
      // otherwise park here for the user's manual click. Captcha is never solved either way.
      if (doSubmit) {
        await submit.scrollIntoViewIfNeeded().catch(() => {});
        await submit.click({ timeout: 5000 }).catch(() => {});
        log(`SUBMITTED (step ${step}) — --submit (user-authorized).`);
      } else {
        log(`Reached Submit (step ${step}) — STOPPING (yours to send).`);
      }
      break;
    }
    // The Easy Apply form lives on the full /apply/ PAGE (not a modal/[role=dialog]); the only
    // [role=dialog] present is the search box. So fill at PAGE level — getByRole finds the real fields.
    const root = page;
    await fillGeneric(root);                                   // hardcoded contact/EEO basics (Street/Zip/City/State/Country/LinkedIn/SkillSet)
    try { const r = await fillForm(root, page); if (r?.filled?.length) filled.push(...r.filled); if (r?.unknown?.length) allUnknown.push(...r.unknown); } catch {} // smart bilingual + collect unknowns
    if (cvPath) { try { await root.locator('input[type=file]').first().setInputFiles(cvPath, { timeout: 3000 }); filled.push('CV attached'); } catch {} }
    const next = page.getByRole('button', { name: /^Next$|Siguiente|^Review|Revisar|^Continue$/i }).first();
    const hasNext = (await next.count()) && await next.isVisible().catch(() => false);
    if (!hasNext) { log(`No Next/Submit at step ${step} — STOPPING.`); break; }
    const nextLabel = (await next.innerText().catch(() => 'Next')).trim();
    log(`Step ${step}: clicking "${nextLabel}"`);
    await next.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1800);
    // Anti-loop: "Review"/"Revisar" should reach Submit in ONE click. Clicking it 2+ times without
    // a Submit means a required field on this page is unfilled → stuck (don't loop to the cap).
    reviewStuck = /review|revisar/i.test(nextLabel) ? reviewStuck + 1 : 0;
    // STUCK = a REQUIRED field on THIS page is unanswered → LinkedIn shows a "required" message and
    // does NOT advance. (Repeated "Next" across pages is fine; repeated "Review" is not.)
    const reqErr = await page.getByText(/this field is required|campo (es )?obligatorio|please (enter|make a selection)|haz una selección|selecciona una/i).first().count().catch(() => 0);
    const alertErr = await page.locator('.artdeco-inline-feedback--error, .fb-dash-form-element__error-text').first().count().catch(() => 0);
    if (reqErr || alertErr || reviewStuck >= 2) {
      screeningLeft = true;
      try { const r2 = await fillForm(page, page); if (r2?.unknown?.length) allUnknown.push(...r2.unknown); } catch {}
      // AUTO-SURFACE the unanswered questions (the bot asks the user what it doesn't know — 0 LLM tokens).
      const qs = await page.evaluate(() => {
        const set = new Set();
        for (const el of document.querySelectorAll('label,legend,span,p,div')) {
          const t = (el.childElementCount === 0 ? el.innerText : '')?.replace(/\s+/g, ' ').trim();
          if (t && t.includes('?') && t.length < 160 && !/^(questions|looking for talent|interested in working)/i.test(t)) set.add(t);
        }
        return [...set].slice(0, 12);
      }).catch(() => []);
      // Language gate: we ONLY support ES/EN. If the questions look like another language (PT/FR…), skip the offer.
      const nonEsEn = qs.some(q => /\b(voc[eê]|quantos|experi[êe]ncia|vaga|reais|possui|trabalhou|disponibilidade|flu[êe]ncia|n[íi]vel de proefici|salário)\b/i.test(q));
      if (nonEsEn) log('⚠️  IDIOMA NO ES/EN (parece portugués/otro) — NO soportado. DESCARTA esta oferta (márcala skip).');
      log(`Step ${step}: REQUIRED question(s) unanswered — STOPPING. ANSWER THESE → I learn() → --resume:`);
      qs.forEach((q, i) => log(`   Q${i + 1}. ${q}`));
      log('(modal abierto; sin enviar.)');
      break;
    }
  }
  if (allUnknown.length) { try { recordUnknowns('LinkedIn Easy Apply', '', url, allUnknown); } catch {} log(`${allUnknown.length} NEW/unknown field(s) → output/apply-pending-fields.json (supervisor resolves via RAG/ask → learn() → --resume).`); }
} else {
  await workPage.waitForTimeout(1500);
  if (workPage.url().includes('applytojob.com')) await fillJazzHR(workPage);
  else await fillGeneric(workPage);
}

console.log('\n=== Filled: ' + (filled.length ? [...new Set(filled)].join(', ') : 'nothing matched automatically') + ' ===');
console.log('Left to you: captcha (g-recaptcha)' + (screeningLeft ? ', SCREENING questions' : '') + ', any unmatched/required field, and the final Submit.');
winAlert('Postulación lista para revisar',
  'Llené lo que pude en el Chrome de automatización (datos básicos + EEO' + (cvPath ? ' + CV' : '') + ').' +
  (screeningLeft ? ' Hay preguntas de screening que debes responder TÚ.' : '') +
  ' Resuelve el captcha si aplica y dale Submit TÚ. NO he enviado nada.');
await browser.close(); // detaches CDP only; the debug Chrome session stays open
