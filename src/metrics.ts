// GARY 🐾 — metrics bridge. Reads the hunt log (data/metrics.md) via the Rust `read_metrics` command
// (spec 07, NOT built yet). Mirrors the settings.ts pattern: tryInvoke swallows the error when the
// command isn't registered / we're not under Tauri. GARY arranca DE 0: sin datos reales la vista queda
// vacía (empty state) — no inventamos hunts. Los datos los genera el terminal al correr búsquedas.
//
// Cada hunt registra el MODELO LLM que lo corrió y los TOKENS gastados en esa sesión, para analizar
// el filtrado (métricas actuales vs viejas, coste por hunt, comparativa por website).
import { invoke } from "@tauri-apps/api/core";

// Fixed set of sources/websites (same order as data/metrics.md). "ATS" = jobs conseguidos por el scanner
// zero-token de 16 providers (engines/scan.mjs), separado de las conexiones (WebFetch/CDP). "Web" = ofertas
// en páginas de empresa halladas por la búsqueda web del propio LM del usuario, EN la sesión (source-web).
export type Source = "LinkedIn" | "Gmail" | "Indeed" | "GetOnBoard" | "Himalayas" | "Computrabajo" | "Dice" | "Hireline" | "Glassdoor" | "Dover" | "ATS" | "Web";

export const SOURCES: Source[] = ["LinkedIn", "Gmail", "Indeed", "GetOnBoard", "Himalayas", "Computrabajo", "Dice", "Hireline", "Glassdoor", "Dover", "ATS", "Web"];

// One hunt = one búsqueda/filtrado.
export type Hunt = {
  date: string;                     // ISO-8601 local, ej. "2026-07-02T11:05"
  model: string;                    // modelo LLM que corrió el hunt (ej. "claude-opus-4-8")
  tokens: number;                   // tokens gastados en esa sesión
  total: number;                    // jobs encontrados
  real: number;                     // jobs reales para el perfil (survivors)
  bySource: Record<Source, number>; // jobs reales por fuente (suma == real)
};

export type MetricsData = { hunts: Hunt[] };

async function tryInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  try { return await invoke<T>(cmd, args); }
  catch { return undefined; } // command not registered yet, or not running under Tauri
}

// Construye un Record<Source, number> a partir de valores en el orden fijo de SOURCES (0 por defecto).
const bs = (n: number[]): Record<Source, number> =>
  Object.fromEntries(SOURCES.map((s, i) => [s, n[i] ?? 0])) as Record<Source, number>;

export async function loadMetrics(): Promise<MetricsData> {
  const fromRust = await tryInvoke<MetricsData>("read_metrics");
  if (fromRust && fromRust.hunts?.length) return fromRust;
  return { hunts: [] }; // sin backend/datos → vacío (GARY arranca de 0)
}

// ---------- Helpers de agregación (para overview + chart) ----------

// Total de consultas hechas.
export const totalQueries = (d: MetricsData): number => d.hunts.length;

// Jobs encontrados (suma de total).
export const totalFound = (d: MetricsData): number => d.hunts.reduce((a, h) => a + h.total, 0);

// Jobs reales (suma de real).
export const totalReal = (d: MetricsData): number => d.hunts.reduce((a, h) => a + h.real, 0);

// Tokens gastados (suma sobre todos los hunts).
export const totalTokens = (d: MetricsData): number => d.hunts.reduce((a, h) => a + h.tokens, 0);

// Jobs reales por fuente, sumados sobre todos los hunts (para el JobsBySourceChart).
export const realBySource = (d: MetricsData): Record<Source, number> =>
  d.hunts.reduce((acc, h) => {
    for (const s of SOURCES) acc[s] += h.bySource[s] ?? 0;
    return acc;
  }, bs([]));

// Fuentes activas = nº de fuentes con >0 jobs reales acumulados.
export const activeSources = (d: MetricsData): number =>
  SOURCES.filter((s) => realBySource(d)[s] > 0).length;

// Actual vs anteriores: la consulta actual es la ÚLTIMA fila del log (data/metrics.md agrega al final);
// las anteriores son todas las demás. Se muestran por separado para no mezclar la sesión en curso con el histórico.
export const splitHunts = (d: MetricsData): { current: MetricsData; previous: MetricsData } => ({
  current: { hunts: d.hunts.slice(-1) },
  previous: { hunts: d.hunts.slice(0, -1) },
});
