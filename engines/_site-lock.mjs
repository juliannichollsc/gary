// ============================================================================
// _site-lock.mjs — ONE bot per site at a time (mandatory anti-block rule).
//
// Every engine that drives the user's logged-in automation Chrome takes a lock on its site's registrable
// domain before touching it: output/locks/<domain>.lock = { pid, started, cmd }. A second engine on the same
// site (e.g. board-sweep --site dice-recs while dice-apply runs) refuses to start instead of doubling the
// request rate on the user's account — the pattern that earns 423/429 blocks and "unusual activity" checks.
// Different sites still run side by side. The lock is released on exit/Ctrl-C; a lock whose pid is no
// longer alive (or was taken before the last reboot) is stale and is taken over.
// It also runs the MACHINE budget (_machine-guard.mjs): max concurrent bots on this computer + RAM/CPU back-off.
// Every engine — and every ad-hoc probe script the LM writes — MUST take it before touching a site.
// Usage: import { acquireSiteLock } from './_site-lock.mjs'; await acquireSiteLock('dice.com');
// ============================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { admit, lockAlive, onAbort } from './_machine-guard.mjs';

const DIR = 'output/locks';
const CDP_HTTP = `http://127.0.0.1:${process.env.CDP_PORT || process.env.GARY_BROWSER_PORT || '9333'}`;
const cdpTabs = async () => {
  try { const r = await fetch(`${CDP_HTTP}/json/list`, { signal: AbortSignal.timeout(1500) }); return (await r.json()).filter((t) => t.type === 'page'); }
  catch { return []; }
};

export async function acquireSiteLock(site) {
  const domain = String(site).replace(/^https?:\/\//, '').split('/')[0].split('.').slice(-2).join('.');
  mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `${domain}.lock`);
  if (existsSync(file)) {
    try {
      const l = JSON.parse(readFileSync(file, 'utf8'));
      if (l.pid !== process.pid && lockAlive(l)) {
        console.error(`⛔ Another bot is already working on ${domain} (pid ${l.pid}, since ${l.started}: ${l.cmd}).`
          + ` One bot per site — wait for it to finish, then run this one.`);
        process.exit(3);
      }
    } catch { /* unreadable → stale */ }
  }
  writeFileSync(file, JSON.stringify({ pid: process.pid, started: new Date().toISOString(), cmd: path.basename(process.argv[1] || '') + ' ' + process.argv.slice(2).join(' ') }));
  const release = () => { try { if (JSON.parse(readFileSync(file, 'utf8')).pid === process.pid) unlinkSync(file); } catch {} };
  process.on('exit', release);
  // A bot killed mid-run (Ctrl-C, timeout, overload stop) would leave its tabs open in the automation Chrome —
  // they pile up and eat RAM (part of the 2026-11-10 freeze). On ABORT only, close the tabs of THIS site that
  // appeared after this bot started (normal exits keep their tabs: apply engines leave the form for the user).
  const before = new Set((await cdpTabs()).map((t) => t.id));
  const closeMine = async () => {
    for (const t of await cdpTabs()) {
      let host = ''; try { host = new URL(t.url).hostname; } catch {}
      if (!before.has(t.id) && (host === domain || host.endsWith('.' + domain) || /^(about:blank|data:)/.test(t.url))) {
        await fetch(`${CDP_HTTP}/json/close/${t.id}`, { signal: AbortSignal.timeout(1500) }).catch(() => {});
      }
    }
  };
  onAbort(closeMine);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await Promise.race([closeMine().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]); release(); process.exit(130); });
  await admit(domain);   // machine budget: refuses (exit 4) when this computer can't take another bot
  return domain;
}
