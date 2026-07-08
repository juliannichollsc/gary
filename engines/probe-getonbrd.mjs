// Probes the GetOnBoard apply form (after clicking "Postular") to learn its fields.
// Usage: node engines/probe-getonbrd.mjs
import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
let page = null;
for (const ctx of b.contexts()) for (const p of ctx.pages()) if (p.url().includes('getonbrd')) { page = p; break; }
if (!page) { console.log('No getonbrd tab open.'); await b.close(); process.exit(0); }
console.log('Tab:', page.url());

const tryClick = async (re) => { try { await page.getByText(re).first().click({ timeout: 5000 }); return true; } catch { return false; } };
console.log('Clicking Postular/Apply...');
const c = await tryClick(/^Postular$|^Postúlate$|^Apply now$|^Apply$|Postular a/i);
console.log('clicked:', c);
await page.waitForTimeout(3500);

const data = await page.evaluate(() => {
  const lab = (el) => { if (el.id){const l=document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if(l) return l.innerText.trim().replace(/\s+/g,' ');} const w=el.closest('label'); if(w) return w.innerText.trim().replace(/\s+/g,' '); return el.getAttribute('aria-label')||el.placeholder||el.name||''; };
  const fields=[];
  document.querySelectorAll('input,textarea,select').forEach(el=>{const t=(el.type||el.tagName).toLowerCase(); if(['hidden','submit','button'].includes(t))return; fields.push({tag:el.tagName.toLowerCase(),type:t,name:el.name||'',id:el.id||'',required:el.required,label:lab(el).slice(0,90)});});
  const btns=[...document.querySelectorAll('button,a[href],input[type=submit]')].map(x=>(x.innerText||x.value||'').trim().replace(/\s+/g,' ')).filter(t=>t&&t.length<40&&/postul|apply|enviar|submit|send|adjunt|attach|cv|curr/i.test(t)).slice(0,15);
  return {fields,btns,title:document.title,url:location.href};
});
console.log('URL after click:', data.url);
console.log('Fields:', data.fields.length);
data.fields.forEach(f=>console.log(`  [${f.required?'REQ':'opt'}] ${f.tag}/${f.type} name="${f.name}" :: ${f.label}`));
console.log('Buttons:', data.btns.join(' | '));
await b.close();
