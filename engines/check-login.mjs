// GARY — lightweight login check (0 tokens). Attaches to the ALREADY-OPEN tab in the debug browser
// (the one "Conectar" opened) and reads its DOM for a sign-in-wall heuristic — NO re-navigation. It waits
// for the page to load and POLLS the heuristic for a few seconds, so a tab still loading when the user
// just pressed "Verificar" isn't judged prematurely (that made it bounce back to "pending"). Gentle on the
// system (no networkidle, one attach). Usage: node engines/check-login.mjs "<url-or-host>".
import { chromium } from 'playwright';

const target = process.argv[2];
if (!target) { console.error('usage: node engines/check-login.mjs <url>'); process.exit(1); }

const hostOf = (u) => { try { return new URL(u.startsWith('http') ? u : 'https://' + u).host; } catch { return u; } };
// Registrable domain: co.indeed.com / www.indeed.com → indeed.com. So a regional tab (Indeed CO) still
// matches the connection's www.indeed.com — Indeed auth is shared across regional domains (secure.indeed.com).
const baseDomain = (h) => h.split('.').slice(-2).join('.');
const host = hostOf(target);
const targetBase = baseDomain(host);

let browser;
try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); }
catch { console.log('logged in: NO (cdp down)'); process.exit(0); }

const ctx = browser.contexts()[0];
// Prefer the tab already open for this site (matched by registrable domain); no navigation needed.
let page = ctx.pages().find((p) => {
  try { return baseDomain(new URL(p.url()).host) === targetBase; } catch { return false; }
});
// Fallback: open a light tab (domcontentloaded only — no networkidle) if none is open.
if (!page) {
  page = await ctx.newPage();
  try { await page.goto(target.startsWith('http') ? target : 'https://' + host, { waitUntil: 'domcontentloaded', timeout: 20000 }); }
  catch { /* ignore */ }
}

// Let the page finish loading before we judge it (the delay the "Verificar" flow needs).
try { await page.waitForLoadState('load', { timeout: 15000 }); } catch { /* keep going, we still poll */ }

// One DOM read → { blank, wall, inside }. `inside` = account/profile UI (definite logged-in);
// `wall` = a sign-in/register prompt; `blank` = body still empty (mid-load → undecided, keep polling).
const read = () => page.evaluate(() => {
  const txt = document.body ? document.body.innerText : '';
  const wall = /\b(sign in|log in|iniciar sesi[oó]n|create account|reg[ií]strate|registr)/i.test(txt);
  const inside = /sign out|log out|cerrar sesi[oó]n|my profile|mi perfil|dashboard|mi cuenta|account|messages|mensajes|notifications|notificaciones/i.test(txt);
  return { blank: !txt.trim(), wall, inside };
});

// Poll up to ~8s: an account signal ends it early; a page that settles with no wall counts as logged-in;
// a wall/blank that persists past the deadline → not logged in. This absorbs client-side hydration
// (Indeed renders the account menu after JS) and the initial load flash.
let loggedIn = false;
const deadline = Date.now() + 8000;
for (;;) {
  let r = { blank: true, wall: false, inside: false };
  try { r = await read(); } catch { /* transient during navigation */ }
  if (r.inside) { loggedIn = true; break; }            // definite logged-in signal
  if (!r.blank && !r.wall) { loggedIn = true; break; } // settled, no sign-in wall → treat as logged-in
  if (Date.now() > deadline) { loggedIn = false; break; } // still blank/wall after the wait → not logged in
  await page.waitForTimeout(600);
}

console.log('logged in: ' + (loggedIn ? 'likely YES' : 'NO'));
await browser.close(); // detaches CDP only; the tab stays open
