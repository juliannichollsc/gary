// Activates Playwright to LEARN the application forms of given offers.
// Opens each URL in a visible Chromium, extracts the real form fields
// (selector, label, type, name, required), and saves a "form map" JSON
// that the apply-agent can later use to auto-fill (stopping at captcha + submit).
//
// Usage: node engines/learn-forms.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const OFFERS = [
  { name: 'praxent', ats: 'greenhouse',  url: 'https://job-boards.greenhouse.io/praxent/jobs/7732220003' },
  { name: 'bc-tecnologia', ats: 'getonbrd', url: 'https://www.getonbrd.com/jobs/programming/senior-full-stack-nestjs-react-latam-bc-tecnologia-remote' },
];

const outDir = 'output/apply-recordings';
mkdirSync(outDir, { recursive: true });

async function extractFields(page) {
  return page.evaluate(() => {
    const labelFor = (el) => {
      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) return l.innerText.trim().replace(/\s+/g, ' ');
      }
      const wrap = el.closest('label');
      if (wrap) return wrap.innerText.trim().replace(/\s+/g, ' ');
      return el.getAttribute('aria-label') || el.placeholder || '';
    };
    const fields = [];
    document.querySelectorAll('input, select, textarea').forEach((el) => {
      const type = (el.getAttribute('type') || el.tagName).toLowerCase();
      if (['hidden', 'submit', 'button'].includes(type)) return;
      fields.push({
        tag: el.tagName.toLowerCase(),
        type,
        name: el.getAttribute('name') || '',
        id: el.id || '',
        required: el.required || el.getAttribute('aria-required') === 'true',
        label: labelFor(el).slice(0, 120),
      });
    });
    const buttons = [...document.querySelectorAll('button, a[href], input[type=submit]')]
      .map((b) => (b.innerText || b.value || '').trim().replace(/\s+/g, ' '))
      .filter((t) => /apply|submit|postul|aplicar|enviar|sign in|log in|continue/i.test(t))
      .slice(0, 12);
    return { fields, buttons, title: document.title };
  });
}

const browser = await chromium.launch({ headless: false });
const results = [];
for (const offer of OFFERS) {
  const page = await browser.newPage();
  const rec = { ...offer, ok: false };
  try {
    await page.goto(offer.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000); // let client-side forms render
    const data = await extractFields(page);
    Object.assign(rec, data, { ok: true });
    console.log(`\n=== ${offer.name} (${offer.ats}) ===`);
    console.log(`title: ${data.title}`);
    console.log(`fields: ${data.fields.length}`);
    data.fields.forEach((f) => console.log(`  - [${f.required ? 'REQ' : 'opt'}] ${f.type} name="${f.name}" :: ${f.label}`));
    console.log(`apply/auth buttons: ${data.buttons.join(' | ')}`);
  } catch (e) {
    rec.error = String(e).split('\n')[0];
    console.log(`\n=== ${offer.name} === ERROR: ${rec.error}`);
  }
  results.push(rec);
  await page.close();
}
await browser.close();

writeFileSync(`${outDir}/form-maps.json`, JSON.stringify(results, null, 2));
console.log(`\nSaved form maps -> ${outDir}/form-maps.json`);
