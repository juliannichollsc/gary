// ============================================================================
// _machine-guard.mjs — protect the USER'S COMPUTER (mandatory, owner order 2026-11-10 after a full freeze).
//
// Separate from the per-site anti-block rules (those protect accounts/IPs). This one caps how many bots run on
// THIS machine and backs off when the machine is already busy with whatever else the user has open.
//   1. BUDGET   — max concurrent bots = min(Settings → Rendimiento level, hardware cap, what is free right now).
//                 The level comes from output/gary-settings.json (written by the app) or $GARY_PERF.
//   2. ADMISSION — every engine passes admit() (called by acquireSiteLock): if the budget is full, the machine is
//                 under pressure, or a bot was stopped for overload < 3 min ago → it refuses to start (exit 4).
//   3. MONITOR  — while a bot runs it samples RAM / CPU / Linux PSI every 15 s. HIGH → prints
//                 "⚠ GARY-MACHINE high" and breathe() adds 10–20 s pauses; CRITICAL twice in a row → the NEWEST
//                 bot stops itself (exit 5, progress already saved) so the machine recovers — one bot at a time.
// The LM supervisor reads these lines, tells the user, and launches fewer/slower runs (CLAUDE.md MANDATORY).
// CLI: `node engines/_machine-guard.mjs` → current status JSON (run it before launching any engine).
// ============================================================================
import os from 'node:os';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LOCKS = 'output/locks';
const OVERLOAD = path.join(LOCKS, 'overload.json');
const LEVEL_BOTS = { very_low: 1, low: 1, medium: 2, high: 3, very_high: 4 };
const LEVEL_PACE = { very_low: 1.6, low: 1.3, medium: 1, high: 1, very_high: 1 };
const GB = 1024 ** 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
// A lock is live only if its pid runs AND it was taken after this boot (after a reboot/freeze pids get reused).
export const lockAlive = (l) => !!l && alive(l.pid) && Date.parse(l.started) > Date.now() - os.uptime() * 1000;
const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };

export function perfLevel() {
  const env = process.env.GARY_PERF;
  if (env && LEVEL_BOTS[env]) return env;
  try { const s = JSON.parse(read('output/gary-settings.json')); if (LEVEL_BOTS[s.performance]) return s.performance; } catch {}
  return 'medium';
}

// Hardware ceiling regardless of the chosen level: each browser bot ≈ 1 Chrome renderer + 1 node (~0.5–1 GB).
export function hardwareCap() {
  const cores = os.cpus().length || 2, totalGB = os.totalmem() / GB;
  return Math.max(1, Math.min(Math.floor(cores / 2), Math.floor(totalGB / 4)));
}

function memInfo() {
  const mi = read('/proc/meminfo');
  const kb = (k) => { const m = mi.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm')); return m ? +m[1] * 1024 : null; };
  const total = kb('MemTotal') ?? os.totalmem();
  const avail = kb('MemAvailable') ?? os.freemem();
  const swapT = kb('SwapTotal') ?? 0, swapF = kb('SwapFree') ?? 0;
  return { total, avail, swapUsedPct: swapT ? Math.round(100 * (swapT - swapF) / swapT) : 0 };
}
function psi(kind) { // Linux pressure-stall info (best freeze predictor); null elsewhere
  const t = read(`/proc/pressure/${kind}`); if (!t) return null;
  const g = (line) => { const m = t.match(new RegExp(`^${line} avg10=([\\d.]+)`, 'm')); return m ? +m[1] : 0; };
  return { some: g('some'), full: g('full') };
}
async function cpuBusyPct(ms = 800) {
  const snap = () => os.cpus().reduce((a, c) => { const t = c.times; a.idle += t.idle; a.all += t.user + t.nice + t.sys + t.irq + t.idle; return a; }, { idle: 0, all: 0 });
  const a = snap(); await sleep(ms); const b = snap();
  const all = b.all - a.all; return all > 0 ? Math.round(100 * (1 - (b.idle - a.idle) / all)) : 0;
}

export async function sample() {
  const m = memInfo(), pm = psi('memory'), pc = psi('cpu'), cpu = await cpuBusyPct();
  const availGB = +(m.avail / GB).toFixed(1), availPct = Math.round(100 * m.avail / m.total);
  const why = [];
  let level = 'ok';
  if (availGB < 0.8 || availPct < 6 || (pm && pm.full > 10) || (cpu > 97 && (!pc || pc.some > 80))) {
    level = 'critical';
  } else if (availGB < 2 || availPct < 15 || (pm && pm.some > 20) || cpu > 85 || (pc && pc.some > 60) || m.swapUsedPct > 60) {
    level = 'high';
  }
  if (availGB < 2 || availPct < 15) why.push(`RAM libre ${availGB} GB (${availPct}%)`);
  if (cpu > 85) why.push(`CPU ${cpu}%`);
  if (pm && (pm.some > 20 || pm.full > 10)) why.push(`presión de memoria ${pm.some}/${pm.full}`);
  if (pc && pc.some > 60) why.push(`presión de CPU ${pc.some}`);
  if (m.swapUsedPct > 60) why.push(`swap ${m.swapUsedPct}%`);
  return { level, availGB, availPct, cpu, swapUsedPct: m.swapUsedPct, psiMem: pm, psiCpu: pc, why: why.join(' · ') };
}

export function runningBots(excludePid = process.pid) {
  if (!existsSync(LOCKS)) return [];
  const out = [];
  for (const f of readdirSync(LOCKS)) {
    if (!f.endsWith('.lock')) continue;
    try { const l = JSON.parse(read(path.join(LOCKS, f))); if (l.pid !== excludePid && lockAlive(l)) out.push({ site: f.replace(/\.lock$/, ''), ...l }); } catch {}
  }
  return out;
}

export async function budget() {
  const level = perfLevel(), s = await sample();
  // What is free NOW (other apps included): keep ~2 GB for the user, ~1 GB per extra bot.
  const freeCap = Math.max(1, Math.floor((s.availGB - 2) / 1));
  const max = Math.max(1, Math.min(LEVEL_BOTS[level], hardwareCap(), freeCap));
  return { level, maxBots: max, levelBots: LEVEL_BOTS[level], hardwareCap: hardwareCap(), freeCap, machine: s };
}

let state = { level: 'ok', criticalStreak: 0, name: '', pace: 1, warned: false };
let abortCleanup = async () => {};
export const onAbort = (fn) => { abortCleanup = fn; };   // _site-lock registers "close the tabs this bot opened"

// Admission control — called once by acquireSiteLock() before the bot touches any site.
export async function admit(name) {
  state.name = name;
  state.pace = LEVEL_PACE[perfLevel()] || 1;
  mkdirSync(LOCKS, { recursive: true });
  try { os.setPriority(process.pid, 10); } catch {}   // bots yield CPU to the user's own apps (nice 10)
  try {
    const o = JSON.parse(read(OVERLOAD));
    if (Date.now() - Date.parse(o.at) < 3 * 60e3) refuse(`un bot se detuvo por sobrecarga hace menos de 3 min (${o.why || o.level}) — espera a que el equipo se recupere`);
  } catch {}
  let b = await budget(), others = runningBots();
  if (others.length >= b.maxBots) {
    refuse(`ya hay ${others.length}/${b.maxBots} bots corriendo en este equipo (${others.map((o) => o.site).join(', ')}) — nivel "${b.level}", RAM libre ${b.machine.availGB} GB. Corre este cuando uno termine`);
  }
  for (let i = 0; b.machine.level !== 'ok' && i < 6; i++) {     // busy machine: wait up to ~90 s for it to settle
    if (b.machine.level === 'critical') refuse(`el equipo está sobrecargado (${b.machine.why}) — cierra programas pesados o espera`);
    if (i === 0) console.error(`⚠ GARY-MACHINE high: equipo ocupado (${b.machine.why}) — esperando antes de arrancar ${name}…`);
    await sleep(15000); b = await budget();
  }
  if (b.machine.level !== 'ok') {
    if (others.length) refuse(`el equipo sigue ocupado (${b.machine.why}) y ya hay ${others.length} bot(s) — no se suma otro`);
    state.pace = Math.max(state.pace, 1.5);
    console.error(`⚠ GARY-MACHINE high: arranca ${name} SOLO y más lento (×${state.pace}) porque el equipo está ocupado (${b.machine.why}).`);
  }
  await checkTabs();
  startMonitor();
  return b;
}

// Tabs left behind by killed runs pile up in the automation Chrome (each = a renderer eating RAM/CPU).
async function checkTabs() {
  const port = process.env.CDP_PORT || process.env.GARY_BROWSER_PORT || '9333';
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) });
    const pages = (await r.json()).filter((t) => t.type === 'page');
    if (pages.length > 12) console.error(`⚠ GARY-MACHINE tabs: el Chrome de automatización tiene ${pages.length} pestañas abiertas — ciérralas (cada una consume RAM/CPU).`);
  } catch {}
}

function refuse(msg) {
  console.error(`⛔ GARY-MACHINE: ${msg}.`);
  process.exit(4);
}

function startMonitor() {
  const t = setInterval(async () => {
    const s = await sample();
    if (s.level === 'ok') {
      if (state.level !== 'ok') console.error(`✓ GARY-MACHINE ok: el equipo se recuperó (RAM libre ${s.availGB} GB, CPU ${s.cpu}%).`);
      state.level = 'ok'; state.criticalStreak = 0; return;
    }
    if (s.level === 'high') {
      if (state.level === 'ok') console.error(`⚠ GARY-MACHINE high: ${s.why} — ${state.name} baja el ritmo (pausas extra).`);
      state.level = 'high'; state.criticalStreak = 0; return;
    }
    state.level = 'critical'; state.criticalStreak++;
    console.error(`⚠ GARY-MACHINE critical (${state.criticalStreak}): ${s.why}`);
    const bots = [...runningBots(), { pid: process.pid, started: new Date(Date.now() - process.uptime() * 1000).toISOString() }];
    const newest = bots.sort((a, b) => Date.parse(b.started) - Date.parse(a.started))[0];
    const mine = newest.pid === process.pid;
    // Reduce one bot at a time: the newest stops after 2 critical samples; a lone bot after 3 (~45 s).
    if ((mine && bots.length > 1 && state.criticalStreak >= 2) || (bots.length === 1 && state.criticalStreak >= 3)) {
      try { writeFileSync(OVERLOAD, JSON.stringify({ at: new Date().toISOString(), engine: state.name, pid: process.pid, level: s.level, why: s.why })); } catch {}
      console.error(`⛔ GARY-MACHINE-OVERLOAD: ${state.name} se detiene para proteger el equipo (${s.why}). Progreso guardado; reanúdalo cuando el equipo esté libre.`);
      await Promise.race([abortCleanup().catch(() => {}), sleep(3000)]);
      process.exit(5);
    }
  }, 15000);
  t.unref();
}

// Engines call this after each wait: adds a 10–20 s breather while the machine is busy (no-op when ok).
export async function breathe() {
  if (state.level === 'ok') return;
  await sleep((state.level === 'critical' ? 20000 : 10000) + Math.random() * 10000);
}
// Pace multiplier from the chosen level (very_low/low run slower) — engines multiply their waits by it.
export const machinePace = () => state.pace;

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const b = await budget();
  let overload = null; try { overload = JSON.parse(read(OVERLOAD)); } catch {}
  console.log(JSON.stringify({ ...b, running: runningBots(-1).map((r) => ({ site: r.site, pid: r.pid, since: r.started, cmd: r.cmd })), lastOverload: overload }, null, 2));
}
