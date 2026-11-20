// ============================================================================
// ats-registry.mjs — large ATS company registry for scan.mjs (0 tokens).
//
// scan.mjs only knew the hand-picked `tracked_companies` of portals.yml. This adds ~15k companies whose jobs
// live on Greenhouse / Lever / Ashby, from the public MIT-licensed slug lists of
// github.com/Riley-Dorrington/job-board-aggregator (data/{greenhouse,lever,ashby}_companies.json).
// The lists are downloaded into output/ats-registry/ (gitignored cache, refreshed every 30 days) — never shipped.
//
// Scanning 15k boards every run would be slow and rude to the APIs, so each run takes a ROTATING slice:
//   1. boards that had REMOTE jobs last time (rescanned after 20 h)   ← where the hits are
//   2. never-scanned boards                                          ← discovery
//   3. boards with no remote jobs (rechecked every 14 days)
//   boards that failed twice (404 / bad slug) rest for 60 days.
// State per board lives in output/ats-registry/state.json { "<provider>:<slug>": { last, jobs, remote, fails } }.
//
// portals.yml:
//   ats_registry:
//     enabled: true
//     max_companies: 1500        # boards per run (default 1500)
//     providers: [greenhouse, lever, ashby]
// Standalone: node engines/ats-registry.mjs --refresh   (re-download the lists)
//             node engines/ats-registry.mjs --stats     (registry coverage so far)
// ============================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DIR = 'output/ats-registry';
const STATE = `${DIR}/state.json`;
const SOURCE = 'https://raw.githubusercontent.com/Riley-Dorrington/job-board-aggregator/main/data';
const BOARD_URL = {
  greenhouse: (s) => `https://job-boards.greenhouse.io/${s}`,
  lever: (s) => `https://jobs.lever.co/${s}`,
  ashby: (s) => `https://jobs.ashbyhq.com/${s}`,
};
const H = 3600e3, DAY = 24 * H;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/i;
// A posting counts as remote when its location says so (same vocabulary the region-lock gate reads later).
export const REMOTE_RE = /remote|anywhere|worldwide|global|distributed|work from home|wfh|latam|latin america|americas/i;

const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };

/** Download (or reuse the cached) slug list per provider. Network failures keep the old cache. */
export async function loadSlugs(providers, { refresh = false } = {}) {
  mkdirSync(DIR, { recursive: true });
  const out = {};
  for (const p of providers) {
    const file = `${DIR}/slugs-${p}.json`;
    const stale = !existsSync(file) || Date.now() - statSync(file).mtimeMs > 30 * DAY;
    if (refresh || stale) {
      try {
        const res = await fetch(`${SOURCE}/${p}_companies.json`, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = (await res.json()).filter((s) => typeof s === 'string' && SLUG_RE.test(s));
        writeFileSync(file, JSON.stringify(list));
        console.log(`ATS registry: ${p} → ${list.length} boards (downloaded)`);
      } catch (e) {
        console.error(`ATS registry: could not download ${p} list (${e.message})${existsSync(file) ? ' — using cache' : ''}`);
      }
    }
    out[p] = readJson(file, []);
  }
  return out;
}

/**
 * Pick this run's rotating slice of registry boards as scan.mjs entries.
 * @param {object} cfg       portals.yml → ats_registry
 * @param {Set<string>} skip careers_url values already tracked in portals.yml (never scanned twice)
 */
export async function registryTargets(cfg = {}, skip = new Set()) {
  const providers = (cfg.providers || ['greenhouse', 'lever', 'ashby']).filter((p) => BOARD_URL[p]);
  const max = Math.max(1, parseInt(cfg.max_companies ?? 1500, 10));
  const slugs = await loadSlugs(providers);
  const state = readJson(STATE, {});
  const now = Date.now();
  const tiers = [[], [], []];
  for (const p of providers) {
    for (const slug of slugs[p] || []) {
      const careers_url = BOARD_URL[p](slug);
      if (skip.has(careers_url)) continue;
      const st = state[`${p}:${slug}`];
      if (!st) { tiers[1].push({ p, slug, careers_url, last: 0 }); continue; }
      if (st.fails >= 2 && now - st.last < 60 * DAY) continue;
      if (st.remote > 0) { if (now - st.last > 20 * H) tiers[0].push({ p, slug, careers_url, last: st.last }); }
      else if (now - st.last > 14 * DAY) tiers[2].push({ p, slug, careers_url, last: st.last });
    }
  }
  // Oldest first inside each tier; interleave providers in the discovery tier so one slow API (Ashby) never
  // takes the whole budget.
  tiers[0].sort((a, b) => a.last - b.last);
  tiers[2].sort((a, b) => a.last - b.last);
  const byP = providers.map((p) => tiers[1].filter((t) => t.p === p));
  tiers[1] = [];
  for (let i = 0; byP.some((l) => i < l.length); i++) for (const l of byP) if (i < l.length) tiers[1].push(l[i]);
  const picked = [...tiers[0], ...tiers[1], ...tiers[2]].slice(0, max);
  console.log(`ATS registry: ${picked.length} boards this run (remote-active ${Math.min(tiers[0].length, max)}, `
    + `new ${tiers[1].length}, stale ${tiers[2].length} due)`);
  return picked.map((t) => ({ name: t.slug, careers_url: t.careers_url, provider: t.p, _registryKey: `${t.p}:${t.slug}` }));
}

/** Persist one board's outcome (called by scan.mjs after each registry fetch). */
const pending = {};
export function recordBoard(key, jobs, error) {
  pending[key] = error
    ? { last: Date.now(), jobs: 0, remote: 0, fail: true }
    : { last: Date.now(), jobs: jobs.length, remote: jobs.filter((j) => REMOTE_RE.test(j.location || '')).length };
}
export function saveRegistryState() {
  if (!Object.keys(pending).length) return;
  const state = readJson(STATE, {});
  for (const [k, r] of Object.entries(pending)) {
    const prev = state[k] || { fails: 0 };
    state[k] = { last: r.last, jobs: r.jobs, remote: r.remote, fails: r.fail ? (prev.fails || 0) + 1 : 0 };
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(STATE, JSON.stringify(state));
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const providers = ['greenhouse', 'lever', 'ashby'];
  const slugs = await loadSlugs(providers, { refresh: process.argv.includes('--refresh') });
  const state = readJson(STATE, {});
  for (const p of providers) {
    const keys = Object.keys(state).filter((k) => k.startsWith(`${p}:`));
    const remote = keys.filter((k) => state[k].remote > 0).length;
    const dead = keys.filter((k) => state[k].fails >= 2).length;
    console.log(`${p.padEnd(10)} boards ${String(slugs[p].length).padStart(5)} · scanned ${String(keys.length).padStart(5)} · with remote jobs ${String(remote).padStart(4)} · dead ${dead}`);
  }
}
