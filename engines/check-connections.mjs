// check-connections.mjs — REGRESSION SELF-TEST for every Conexiones verification rule (0 tokens, no navigation).
// Run it BEFORE and AFTER any change to engines/connections.mjs / check-login.mjs (MANDATORY — connections skill):
//   1. static: src/components/Sidebar.tsx → INITIAL_CONNS must list the same sites + login URLs as the registry.
//   2. live:   applies each connection's rule to the tab already open in the automation Chrome and prints
//              SITE | tab | result | how. A row that changed from the last run without the user logging in/out
//              is a REGRESSION → fix that site's rule, never a shared heuristic.
// Usage: node engines/check-connections.mjs [--static]     (exit 1 if the static check fails)
import { existsSync, readFileSync } from 'node:fs';
import { CONNECTIONS, findTab, verifyPage } from './connections.mjs';

let fail = false;
const sidebar = 'src/components/Sidebar.tsx';
if (existsSync(sidebar)) {
  const src = readFileSync(sidebar, 'utf8');
  const ui = [...src.matchAll(/\{\s*site:\s*"([^"]+)",\s*url:\s*"([^"]+)"/g)].map((m) => ({ site: m[1], url: m[2] }));
  for (const u of ui) {
    const c = CONNECTIONS.find((x) => x.site === u.site);
    if (!c) { console.error(`✗ STATIC: "${u.site}" is in Sidebar INITIAL_CONNS but has NO rule in engines/connections.mjs`); fail = true; }
    else if (c.loginUrl !== u.url) { console.error(`✗ STATIC: ${u.site} login URL differs — Sidebar ${u.url} vs registry ${c.loginUrl}`); fail = true; }
  }
  for (const c of CONNECTIONS) if (!ui.some((u) => u.site === c.site)) { console.error(`✗ STATIC: registry has "${c.site}" but the Sidebar doesn't list it`); fail = true; }
  console.log(fail ? '' : `✓ static: ${ui.length} connections in the Sidebar = registry`);
} else console.log('(static check skipped: no src/components/Sidebar.tsx in this folder — run it from the repo)');
for (const c of CONNECTIONS) if (!c.why) { console.error(`✗ STATIC: ${c.site} has no "why" — every rule must say why it exists`); fail = true; }
if (process.argv.includes('--static')) process.exit(fail ? 1 : 0);

let chromium;
try { ({ chromium } = await import('playwright')); } catch { console.log('(live check skipped: playwright not resolvable here)'); process.exit(fail ? 1 : 0); }
let browser;
try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.GARY_BROWSER_PORT || 9333}`); }
catch { console.log('(live check skipped: automation Chrome is not running)'); process.exit(fail ? 1 : 0); }
const ctx = browser.contexts()[0];
console.log('\nSITE          TAB  RESULT  HOW');
for (const c of CONNECTIONS) {
  const page = findTab(ctx, c.loginUrl);
  if (!page) { console.log(`${c.site.padEnd(13)} —    —       no tab open (Conectar it to test)`); continue; }
  const r = await verifyPage(page, c);
  console.log(`${c.site.padEnd(13)} ✓    ${(r.yes ? 'YES' : 'NO').padEnd(7)} ${r.how}${c.generic ? '  [WEAK: generic rule]' : ''}`);
}
await browser.close();
process.exit(fail ? 1 : 0);
