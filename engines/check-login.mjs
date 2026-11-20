// GARY — lightweight login check (0 tokens), called by the Conexiones "Verificar sesión" button (Rust check_login).
// Attaches to the tab ALREADY OPEN for the site in the automation Chrome and applies THAT connection's explicit
// rule from engines/connections.mjs (no re-navigation; it polls a few seconds so a tab still loading isn't judged
// prematurely). Prints exactly "logged in: likely YES" | "logged in: NO" (the Rust side greps it).
// NEVER add a per-site tweak here — edit the site's rule in connections.mjs and run engines/check-connections.mjs.
// Usage: node engines/check-login.mjs "<url-or-host>"
import { chromium } from 'playwright';
import { connectionFor, findTab, hostOf, verifyPage } from './connections.mjs';

const target = process.argv[2];
if (!target) { console.error('usage: node engines/check-login.mjs <url>'); process.exit(1); }

let browser;
try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.GARY_BROWSER_PORT || 9333}`); }
catch { console.log('logged in: NO (cdp down)'); process.exit(0); }

const ctx = browser.contexts()[0];
let page = findTab(ctx, target);
// No tab open for the site → open ONE light tab (domcontentloaded only) on the connection's URL.
if (!page) {
  page = await ctx.newPage();
  try { await page.goto(target.startsWith('http') ? target : 'https://' + hostOf(target), { waitUntil: 'domcontentloaded', timeout: 20000 }); }
  catch { /* judged below */ }
}

const r = await verifyPage(page, connectionFor(target));
if (process.env.GARY_DEBUG) console.error(`[check-login] ${hostOf(target)} → ${r.yes ? 'YES' : 'NO'} (${r.how})`);
console.log('logged in: ' + (r.yes ? 'likely YES' : 'NO'));
await browser.close(); // detaches CDP only; the tab stays open
