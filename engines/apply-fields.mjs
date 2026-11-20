// Shared CV-grounded field engine for the apply scripts.
//  - answerFor(label): match a form field's label against apply-fieldmap.json (incl. learned).
//  - fillForm(root): fill every recognized FILL/FLAG field from the map; COLLECT unknown /
//    ASK_USER fields (label + type + options) so the agent can resolve them from cv.md.
//  - recordUnknowns / learn: persist pending unknowns and append agent-resolved answers.
// NEVER fabricates: a field with no CV/profile/given source is left for the user.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fieldSpec, coerce, validAfter } from './field-types.mjs';   // field contract — used ONLY in strict mode

// GARY runs engines with CWD = project root (see CLAUDE.md "Known issues"). Resolve paths from there —
// NEVER a hardcoded absolute path (the prototype pointed at the career-ops repo, which corrupted GARY runs).
const ROOT = process.cwd();
// candidate values come from config/apply-fieldmap.json + config/profile.yml — never hardcode PII
const MAP_PATH = `${ROOT}/config/apply-fieldmap.json`;          // persistent learned answer map = candidate DATA (alongside profile.yml)
const PENDING_PATH = `${ROOT}/output/apply-pending-fields.json`; // transient queue of unknowns = gitignored runtime scratch

export function loadMap() { return JSON.parse(readFileSync(MAP_PATH, 'utf8')); }

// Return the best answer for a field label, or null if unknown.
export function answerFor(label, map = loadMap()) {
  const L = (label || '').toLowerCase().trim();
  if (!L) return null;
  // 1) SKILL questions FIRST (a specific skill must win over the generic "years of experience" field).
  const sy = map.skill_years || {};
  const wantsYears = /\b(years?|años|how long|cu[aá]ntos años)\b/.test(L);  // ES/EN only (other languages are SKIPPED upstream)
  const wantsExp = /(experience|experiencia|proficient|proficiency|familiar|worked with|knowledge of|have you used|do you have|comfortable|skilled|expertise|dominio|manejas)/.test(L);
  // Config rule (2026-06-24): a NUMERIC field asking about MULTIPLE specific databases → SUM their YOE.
  if (wantsYears) {
    const dbNames = ['postgresql', 'postgres', 'mysql', 'sql server', 'mongodb', 'oracle', 'sqlite'];
    const dbs = dbNames.filter(d => sy[d] != null && new RegExp('(?:^|[^a-z])' + escapeRe(d) + '(?:[^a-z]|$)', 'i').test(L));
    if (dbs.length >= 2) {
      const sum = dbs.reduce((a, d) => a + (sy[d] || 0), 0);
      return { match: dbs, value: String(sum), policy: 'FILL', source: 'cv.md DB skill_years (summed per the config rule)', note: `sum of YOE across ${dbs.join(', ')}` };
    }
  }
  if (wantsYears || wantsExp) {
    const skills = Object.keys(sy).filter(k => k !== '_note').sort((a, b) => b.length - a.length); // longest first (avoid 'go' hitting 'django')
    for (const sk of skills) {
      const re = new RegExp('(?:^|[^a-z0-9])' + escapeRe(sk) + '(?:[^a-z0-9]|$)', 'i');
      if (re.test(L)) {
        const yrs = sy[sk];
        if (wantsYears) return { match: [sk], value: String(yrs), policy: yrs > 0 ? 'FILL' : 'FLAG', source: 'cv.md skill_years', note: 'derived YOE — never inflate' };
        return { match: [sk], value: yrs > 0 ? 'Yes' : 'No', policy: 'FILL', source: 'cv.md skill_years' };
      }
    }
  }
  // 2) Then the standard fields (learned first), for non-skill questions.
  const all = [...(map.learned || []), ...map.fields];
  for (const f of all) {
    for (const m of f.match) { if (L.includes(m.toLowerCase())) return f; }
  }
  return null;
}

// Fill a form/modal from the map. CONTROL-FIRST + CLASS-AGNOSTIC: LinkedIn now uses hashed class
// names, so we do NOT depend on .fb-dash-form-element. For each control we derive its QUESTION from
// aria-label / <label for> / nearest ancestor line containing "?". Returns UNKNOWN fields to collect.
// ctx (OPT-IN — omitted = the previous behavior, unchanged for every other consumer):
//   ctx.map    — a per-run answer map resolved from the user's NotebookLM RAG (instead of the {{PLACEHOLDER}} template)
//   ctx.strict — for unattended sends (LinkedIn `--submit`): never type a value that still holds a {{TOKEN}}, never
//                fall back to a blind radio index, and check a select really took the value; anything that can't be
//                answered exactly is reported UNKNOWN (→ pause + ask) instead of guessed. Also (2026-11-18, owner order):
//                a control or question a PERSON can't see is a honeypot / AI trap → never filled (why AI_TRAP_HIDDEN);
//                a question addressed to an AI or asking to prove you're human → never auto-answered (why HUMAN_CHECK)
//                so the run pauses and the USER answers it — human verification is always the user's, like a captcha.
export async function fillForm(root, page, ctx = {}) {
  const map = ctx.map || loadMap();
  const strict = ctx.strict === true;
  const unknown = [], filled = [];
  const controls = await root.locator('input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]):not([type=search]), select, textarea').all().catch(() => []);
  const handled = new Set(), radioDone = new Set();
  for (const ctl of controls) {
    const tag = (await ctl.evaluate(n => n.tagName.toLowerCase()).catch(() => '')) || '';
    const type = tag === 'select' ? 'select' : tag === 'textarea' ? 'text' : ((await ctl.getAttribute('type').catch(() => '')) || 'text').toLowerCase();
    // Derive the question text: aria-label → <label for=id> → nearest ancestor line with "?" → fieldset legend.
    let q = (await ctl.getAttribute('aria-label', { timeout: 2000 }).catch(() => '')) || '';
    // strict: a radio's own <label> is the OPTION ("Yes"/"No"); the QUESTION is its group's <legend>.
    if (strict && type === 'radio') q = (await ctl.evaluate((n) => n.closest('fieldset')?.querySelector('legend')?.innerText || '', null, { timeout: 2000 }).catch(() => '')) || q;
    if (!q) { const id = await ctl.getAttribute('id').catch(() => ''); if (id) q = await page.locator(`label[for="${id}"]`).first().innerText().catch(() => ''); }
    if (!q) q = await ctl.evaluate(node => {
      let p = node;
      for (let i = 0; i < 6 && p; i++) { p = p.parentElement; if (!p) break; const ln = (p.innerText || '').split('\n').map(s => s.trim()).find(s => s.includes('?')); if (ln) return ln; }
      const fs = node.closest('fieldset'); return (fs && fs.querySelector('legend')) ? fs.querySelector('legend').innerText : '';
    }).catch(() => '');
    q = (q || '').replace(/\s+/g, ' ').replace(/Invalid input|\d+\s*\/\s*\d+|\d+ of \d+ characters?/gi, ' ').replace(/\*+/g, '').trim().slice(0, 120);
    if (!q || /^(yes|no|s[ií]|select an option|selecciona|pdf)$/i.test(q)) continue;  // skip option-labels / noise
    // strict: classify BEFORE the de-dupe — a hidden honeypot often duplicates a real field's label ("First name").
    if (strict) {
      const hidden = await ctl.evaluate(hiddenFromPerson, null, { timeout: 2000 }).catch(() => false);
      if (hidden) { unknown.push({ label: q, policy: 'UNKNOWN', why: 'AI_TRAP_HIDDEN' }); continue; }
      const ph = (await ctl.getAttribute('placeholder', { timeout: 2000 }).catch(() => '')) || '';
      if (HUMAN_CHECK_RE.test(`${q} ${ph}`)) { unknown.push({ label: q, policy: 'UNKNOWN', why: 'HUMAN_CHECK' }); continue; }
    }
    if ((type === 'radio' ? radioDone : handled).has(q)) continue;
    (type === 'radio' ? radioDone : handled).add(q);
    // strict: an EXPLICIT per-run answer (map.learned — the user's own / RAG answers) wins over the generic
    // heuristics (skill_years, template fields): "5+ years … React, JavaScript?" must take the user's Yes, not the
    // JavaScript YOE "7"; "deployed … mobile applications?" must not hit the phone field's "mobile".
    const own = strict ? (map.learned || []).find((f) => f.value != null && f.match.some((m) => new RegExp('(?:^|[^a-z0-9áéíóúñ])' + escapeRe(m.toLowerCase()) + '(?:[^a-z0-9áéíóúñ]|$)', 'i').test(q.toLowerCase()))) : null;
    const ans = own || answerFor(q, map);
    let unresolved = strict && ans && /\{\{/.test(String(ans.value));
    if (strict && ans && !unresolved && !own) unresolved = !strictMatchOk(q, ans);   // the user's explicit answer is not second-guessed
    if (!ans || ans.policy === 'ASK_USER' || ans.value == null || unresolved) {
      const cur = type === 'radio' ? '' : (await ctl.inputValue().catch(() => 'x'));
      if (!cur) unknown.push({ label: q, policy: ans ? 'ASK_USER' : 'UNKNOWN' });  // only flag if still empty
      continue;
    }
    try {
      if (type === 'radio' && strict) {
        // strict: pick the option whose <label for> (or wrapper) text matches the answer — bounded waits, no index fallback.
        const yes = /^(yes|s[ií])/i.test(String(ans.value).trim());
        const yesNo = /^(yes|s[ií]|no)(?![a-z])/i.test(String(ans.value).trim());
        // (?![a-z]) instead of \b: JS \b fails after an accented letter, so "Sí" never matched /s[ií]\b/.
        const wantRe = !yesNo ? new RegExp('^' + escapeRe(String(ans.value).trim()), 'i') : (yes ? /^(yes|s[ií])(?![a-z])/i : /^no(?![a-z])/i);
        const name = await ctl.getAttribute('name', { timeout: 2000 }).catch(() => '');
        const opts = await ctl.evaluate((n, nm) => {
          const grp = nm ? [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(nm)}"]`)] : [...(n.closest('fieldset') || n.parentElement).querySelectorAll('input[type=radio]')];
          // Option text: <label for> → [role=radio]/label wrapper → (2026-11 LinkedIn: the <label> is EMPTY and "Yes"/"No"
          // sits in a sibling) the nearest ancestor that holds ONLY this radio and has short text.
          const own = (r) => {
            const lf = r.id && document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.innerText?.trim();
            if (lf) return lf;
            const w = r.closest('[role=radio],label')?.innerText?.trim(); if (w) return w;
            let el = r.parentElement;
            for (let i = 0; i < 4 && el; i++, el = el.parentElement) {
              if (el.querySelectorAll('input[type=radio]').length > 1) break;
              const t = (el.innerText || '').trim(); if (t && t.length <= 60) return t;
            }
            return r.value && r.value !== 'on' ? r.value : '';
          };
          return grp.map((r) => ({ id: r.id, text: own(r).replace(/\s+/g, ' ').trim() }));
        }, name, { timeout: 2000 }).catch(() => []);
        const hit = opts.find((o) => wantRe.test(o.text));
        if (!hit || !hit.id) { unknown.push({ label: q, policy: 'UNKNOWN', why: `no option matches "${ans.value}"` }); continue; }
        await page.locator(`label[for="${hit.id}"]`).first().click({ timeout: 2500 }).catch(async () => { await page.locator(`[id="${hit.id}"]`).check({ force: true, timeout: 2500 }).catch(() => {}); });
        // Verify on the GROUP after React re-renders (the clicked node may be replaced): the checked option must be ours.
        await page.waitForTimeout(400);
        const ok = await ctl.evaluate((n, [nm, ix]) => {
          const grp = nm ? [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(nm)}"]`)] : [...(n.closest('fieldset') || n.parentElement).querySelectorAll('input[type=radio]')];
          return grp.findIndex((r) => r.checked) === ix;
        }, [name, opts.indexOf(hit)], { timeout: 2000 }).catch(() => false);
        if (!ok) { unknown.push({ label: q, policy: 'UNKNOWN', why: `could not tick "${hit.text}"` }); continue; }
        filled.push(`${q}=${hit.text} (radio)`);
      } else if (type === 'radio') {
        // CUSTOM radios: each <input type=radio> is nested INSIDE its own [role=radio] wrapper (text
        // Yes/No), and each question has a DISTINCT name-group. Scope to THIS question's name-group,
        // find the option whose [role=radio] text matches Yes/No, and click that wrapper.
        const yes = /^(yes|s[ií])/i.test(String(ans.value).trim());
        const wantRe = yes ? /^(yes|s[ií])/i : /^no/i;
        const name = await ctl.getAttribute('name').catch(() => '');
        const grp = name ? page.locator(`input[type=radio][name="${name}"]`) : ctl.locator('xpath=ancestor::*[.//input[@type="radio"]][1]//input[@type="radio"]');
        const n = await grp.count().catch(() => 0);
        let clicked = false;
        for (let i = 0; i < n; i++) {
          const rr = grp.nth(i).locator('xpath=ancestor-or-self::*[@role="radio"][1]');
          const t = (await rr.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
          if (wantRe.test(t)) { await rr.click({ timeout: 2000 }).catch(() => {}); clicked = true; break; }
        }
        if (!clicked) await grp.nth(yes ? 0 : 1).locator('xpath=ancestor-or-self::*[@role="radio"][1]').click({ force: true, timeout: 2000 }).catch(() => {});
        filled.push(`${q}=${ans.value} (radio)`);
      } else if (type === 'select') {
        await ctl.selectOption({ label: new RegExp(escapeRe(String(ans.value).split(' ')[0]), 'i') }, { timeout: 3000 }).catch(async () => { await ctl.selectOption({ label: String(ans.value) }, { timeout: 3000 }).catch(() => {}); });
        if (strict) {
          const picked = await ctl.evaluate(n => (n.selectedIndex > 0 && n.options[n.selectedIndex]) ? n.options[n.selectedIndex].text : '').catch(() => '');
          if (!picked || /select an option|selecciona/i.test(picked)) { unknown.push({ label: q, policy: 'UNKNOWN', why: `select has no option for "${ans.value}"` }); continue; }
        }
        filled.push(`${q}=${ans.value} (select)`);
      } else if (strict) {
        // strict: honour the FIELD CONTRACT (field-types.mjs) — a numeric question gets ONE number ("2800 USD
        // (negotiable)" → "2800"), a wrong-shape answer becomes a pending question, and the form must accept it.
        // LinkedIn's numeric inputs are type=text with their own validation, so the question text decides too.
        const spec = await fieldSpec(ctl).catch(() => ({ type }));
        const numericQ = /\b(years?|años|how many|cu[aá]nt[oa]s|salary|salario|sueldo|compensation|pay|rate|amount|monto)\b/i.test(q);
        // An explicit answer keeps its own shape ("Less than 1 year: …"); the numeric retry below kicks in only if the
        // form rejects it. Generic answers on a numeric-looking question are coerced to ONE number up front.
        const s2 = (numericQ && !own && ['text', 'search'].includes(spec.type)) ? { ...spec, type: 'number' } : spec;
        const c = coerce(s2, ans.value);
        if (!c.ok) { unknown.push({ label: q, policy: 'UNKNOWN', why: `TYPE_MISMATCH: ${c.why}` }); continue; }
        const cur = await ctl.inputValue({ timeout: 2000 }).catch(() => '');
        if (cur && !numericQ && !own) continue;                           // a prefilled text answer is kept as is (unless the user gave this one)
        if (cur !== c.value) { await ctl.fill(c.value, { timeout: 2500 }); await ctl.evaluate((n) => n.blur(), null, { timeout: 2000 }).catch(() => {}); await page.waitForTimeout(300); }
        // LinkedIn flags a bad value only in the field's help text ("Invalid input"), without aria-invalid → read it too.
        const helpErr = () => ctl.evaluate((n) => (n.getAttribute('aria-describedby') || '').split(/\s+/).map((i) => document.getElementById(i)?.innerText || '').join(' '), null, { timeout: 2000 })
          .then((t) => /invalid input|entrada no v[aá]lida|enter a (valid|whole|decimal) number|introduce un n[uú]mero/i.test(t)).catch(() => false);
        let v = await validAfter(ctl);
        let finalVal = c.value;
        if (v.ok && await helpErr()) v = { ok: false, why: 'the form shows "Invalid input"' };
        // A text answer holding ONE number ("2800 USD") that the form rejects → retry with just the number ("2800").
        if (!v.ok && /\D/.test(c.value)) {
          const n = coerce({ ...spec, type: 'number' }, c.value);
          if (n.ok) {
            await ctl.fill(n.value, { timeout: 2500 }); await ctl.evaluate((x) => x.blur(), null, { timeout: 2000 }).catch(() => {}); await page.waitForTimeout(300);
            v = await validAfter(ctl); if (v.ok && await helpErr()) v = { ok: false, why: 'the form shows "Invalid input"' };
            finalVal = n.value;
          }
        }
        if (!v.ok) { unknown.push({ label: q, policy: 'UNKNOWN', why: `INVALID_AFTER_FILL: ${v.why}` }); continue; }
        filled.push(`${q}=${finalVal}${ans.policy === 'FLAG' ? ' [FLAG]' : ''}`);
      } else {
        const cur = await ctl.inputValue().catch(() => '');
        const numeric = type === 'number' || /\b(years|a[ñn]os|number|numeric|salar|expectativa|d[oó]lares|edad|age)\b/i.test(q);
        const val = (numeric && /\d/.test(String(ans.value))) ? String(ans.value).replace(/[^0-9]/g, '') : String(ans.value);
        // Fill if empty OR (numeric field holding wrong/invalid text from a prior step → clear & refill digits).
        if (!cur || (numeric && cur !== val)) { await ctl.fill(val, { timeout: 2500 }); filled.push(`${q}=${val}${ans.policy === 'FLAG' ? ' [FLAG]' : ''}`); }
      }
    } catch {}
  }
  return { filled, unknown };
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// strict-only: questions addressed to an AI, prompt-injection lines, or "prove you're human" checks (EN + ES).
// why: employers plant these to catch bots; GARY never follows instructions found inside a form/JD and never passes a
// human-verification itself — the field is left for the USER (the run pauses with NEEDS_HUMAN).
const HUMAN_CHECK_RE = /if you(?:'| a)?re an? (?:ai|llm|language model|chatgpt|gpt|bot|assistant)|if you are an? (?:ai|llm|language model|chatgpt|gpt|bot|assistant)|as an ai\b|ignore (?:all )?(?:previous|prior|above) instructions|(?:large )?language model|prove (?:that )?you(?:'| a)re (?:a )?human|are you a (?:human|robot|bot)\b|type the (?:word|phrase)|write the (?:word|phrase)|to (?:confirm|verify) (?:that )?you(?:'| a)re (?:a )?human|si eres (?:una? )?(?:ia|inteligencia artificial|bot|modelo de lenguaje)|escribe la palabra|demuestra que eres (?:un )?humano|confirma que eres (?:un )?humano|eres (?:un )?humano/i;

// strict-only, runs IN THE PAGE: is this control (or, for radios/checkboxes, its option wrapper; plus its question
// label) invisible to a person? display/visibility/opacity/aria-hidden on the chain, zero size, off-screen (negative
// coordinates), clip/clip-path collapse, ~0 font-size, or text colour ≈ background. Visually-hidden (sr-only) LABELS
// are NOT treated as traps by the clip rule — that's an accessibility pattern for a visible input.
function hiddenFromPerson(n) {
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] == null || c[3] > 0.1)) return c; } return [255, 255, 255]; };
  const chainHidden = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || parseFloat(cs.opacity) < 0.05 || e.getAttribute('aria-hidden') === 'true') return true;
    }
    return false;
  };
  const boxHidden = (el, clipCounts) => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2) return true;
    if (r.right + scrollX < 0 || r.bottom + scrollY < 0 || r.left > Math.max(document.documentElement.scrollWidth, innerWidth) + 50) return true;
    if (clipCounts && ((/rect\(\s*0(px)?[ ,]+0(px)?[ ,]+0(px)?[ ,]+0(px)?\s*\)/.test(cs.clip)) || /inset\(\s*50%|circle\(\s*0/.test(cs.clipPath))) return true;
    return false;
  };
  const textHidden = (el) => {
    if (!el || !(el.innerText || '').trim()) return false;
    if (chainHidden(el)) return true;
    const r = el.getBoundingClientRect();
    if (r.right + scrollX < 0 || r.bottom + scrollY < 0) return true;           // pushed off-screen
    if (r.width < 2 || r.height < 2) return false;                              // sr-only (1px) label = accessibility, not a trap
    const cs = getComputedStyle(el);
    if (parseFloat(cs.fontSize) < 2) return true;
    const fg = rgb(cs.color), bg = bgOf(el);
    return fg.length >= 3 && Math.abs(fg[0] - bg[0]) + Math.abs(fg[1] - bg[1]) + Math.abs(fg[2] - bg[2]) < 30;
  };
  const choice = n.type === 'radio' || n.type === 'checkbox';
  // custom radios/checkboxes hide the NATIVE input on purpose → judge the option wrapper (nearest box ≥2px that holds
  // only this input) instead of the input itself.
  let target = n;
  if (choice) {
    target = n.parentElement;
    for (let e = n.parentElement, i = 0; e && i < 4; e = e.parentElement, i++) {
      if (e.querySelectorAll(`input[type="${n.type}"]`).length > 1) break;
      const r = e.getBoundingClientRect(); if (r.width >= 2 && r.height >= 2) { target = e; break; }
    }
  }
  if (!target || chainHidden(target) || boxHidden(target, !choice)) return true;
  // the QUESTION text: a radio's <label for> is its option, so use the group's <legend>
  const qEl = choice ? n.closest('fieldset')?.querySelector('legend') : ((n.id && document.querySelector(`label[for="${CSS.escape(n.id)}"]`)) || n.closest('fieldset')?.querySelector('legend'));
  return textHidden(qEl);
}

// strict-only sanity checks on a standard-field answer (answerFor matches by SUBSTRING, which is fine for a human
// review but not for an unattended send): (1) the matched term must be a WHOLE word/phrase in the question
// ("state" must not answer "personal statement"); (2) a years question about a SPECIFIC tool that isn't in
// skill_years ("years with Docker") must not get the TOTAL years answer → UNKNOWN, the supervisor asks.
function strictMatchOk(label, ans) {
  if (!Array.isArray(ans.match) || /skill_years/.test(ans.source || '')) return true;
  const L = label.toLowerCase();
  const whole = ans.match.some((m) => new RegExp('(?:^|[^a-z0-9áéíóúñ])' + escapeRe(m.toLowerCase()) + '(?:[^a-z0-9áéíóúñ]|$)', 'i').test(L));
  if (!whole) return false;
  const yearsQ = /\b(years?|años)\b/.test(L);
  const aboutTool = /\b(with|using|in|con|en)\s+(?!(total|software|development|desarrollo|the industry|it\b|tech|engineering|programming|programaci))[a-z0-9.#+]/i.test(L);
  if (yearsQ && aboutTool && /\{\{?TOTAL_YOE|^\d+$/.test(String(ans.value)) && !/total|overall|en total/i.test(L)) return false;
  // (3) a SELF-RATING ("How would you rate…? 1 - 10") is the user's call — never a generic value (2026-11-18: the
  // salary field's "rate" put 2800 into a 1–10 Keycloak rating).
  if (/\b(rate|rating|calific\w*|punt[uú]a\w*|escala)\b|\b1\s*(-|–|to|a|al)\s*(5|10)\b/i.test(L)) return false;
  // (4) the TOTAL-years answer only fits a question about total experience — not "years leading technical decisions",
  // "years designing…", "years managing…" (2026-11-18: those got the career total "8").
  if (ans.match.includes('years of experience') && /\b(lead\w*|manag\w*|design\w*|architect\w*|mentor\w*|build\w*|using|with|lider\w*|dise[ñn]\w*|arquitect\w*|gestion\w*|usando)\b/i.test(L)) return false;
  return true;
}

// Persist unknown fields seen during an application (for the agent to resolve from cv.md).
export function recordUnknowns(company, role, url, unknown) {
  if (!unknown?.length) return;
  const pend = existsSync(PENDING_PATH) ? JSON.parse(readFileSync(PENDING_PATH, 'utf8')) : { pending: [] };
  pend.pending.push({ company, role, url, when: ctxDate(), fields: unknown });
  writeFileSync(PENDING_PATH, JSON.stringify(pend, null, 2));
}
function ctxDate() { return '2026-06-24'; }

// Append an agent-resolved field to the map's `learned` list (so future apps fill it).
export function learn(matchTerms, value, source, note) {
  const map = loadMap();
  map.learned = map.learned || [];
  map.learned.push({ match: matchTerms, value, source, policy: source === 'ASK_USER' ? 'ASK_USER' : 'FILL', note: note || 'learned from a prior application' });
  map._updated = ctxDate();
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
}
