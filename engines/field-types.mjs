// ============================================================================
// field-types.mjs — the FIELD CONTRACT for application forms (owner order 2026-11-10: never type a value of the
// wrong kind into a field). Before filling, read what the field accepts (fieldSpec); make the answer fit it or
// REFUSE it (coerce → { ok:false, why } becomes a pending question, never garbage typed); after filling, confirm
// the form accepted it (validAfter). Used by indeed-apply.mjs; other apply engines adopt it with their own
// regression test (connections skill §1 — it is a shared module once a second engine imports it).
// ============================================================================

// Read the contract of ONE control (input/select/textarea or a radio/checkbox group).
export async function fieldSpec(ctl) {
  return ctl.first().evaluate((n) => {
    const tag = n.tagName.toLowerCase();
    const type = tag === 'input' ? (n.type || 'text') : tag;
    const lab = (el) => (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText?.trim()) || el.closest('label')?.innerText?.trim() || el.value;
    let options = [];
    if (tag === 'select') options = [...n.options].map((o) => o.text.trim()).filter((t) => t && !/^(select|selecciona|elige|choose)/i.test(t));
    if (type === 'radio' || type === 'checkbox') options = [...document.querySelectorAll(`input[name="${CSS.escape(n.name)}"]`)].map(lab).filter(Boolean);
    const num = (v) => (v === '' || v == null ? null : Number(v));
    return {
      type, inputmode: n.getAttribute('inputmode') || '', required: n.required || n.getAttribute('aria-required') === 'true',
      min: num(n.getAttribute('min')), max: num(n.getAttribute('max')), step: n.getAttribute('step') || '',
      maxlength: n.maxLength > 0 ? n.maxLength : null, pattern: n.getAttribute('pattern') || '',
      placeholder: n.getAttribute('placeholder') || '', options,
    };
  });
}

const squash = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const norm = (t) => squash(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Make `value` fit `spec`, or refuse with the reason (the LM then re-answers in the right shape / asks the user).
export function coerce(spec, value) {
  const v = squash(value);
  if (!v) return { ok: false, why: 'empty answer' };
  const t = spec.type;
  if (spec.options && spec.options.length && ['select', 'radio', 'checkbox'].includes(t)) {
    const exact = spec.options.find((o) => norm(o) === norm(v));
    if (exact) return { ok: true, value: exact };
    // compare WITHOUT accents: "í" breaks \b in JS regexes ("Sí" never matched /^sí\b/)
    const yes = /^(yes|si)\b/.test(norm(v)), no = /^no\b/.test(norm(v));
    if (yes || no) { const o = spec.options.find((x) => (yes ? /^(yes|si)\b/ : /^no\b/).test(norm(x))); if (o) return { ok: true, value: o }; }
    const starts = spec.options.filter((o) => norm(o).startsWith(norm(v)) || norm(v).startsWith(norm(o)));
    if (starts.length === 1) return { ok: true, value: starts[0] };
    return { ok: false, why: `"${v}" is not one of the options: ${spec.options.join(' | ')}` };
  }
  if (t === 'number' || /^(numeric|decimal)$/.test(spec.inputmode)) {
    const nums = [...v.matchAll(/-?\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));
    const uniq = [...new Set(nums)];
    if (!uniq.length) return { ok: false, why: `needs a NUMBER, got "${v}"` };
    if (uniq.length > 1) return { ok: false, why: `needs ONE number, got "${v}" (${uniq.join(', ')})` };
    const n = uniq[0];
    if (spec.min != null && n < spec.min) return { ok: false, why: `${n} is below the minimum ${spec.min}` };
    if (spec.max != null && n > spec.max) return { ok: false, why: `${n} is above the maximum ${spec.max}` };
    if ((spec.step === '' || spec.step === '1') && t === 'number' && !Number.isInteger(n)) return { ok: false, why: `needs a whole number, got ${n}` };
    return { ok: true, value: String(n) };
  }
  if (t === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { ok: true, value: v } : { ok: false, why: `needs an e-mail, got "${v}"` };
  if (t === 'tel') { const d = v.replace(/(?!^\+)[^\d]/g, ''); return d.replace('+', '').length >= 7 && d.length <= 16 ? { ok: true, value: d } : { ok: false, why: `needs a phone number, got "${v}"` }; }
  if (t === 'url') {
    const u = /^https?:\/\//i.test(v) ? v : (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v) ? `https://${v}` : '');
    return u ? { ok: true, value: u } : { ok: false, why: `needs a URL, got "${v}"` };
  }
  if (t === 'date') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: true, value: v };
    const d = new Date(v); return isNaN(d) ? { ok: false, why: `needs a date (YYYY-MM-DD), got "${v}"` } : { ok: true, value: d.toISOString().slice(0, 10) };
  }
  // free text (text / textarea / search): keep it, but within the field's length and pattern — never silently cut.
  const text = t === 'textarea' ? String(value).trim() : v;
  if (spec.maxlength && text.length > spec.maxlength) return { ok: false, why: `too long: ${text.length}/${spec.maxlength} characters — shorten it` };
  if (spec.pattern) { try { if (!new RegExp(`^(?:${spec.pattern})$`).test(text)) return { ok: false, why: `doesn't match the field format (${spec.placeholder || spec.pattern})` }; } catch {} }
  return { ok: true, value: text };
}

// After filling: did the FORM accept it? (HTML validity, aria-invalid, an inline error next to the field)
export async function validAfter(ctl) {
  return ctl.first().evaluate((n) => {
    if (n.checkValidity && !n.checkValidity()) return { ok: false, why: n.validationMessage || 'invalid' };
    if (n.getAttribute('aria-invalid') === 'true') {
      const id = n.getAttribute('aria-describedby'); const msg = id && document.getElementById(id)?.innerText;
      return { ok: false, why: (msg || 'marked invalid by the form').trim().slice(0, 120) };
    }
    return { ok: true };
  }).catch(() => ({ ok: true }));
}

// Plain-language summary of the contract, for the pending file the LM answers from.
export const describeSpec = (s) => [
  s.type, s.inputmode && `inputmode=${s.inputmode}`, s.min != null && `min ${s.min}`, s.max != null && `max ${s.max}`,
  s.maxlength && `≤${s.maxlength} chars`, s.pattern && `pattern ${s.pattern}`, s.placeholder && `e.g. "${s.placeholder}"`,
  s.options?.length && `options: ${s.options.join(' | ')}`,
].filter(Boolean).join(' · ');
