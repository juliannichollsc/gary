// apply-assist.mjs — open a board offer in the dedicated debug Chrome (:9333) and drive it to the
// point where a login/apply hand-off is needed, then STOP. Used for boards whose "apply" is an OAuth
// or profile-based flow (e.g. GetOnBoard "Postular" con Google/LinkedIn) rather than an auto-fillable ATS.
//
// GARY adaptation of the career-ops prototype (which launched its OWN persistent Chromium profile):
//   - Connects over CDP to the ONE dedicated debug Chrome (:9333), which is already logged into the
//     candidate's boards (operating-rules §0/§5 — sign in once per site in the automation browser).
//     It NEVER launches a separate browser and NEVER touches the user's personal browser.
//   - Candidate-agnostic: no hardcoded account. Pass the account to pre-select as an optional 3rd arg,
//     otherwise it just opens the flow and hands off to the user.
//   - HARD GUARDRAILS: never clicks a final Submit/Postular-confirm, never solves a captcha, never
//     closes the shared session. Login + captcha + the final send are always the user's.
//
// Usage: node engines/apply-assist.mjs "<url>" [google|linkedin] [account-to-select]
import { chromium } from 'playwright';

const url = process.argv[2];
const provider = (process.argv[3] || 'google').toLowerCase();
const account = process.argv[4] || ''; // optional: OAuth account to pre-select if a chooser appears
if (!url) { console.error('Usage: node engines/apply-assist.mjs "<url>" [google|linkedin] [account-to-select]'); process.exit(1); }

const providerText = provider === 'linkedin'
  ? /Postula con LinkedIn|Continue with LinkedIn|Sign in with LinkedIn|LinkedIn/i
  : /Postula con Google|Continue with Google|Sign in with Google|Google/i;

let browser;
try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); }
catch { console.error('CDP down. Run engines\\start-chrome-debug.cmd first (debug Chrome on :9333).'); process.exit(1); }
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

const tryClick = async (re, where = page, timeout = 6000) => {
  try { await where.getByText(re).first().click({ timeout }); return true; }
  catch { return false; }
};

console.log(`Opening in the debug Chrome: ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

// Board may need a "Postular"/"Apply" click to reveal login/apply options. This opens the flow only —
// it does NOT confirm/submit an application.
await tryClick(/^Postular$|^Apply now$|^Apply$/i);
await page.waitForTimeout(1500);

// If an OAuth provider button is present, click it to start the (already-logged-in) session hand-off.
const popupP = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
const clicked = await tryClick(providerText);
console.log(clicked ? `Clicked ${provider} login button.` : `No ${provider} button found — the offer may auto-fill, or do it manually in the window.`);
const popup = await popupP;
const authPage = popup || page;

// If an account chooser shows and an account was passed, select it (session usually already remembered).
if (account) {
  await authPage.waitForTimeout(2500);
  const picked = await tryClick(new RegExp(account.replace(/[.+]/g, '\\$&'), 'i'), authPage, 5000);
  console.log(picked
    ? `Selected account ${account}.`
    : `Account chooser not pre-filled — sign in as ${account} manually (the debug Chrome will remember it).`);
}

console.log('\n>>> Your turn: finish login + captcha if asked, review the form, and click the final Submit/Postular yourself.');
console.log('>>> GARY does NOT submit and does NOT solve captchas. The debug Chrome session stays open.');
await browser.close(); // detaches CDP only; the shared debug Chrome session stays open
