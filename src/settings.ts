// GARY 🐾 — settings bridge. Prefs persist via Tauri commands (Rust settings store) with a localStorage
// fallback. NOTE: GARY does NOT store the model/CLI or an API key — the chat is a plain terminal where the
// user launches their own CLI (`claude`/`gemini`/…). So settings only cover the automation browser,
// its CDP port, and the performance level.
import { invoke } from "@tauri-apps/api/core";

// Navegador de automatización que conducirá el LLM por CDP. Chrome es el probado/recomendado; el usuario
// puede elegir otro instalado. La detección real de instalados llega por Rust (spec 07); hoy lista fija.
export type BrowserId = "chrome" | "edge" | "brave" | "chromium";
export const BROWSERS: { id: BrowserId; label: string; tested?: boolean }[] = [
  { id: "chrome", label: "Google Chrome", tested: true },
  { id: "edge", label: "Microsoft Edge" },
  { id: "brave", label: "Brave" },
  { id: "chromium", label: "Chromium" },
];

// Rendimiento = límite de la MÁQUINA: cuántas ventanas/automatizaciones/bots simultáneos corre el LM para
// NO saturar el computador (según su capacidad). Es APARTE de las reglas 429 por-website (mandatorias,
// protegen cuenta/IP). `parallel` = operaciones concurrentes máximas. El agente LM lo lee para orquestar.
export type PerfLevel = "very_low" | "low" | "medium" | "high" | "very_high";
export const PERF_LEVELS: { id: PerfLevel; parallel: number; gapMs: number }[] = [
  { id: "very_low",  parallel: 1, gapMs: 3000 },
  { id: "low",       parallel: 2, gapMs: 2000 },
  { id: "medium",    parallel: 3, gapMs: 1500 },
  { id: "high",      parallel: 4, gapMs: 1000 },
  { id: "very_high", parallel: 6, gapMs: 700 },
];

export type Settings = {
  browser: BrowserId;  // navegador que usará el LLM para la automatización
  browserPort: number; // puerto de depuración (CDP)
  performance: PerfLevel; // fuentes distintas en paralelo (nunca más bots por sitio)
};

export const DEFAULTS: Settings = { browser: "chrome", browserPort: 9333, performance: "medium" };

// Recomienda un nivel según el equipo (webview: cores + RAM aprox). Baja un escalón si hay pocos cores.
export function recommendPerf(): PerfLevel {
  const cores = (navigator.hardwareConcurrency as number | undefined) ?? 4;
  const mem = ((navigator as unknown as { deviceMemory?: number }).deviceMemory) ?? 4; // GB aprox (Chromium, cap 8)
  if (mem >= 8 && cores >= 8) return "very_high";
  if (mem >= 8 && cores >= 6) return "high";
  if (mem >= 4 && cores >= 4) return "medium";
  if (cores >= 2) return "low";
  return "very_low";
}

// Navegadores instalados (best-effort): comando Rust `list_browsers` (spec 07) o la lista fija con Chrome.
export async function detectBrowsers(): Promise<{ id: BrowserId; label: string; tested?: boolean }[]> {
  const fromRust = await tryInvoke<BrowserId[]>("list_browsers");
  if (fromRust && fromRust.length) return BROWSERS.filter((b) => fromRust.includes(b.id));
  return BROWSERS;
}

const LS_KEY = "gary-settings";

async function tryInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  try { return await invoke<T>(cmd, args); }
  catch { return undefined; } // command not registered yet, or not running under Tauri
}

export async function loadSettings(): Promise<Settings> {
  const fromRust = await tryInvoke<Settings>("get_settings");
  if (fromRust) return { ...DEFAULTS, ...fromRust };
  const raw = localStorage.getItem(LS_KEY);
  return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
}

export async function saveSettings(s: Settings): Promise<void> {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
  await tryInvoke("set_settings", { settings: s });
}

export type BrowserStatus = { running: boolean; port: number };
export async function browserStatus(): Promise<BrowserStatus> {
  return (await tryInvoke<BrowserStatus>("browser_status")) ?? { running: false, port: DEFAULTS.browserPort };
}
export async function startBrowser(browser: BrowserId, port: number): Promise<BrowserStatus | undefined> {
  return tryInvoke<BrowserStatus>("start_browser", { browser, port });
}
export async function stopBrowser(): Promise<BrowserStatus | undefined> {
  return tryInvoke<BrowserStatus>("stop_browser");
}

// Conexiones (sidebar): abre la URL de login de un sitio en el navegador de automatización para que el
// usuario inicie sesión a mano, y verifica si ya está logueado. Ambos son comandos Rust (spec 07) con
// fallback: sin backend, open no hace nada y check_login devuelve false (→ el "Verificando…" expira).
export async function openInBrowser(url: string): Promise<boolean> {
  return (await tryInvoke<boolean>("open_in_browser", { url })) ?? false;
}
export async function checkSiteLogin(url: string): Promise<boolean> {
  return (await tryInvoke<boolean>("check_login", { url })) ?? false;
}

// Sesión de NotebookLM (misma filosofía que Conexiones: reusa el navegador :9333 con Gmail ya abierto,
// verificación de UN solo tiro, SIN polling). `notebooklmStatus` = lectura barata del archivo de cookies
// del plugin (al abrir la app / entrar al paso de ingesta). `connectNotebooklm` = corre el engine una vez
// para leer las cookies del navegador y guardarlas en el plugin (`login --cookies`). Sin backend → false.
export async function notebooklmStatus(): Promise<boolean> {
  return (await tryInvoke<boolean>("notebooklm_status")) ?? false;
}
export async function connectNotebooklm(): Promise<boolean> {
  return (await tryInvoke<boolean>("connect_notebooklm")) ?? false;
}
