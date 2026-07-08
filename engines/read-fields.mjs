// Connects to the debug Chrome (:9333, CDP) and reads the CURRENT values of the
// application form on a given page — to LEARN what you filled (esp. the
// screening/legal answers left to you). Usage: node engines/read-fields.mjs [urlSubstring]
import { chromium } from 'playwright';
const match = process.argv[2] || 'greenhouse';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
let target = null;
for (const ctx of browser.contexts()) {
  for (const p of ctx.pages()) {
    if (p.url().includes(match)) { target = p; break; }
  }
  if (target) break;
}
if (!target) { console.log(`No open tab matching "${match}".`); await browser.close(); process.exit(0); }

console.log(`Reading form on: ${target.url()}\n`);
const data = await target.evaluate(() => {
  const labelFor = (el) => {
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return l.innerText.trim().replace(/\s+/g, ' '); }
    const w = el.closest('label'); if (w) return w.innerText.trim().replace(/\s+/g, ' ');
    return el.getAttribute('aria-label') || el.placeholder || el.name || '';
  };
  const out = [];
  document.querySelectorAll('input, textarea').forEach((el) => {
    const t = (el.type || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'file'].includes(t)) return;
    if (el.value && el.value.trim()) out.push({ label: labelFor(el).slice(0, 80), value: el.value.trim().slice(0, 120) });
  });
  // react-select / custom dropdowns: read the displayed single value
  document.querySelectorAll('.select__single-value, [class*="singleValue"]').forEach((el) => {
    const box = el.closest('[class*="select"]');
    const lbl = box ? (box.closest('div')?.previousElementSibling?.innerText || '') : '';
    out.push({ label: (lbl || 'dropdown').trim().slice(0, 80), value: el.innerText.trim().slice(0, 80) });
  });
  return out;
});
data.forEach((f) => console.log(`  ${f.label}  =  ${f.value}`));
console.log(`\n${data.length} filled fields read.`);
await browser.close();
