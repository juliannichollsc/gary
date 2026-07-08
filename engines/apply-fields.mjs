// Shared CV-grounded field engine for the apply scripts.
//  - answerFor(label): match a form field's label against apply-fieldmap.json (incl. learned).
//  - fillForm(root): fill every recognized FILL/FLAG field from the map; COLLECT unknown /
//    ASK_USER fields (label + type + options) so the agent can resolve them from cv.md.
//  - recordUnknowns / learn: persist pending unknowns and append agent-resolved answers.
// NEVER fabricates: a field with no CV/profile/given source is left for the user.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

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
export async function fillForm(root, page, ctx = {}) {
  const map = loadMap();
  const unknown = [], filled = [];
  const controls = await root.locator('input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]):not([type=search]), select, textarea').all().catch(() => []);
  const handled = new Set(), radioDone = new Set();
  for (const ctl of controls) {
    const tag = (await ctl.evaluate(n => n.tagName.toLowerCase()).catch(() => '')) || '';
    const type = tag === 'select' ? 'select' : tag === 'textarea' ? 'text' : ((await ctl.getAttribute('type').catch(() => '')) || 'text').toLowerCase();
    // Derive the question text: aria-label → <label for=id> → nearest ancestor line with "?" → fieldset legend.
    let q = (await ctl.getAttribute('aria-label').catch(() => '')) || '';
    if (!q) { const id = await ctl.getAttribute('id').catch(() => ''); if (id) q = await page.locator(`label[for="${id}"]`).first().innerText().catch(() => ''); }
    if (!q) q = await ctl.evaluate(node => {
      let p = node;
      for (let i = 0; i < 6 && p; i++) { p = p.parentElement; if (!p) break; const ln = (p.innerText || '').split('\n').map(s => s.trim()).find(s => s.includes('?')); if (ln) return ln; }
      const fs = node.closest('fieldset'); return (fs && fs.querySelector('legend')) ? fs.querySelector('legend').innerText : '';
    }).catch(() => '');
    q = (q || '').replace(/\s+/g, ' ').replace(/Invalid input|\d+\s*\/\s*\d+|\d+ of \d+ characters?/gi, ' ').replace(/\*+/g, '').trim().slice(0, 120);
    if (!q || /^(yes|no|s[ií]|select an option|selecciona|pdf)$/i.test(q)) continue;  // skip option-labels / noise
    if ((type === 'radio' ? radioDone : handled).has(q)) continue;
    (type === 'radio' ? radioDone : handled).add(q);
    const ans = answerFor(q, map);
    if (!ans || ans.policy === 'ASK_USER' || ans.value == null) {
      const cur = type === 'radio' ? '' : (await ctl.inputValue().catch(() => 'x'));
      if (!cur) unknown.push({ label: q, policy: ans ? 'ASK_USER' : 'UNKNOWN' });  // only flag if still empty
      continue;
    }
    try {
      if (type === 'radio') {
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
        await ctl.selectOption({ label: new RegExp(escapeRe(String(ans.value).split(' ')[0]), 'i') }).catch(async () => { await ctl.selectOption({ label: String(ans.value) }).catch(() => {}); });
        filled.push(`${q}=${ans.value} (select)`);
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
