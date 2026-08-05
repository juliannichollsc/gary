// GARY — NotebookLM session bridge (0 tokens, NO new browser, NO polling). Attaches ONCE to the already-
// running automation browser (:9333 — the SAME browser the job-board connections use, where the user is
// logged in), reads its Google cookies, and — critically — VALIDATES that they actually authenticate
// NotebookLM before handing them to the plugin. Just being logged into Gmail is NOT enough: NotebookLM
// requires the browser to have entered the app (passed Google's account chooser). So this validates like
// the plugin's rpc-client.init() does (fetch notebook.google.com — the Gemini-era host — follow redirects
// re-applying Set-Cookie, confirm it lands on the app `LabsTailwindUi`, and PROBE a real batchexecute RPC
// on the landing origin, because the legacy host serves the HTML but 401s every RPC). Honest by design: it only
// reports "likely YES" when the RPC will actually work, so the UI never shows a false "connected".
// Usage: node engines/notebooklm-session.mjs [cdpPort=9333]
//   → "logged in: likely YES" + "COOKIES: name=val; …" when the session truly authenticates NotebookLM,
//   → "logged in: NO" otherwise (user must open NotebookLM in the automation browser and actually sign in).
import { chromium } from 'playwright';

const REQUIRED = ['SID', '__Secure-1PSID'];
const PORT = process.argv[2] || '9333';
const CDP = `http://127.0.0.1:${PORT}`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const header = (m) => Object.entries(m).filter(([, v]) => Boolean(v)).map(([n, v]) => `${n}=${v}`).join('; ');

// Replays the cookies against NotebookLM exactly like the plugin's RPC init: follow redirects, re-apply
// Set-Cookie each hop (Google refreshes __Secure-1PSIDTS on the way in), and confirm we reach the app.
// NOTE (Gemini migration): NotebookLM now lives on notebook.google.com. The legacy host still serves the
// app HTML through a redirect, so "the page loaded" is NOT proof the session works — batchexecute on the
// old origin answers 401. So we resolve the origin from where the chain lands and PROBE a real RPC there.
async function authenticatesNotebookLM(cookieMap) {
  const applySetCookies = (res, m) => {
    let sc = [];
    try { sc = res.headers.getSetCookie?.() ?? []; } catch { /* ignore */ }
    if (!sc.length) { const r = res.headers.get('set-cookie'); if (r) sc = [r]; }
    for (const c of sc) { const f = c.split(';')[0]; const i = f.indexOf('='); if (i > 0) m[f.slice(0, i).trim()] = f.slice(i + 1).trim(); }
  };
  let url = 'https://notebook.google.com/';
  for (let i = 0; i <= 20; i++) {
    const res = await fetch(url, { method: 'GET', redirect: 'manual', headers: { Cookie: header(cookieMap), 'User-Agent': UA } });
    applySetCookies(res, cookieMap);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return false;
      url = new URL(loc, url).toString();
      continue;
    }
    if (res.status !== 200) return false;
    const html = await res.text();
    // The app page carries the LabsTailwindUi bundle + the SNlM0e CSRF token; a login/chooser page does not.
    const at = (html.match(/"SNlM0e"\s*:\s*"([^"]+)"/) || [])[1];
    if (!html.includes('LabsTailwindUi') || !at) return false;
    const fsid = (html.match(/"FdrFJe"\s*:\s*"([^"]+)"/) || [])[1] || '';
    return rpcAuthorizes(new URL(url).origin, at, fsid, cookieMap);
  }
  return false;
}

// The honest check: a read-only LIST_NOTEBOOKS (wXbhsf) on the resolved origin. 200 → the plugin's
// `notebooks create` will work; 401 → the session doesn't authorize RPCs (wrong host or expired cookies).
async function rpcAuthorizes(origin, at, fsid, cookieMap) {
  const u = new URL(`${origin}/_/LabsTailwindUi/data/batchexecute`);
  u.searchParams.set('rpcids', 'wXbhsf');
  u.searchParams.set('source-path', '/');
  u.searchParams.set('f.sid', fsid);
  u.searchParams.set('hl', 'en');
  u.searchParams.set('_reqid', '1');
  u.searchParams.set('rt', 'c');
  const body = new URLSearchParams({ 'f.req': JSON.stringify([[['wXbhsf', JSON.stringify([null, 1]), null, 'generic']]]), at });
  try {
    const res = await fetch(u, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Cookie: header(cookieMap), 'User-Agent': UA,
        origin, referer: `${origin}/`, 'x-same-domain': '1',
      },
      body: body.toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let browser;
try {
  browser = await chromium.connectOverCDP(CDP);
} catch {
  console.log('logged in: NO (cdp down)'); // navegador cerrado → la UI muestra "Conectar"
  process.exit(0);
}

try {
  const ctx = browser.contexts()[0];
  const all = ctx ? await ctx.cookies() : [];
  const map = {};
  for (const c of all) {
    const domain = (c.domain || '').replace(/^\./, '');
    if (!domain.endsWith('google.com') && !domain.includes('notebooklm')) continue;
    const prefer = domain === 'google.com' && (c.path || '/') === '/';
    if (!(c.name in map) || prefer) map[c.name] = c.value;
  }
  const hasRequired = REQUIRED.every((n) => map[n]);
  // La validación REAL contra NotebookLM: sólo "likely YES" si la sesión entra a la app (no a login/chooser).
  const ok = hasRequired && (await authenticatesNotebookLM({ ...map }));
  if (ok) {
    console.log('logged in: likely YES');
    console.log('COOKIES: ' + header(map));
  } else {
    console.log('logged in: NO'); // logueado en Gmail ≠ entrado a NotebookLM: abre NotebookLM y firma ahí
  }
} catch {
  console.log('logged in: NO');
} finally {
  await browser.close(); // detach only — la pestaña queda abierta
}
