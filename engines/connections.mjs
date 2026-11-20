// ============================================================================
// connections.mjs — THE single registry of GARY's connections (Conexiones panel) and HOW each one is verified.
//
// Every connection has an EXPLICIT verification rule + the reason it exists. The generic text heuristic is only
// for a NEW site under analysis (website-analyzer) — never for a mapped connection, because page text is user
// content (feeds, inboxes, job titles) and changes every day:
//   2026-11-10  GetOnBoard false YES: job title "Account Manager" matched the generic "account" signal.
//   2026-11-10  Gmail false NO: the inbox is full of "sign in"/"regístrate" e-mails.
//   2026-11-10  LinkedIn false NO: tightening the GENERIC rule for GetOnBoard removed the signals LinkedIn relied
//               on, and its feed shows "Regístrate" in posts → a shared heuristic fixed one site, broke another.
//   2026-11-10  Dice/Hireline false YES: login buttons hidden in a hamburger menu; Hireline keeps its login modal
//               in the DOM even when signed in.
// Rule types (checked on the tab the user already has open for that site — no navigation):
//   yes: selector that ONLY exists inside a session (logout link, messaging nav…) → present ⇒ logged in.
//   no:  { sel, text } logged-out markers (login/register links/buttons, HIDDEN ones count) → present ⇒ NOT logged in;
//        a settled page (≥3 s, >300 chars) without them ⇒ logged in. Used where a page renders WITHOUT a session.
//   A login/authwall/checkpoint URL is always NOT logged in.
// CHANGE PROTOCOL (MANDATORY — see .claude/skills/connections/SKILL.md): change ONLY the rule of the site you are
// fixing, never a shared heuristic; then run `node engines/check-connections.mjs` and confirm EVERY connection
// still reads correctly before and after the change. `src/components/Sidebar.tsx → INITIAL_CONNS` must list the
// same sites + login URLs (the self-test checks it).
// ============================================================================

export const CONNECTIONS = [
  { site: 'Gmail', loginUrl: 'https://mail.google.com/', host: 'mail.google.com',
    yes: 'a[href*="accounts.google.com/SignOutOptions"]',
    why: 'the inbox text is user content (e-mails say "sign in"/"regístrate"); the account switcher link exists only signed in' },
  { site: 'LinkedIn', loginUrl: 'https://www.linkedin.com/login', host: 'www.linkedin.com',
    yes: 'a[href*="/messaging/"], a[href*="/mynetwork/"], a[href$="linkedin.com/mynetwork"], a[href$="linkedin.com/messaging"]',
    why: 'feed posts contain "Regístrate"/"sign in"; the Messaging / My Network nav links exist only in a session. 2026-11-17: the nav now links "https://www.linkedin.com/mynetwork" WITHOUT the trailing slash → false NO on /notifications/' },
  { site: 'Indeed', loginUrl: 'https://www.indeed.com/', host: 'www.indeed.com',
    yes: 'a[href*="/account/logout"]',
    why: 'listings render logged out; the account menu (logout link) hydrates after JS. Regional tabs (co.indeed.com) share the session' },
  { site: 'GetOnBoard', loginUrl: 'https://www.getonbrd.com/', host: 'www.getonbrd.com',
    yes: 'a[href*="/webpros/logout"]',
    no: { sel: 'a[href*="/webpros/login"]', text: /^(sign ?in|ingresa|iniciar sesi[oó]n)$/i },
    why: 'listings render logged out and job titles ("Account Manager") fooled the generic rule' },
  { site: 'Himalayas', loginUrl: 'https://himalayas.app/', host: 'himalayas.app',
    no: { sel: 'a[href="/login"], a[href^="/login?"], a[href="/signup"], a[href^="/signup?"], a[href*="himalayas.app/login"]', text: /^(log ?in|sign ?in|sign ?up)$/i },
    why: 'home/jobs render logged out; signed in shows the avatar + "Upgrade" and no Log in / Sign up controls' },
  { site: 'Computrabajo', loginUrl: 'https://www.computrabajo.com/', host: 'www.computrabajo.com',
    generic: true,
    why: 'KNOWN WEAK: www.computrabajo.com is a country picker with no session UI; the real session lives on <cc>.computrabajo.com (candidate area). Map a yes-marker there before relying on it' },
  { site: 'Dice', loginUrl: 'https://www.dice.com/dashboard/login', host: 'www.dice.com',
    no: { sel: 'a[href*="/dashboard/login"], a[href*="/register"]', text: /^(log ?in|sign ?in)$/i },
    why: 'listings render logged out; narrow windows hide the login button in a hamburger menu (hidden markers count)' },
  { site: 'Hireline', loginUrl: 'https://hireline.io/', host: 'hireline.io',
    yes: 'a[href*="hireline.io/auth/logout"], a[href="/auth/logout"]',
    why: 'the "Iniciar sesión" modal stays in the DOM even when signed in → only the logout link is reliable' },
  { site: 'Glassdoor', loginUrl: 'https://www.glassdoor.com/', host: 'www.glassdoor.com',
    no: { sel: 'a[href*="/profile/login"]', text: /^sign ?in$/i },
    why: 'pages render logged out; the Sign In link disappears inside a session' },
  { site: 'Dover', loginUrl: 'https://jobs.dover.com/', host: 'jobs.dover.com',
    yes: 'a[href="/candidate/dashboard"]',
    no: { sel: 'a[href*="/login?app=candidate"], a[href*="/signup?app=candidate"]', text: /^(sign ?in|sign ?up)$/i },
    why: 'the board renders logged out; "My dashboard" points to /candidate/dashboard only inside a session (logged out it goes to /login?app=candidate, next to "Sign in" / "Sign up")' },
];

const base = (h) => String(h || '').split('.').slice(-2).join('.');
export const hostOf = (u) => { try { return new URL(String(u).startsWith('http') ? u : 'https://' + u).host; } catch { return String(u); } };
export const connectionFor = (urlOrHost) => {
  const h = hostOf(urlOrHost);
  return CONNECTIONS.find((c) => c.host === h) || CONNECTIONS.find((c) => base(c.host) === base(h)) || null;
};

const LOGIN_URL = /\/(login|signin|sign-in|register|authwall|checkpoint|uas\/login)\b/i;

// Verify ONE connection on an already-open page. Returns { yes: boolean, how: string }.
export async function verifyPage(page, conn) {
  try { await page.waitForLoadState('load', { timeout: 15000 }); } catch { /* still poll */ }
  const start = Date.now();
  if (conn && !conn.generic) {
    const noSrc = conn.no ? conn.no.text.source : '';
    for (;;) {
      let r = { yes: false, no: false, loginUrl: false, len: 0 };
      try {
        r = await page.evaluate(({ yes, noSel, noSrc, loginRe }) => {
          const re = noSrc ? new RegExp(noSrc, 'i') : null;
          return {
            yes: !!yes && document.querySelector(yes) !== null,
            // logged-out markers count even when HIDDEN (hamburger menus) — a session doesn't render them at all
            no: !!noSel && (document.querySelector(noSel) !== null || [...document.querySelectorAll('a,button')].some((e) => re.test((e.textContent || '').trim()))),
            loginUrl: new RegExp(loginRe, 'i').test(location.pathname),
            len: (document.body?.innerText || '').length,
          };
        }, { yes: conn.yes || '', noSel: conn.no?.sel || '', noSrc, loginRe: LOGIN_URL.source });
      } catch { /* mid-navigation */ }
      if (r.loginUrl) return { yes: false, how: 'login URL' };
      if (r.yes) return { yes: true, how: 'session marker' };
      if (r.no) return { yes: false, how: 'logged-out marker' };
      if (conn.no && r.len > 300 && Date.now() - start > 3000) return { yes: true, how: 'no logged-out marker (settled)' };
      if (Date.now() - start > 10000) return { yes: false, how: conn.yes ? 'session marker absent' : 'page never settled' };
      await page.waitForTimeout(600);
    }
  }
  // GENERIC heuristic — only for an unmapped site (or a connection explicitly marked `generic`).
  for (;;) {
    let r = { blank: true, wall: false, inside: false };
    try {
      r = await page.evaluate(() => {
        const txt = document.body ? document.body.innerText : '';
        return {
          blank: !txt.trim(),
          wall: /\b(sign in|log in|iniciar sesi[oó]n|create account|reg[ií]strate|registr)/i.test(txt),
          inside: /\b(sign out|log out|cerrar sesi[oó]n|my profile|mi perfil|mi cuenta|my account)\b/i.test(txt),
        };
      });
    } catch { /* mid-navigation */ }
    if (r.inside) return { yes: true, how: 'generic: account text' };
    if (!r.blank && !r.wall) return { yes: true, how: 'generic: no sign-in wall' };
    if (Date.now() - start > 8000) return { yes: false, how: 'generic: wall/blank' };
    await page.waitForTimeout(600);
  }
}

// The tab the user already has open for this connection: exact host first, then the registrable domain.
export function findTab(ctx, urlOrHost) {
  const h = hostOf(urlOrHost);
  const hp = (p) => { try { return new URL(p.url()).host; } catch { return ''; } };
  return ctx.pages().find((p) => hp(p) === h) || ctx.pages().find((p) => base(hp(p)) === base(h)) || null;
}
