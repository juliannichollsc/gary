// GARY 🐾 — onboarding bridge (spec 03). Builds the candidate context = a NotebookLM RAG from the CV.
// The ingest itself is run by the terminal CLI via the `notebooklm-ai-plugin` skill (create notebook →
// index the CV → map role variants). The UI only REFLECTS progress — GARY never calls an LLM API here.
//
// Wiring: we `invoke("start_ingest")` and listen for `gary://ingest` events streamed by the Rust core as
// it drives the CLI. Until that backend lands (staged dev), we fall back to a faithful local simulation of
// the same stages so the screen is fully operable. Onboarding state persists like settings (Rust + LS).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// `path` es la ruta local donde el core persistió los bytes del CV (data/cv/base/<name>). Sólo existe
// cuando corre bajo Tauri (save_cv); en modo web queda undefined y la ingesta cae en la simulación.
export type CvFile = { name: string; size: number; path?: string };

export type RoleVariant = {
  id: string;
  label: string;      // e.g. "Frontend"
  stack: string[];    // detected stack chips, editable
};

// Preguntas típicas de aplicación (feed del apply-fieldmap / NotebookLM RAG). El apply engine las usa
// para llenar sin re-preguntar; si aparece una pregunta NO trackeada, GARY pregunta y continúa.
export type WorkModality = "remoto" | "hibrido" | "presencial";
// Enlace de contacto/exposición: no asumimos dev — puede ser LinkedIn, GitHub, portfolio, Behance, web…
export type ContactLink = { label: string; url: string };
export type CandidateProfile = {
  location: string;         // ubicación actual (ciudad, país)
  modality: WorkModality[]; // modalidades aceptadas ("todas" = las 3)
  modalityCondition: string;// condición si acepta todas (p.ej. "si dan sponsorship / reubicación")
  salaryMin: string;        // salario mínimo deseado
  currency: string;         // moneda (USD, EUR, …)
  phone: string;            // teléfono de contacto
  email: string;            // correo de contacto
  links: ContactLink[];     // enlaces de contacto/exposición (URLs)
};
export const EMPTY_PROFILE: CandidateProfile = {
  location: "", modality: [], modalityCondition: "", salaryMin: "", currency: "USD",
  phone: "", email: "", links: [],
};
export const CURRENCIES = ["USD", "EUR", "MXN", "COP", "ARS", "CLP", "PEN", "BRL", "GBP"];

export type OnboardingState = {
  done: boolean;
  file: CvFile | null;
  roles: RoleVariant[];
  softSkills: string[];     // habilidades blandas del candidato
  profile: CandidateProfile;// preguntas típicas de aplicación
  notebookId?: string;
  step?: number;            // paso actual del wizard (1..LAST) → retomar donde iba tras cerrar/reabrir
};

export const EMPTY_ONBOARDING: OnboardingState = {
  done: false, file: null, roles: [], softSkills: [], profile: EMPTY_PROFILE,
};

// Canonical variants surfaced by the CLI's CV analysis. Used as the first-pass result of the stub and as
// the shape the real `notebooklm-ai-plugin` output maps onto (user edits are persisted back to the RAG).
export const DEFAULT_ROLES: RoleVariant[] = [
  { id: "frontend", label: "Frontend", stack: ["React", "TypeScript", "CSS", "Vite"] },
  { id: "fullstack", label: "Fullstack", stack: ["React", "Node", "TypeScript", "Postgres"] },
  { id: "backend", label: "Backend", stack: ["Node", "TypeScript", "REST", "SQL"] },
];

// Ingest progress, streamed to the view. `value` is 0..1; `line` is a mono status-log entry.
export type IngestEvent =
  | { kind: "log"; line: string }
  | { kind: "progress"; value: number }
  | { kind: "roles"; roles: RoleVariant[] }
  | { kind: "profile"; profile: Partial<CandidateProfile> } // datos extraídos del CV → autocompletan el paso 4
  | { kind: "notebook"; id: string }  // ID del notebook de NotebookLM creado → para abrirlo desde Ajustes
  | { kind: "error"; message: string };

const LS_KEY = "gary-onboarding";

async function tryInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  try { return await invoke<T>(cmd, args); }
  catch { return undefined; } // command not registered yet, or not running under Tauri
}

// Normaliza estado (posiblemente parcial/antiguo) a la forma completa: deep-merge del profile y arrays
// garantizados, para que datos guardados por una versión previa no rompan la vista (p.ej. profile.links).
function normalizeOnboarding(s: Partial<OnboardingState> | null | undefined): OnboardingState {
  return {
    ...EMPTY_ONBOARDING,
    ...(s ?? {}),
    roles: s?.roles ?? [],
    softSkills: s?.softSkills ?? [],
    profile: { ...EMPTY_PROFILE, ...(s?.profile ?? {}) },
  };
}

export async function loadOnboarding(): Promise<OnboardingState> {
  const fromRust = await tryInvoke<OnboardingState>("get_onboarding");
  if (fromRust) return normalizeOnboarding(fromRust);
  const raw = localStorage.getItem(LS_KEY);
  return raw ? normalizeOnboarding(JSON.parse(raw)) : EMPTY_ONBOARDING;
}

export async function saveOnboarding(s: OnboardingState): Promise<void> {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
  await tryInvoke("set_onboarding", { onboarding: s });
}

// Lee el mapa de roles/soft-skills que el AGENTE LM escribió en data/cv/base/gary-context.md (comando Rust
// `read_role_map`). Es la fuente viva del "Mapa de roles" del onboarding: refleja lo que el agente mapeó al
// leer el CV + NotebookLM. Vacío mientras siga en `> _Pendiente_` o sin backend (web) → la vista muestra el
// texto informativo. Candidate-agnostic: sólo devuelve lo que el agente ya consolidó.
export async function loadRoleMap(): Promise<{ roles: RoleVariant[]; softSkills: string[] }> {
  const r = await tryInvoke<{ roles: RoleVariant[]; softSkills: string[] }>("read_role_map");
  return { roles: r?.roles ?? [], softSkills: r?.softSkills ?? [] };
}

// Persiste los bytes del CV a disco (Rust `save_cv` → data/cv/base/<name>) y devuelve el CvFile con su
// `path`, que la ingesta usa para `sources add-file`. Si no corre bajo Tauri (o el comando no está),
// devuelve sólo {name,size}: la ingesta caerá en la simulación y "Ver CV" no tendrá ruta local.
export async function saveCv(file: File): Promise<CvFile> {
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const path = await tryInvoke<string>("save_cv", { name: file.name, bytes });
  return { name: file.name, size: file.size, path };
}

// Consolida skills (técnicas + blandas), familias de roles y las respuestas del onboarding en un markdown
// que se ingesta en el MISMO notebook que el CV, para que el agente sepa filtrar por modalidad/roles/salario
// sin re-preguntar (contrato del RAG). Candidate-agnostic: sólo refleja lo que el usuario ingresó.
export function buildContextMd(roles: RoleVariant[], softSkills: string[], profile: CandidateProfile): string {
  const techByRole = roles.map((r) => `- **${r.label}**: ${r.stack.join(", ") || "—"}`).join("\n");
  const allTech = Array.from(new Set(roles.flatMap((r) => r.stack)));
  const mod = profile.modality.join(", ") || "—";
  const links = profile.links.filter((l) => l.url).map((l) => `- ${l.label || "enlace"}: ${l.url}`).join("\n");
  // Cuando roles/skills están vacíos (primera vez), dejamos una CONNOTACIÓN para el agente LM: que mapee
  // esto leyendo el CV + NotebookLM. Para soft skills, que incluya las de trabajo, liderazgo, comunicación…
  const TODO_ROLES = "> _Pendiente: GARY (agente) debe mapear las familias de roles y su stack técnico leyendo el CV y este NotebookLM._";
  const TODO_TECH = "> _Pendiente: GARY debe extraer las skills técnicas del CV/NotebookLM._";
  const TODO_SOFT = "> _Pendiente: GARY debe extraer las soft skills del CV/NotebookLM — incluir ética de trabajo, liderazgo, comunicación, trabajo en equipo, adaptabilidad, etc._";
  return [
    "# GARY — contexto del candidato",
    "",
    "## Familias de roles y stack técnico",
    techByRole || TODO_ROLES,
    "",
    `## Skills técnicas\n${allTech.length ? allTech.map((s) => `- ${s}`).join("\n") : TODO_TECH}`,
    "",
    `## Skills blandas\n${softSkills.length ? softSkills.map((s) => `- ${s}`).join("\n") : TODO_SOFT}`,
    "",
    "## Preferencias de aplicación (para filtrar ofertas)",
    `- Ubicación: ${profile.location || "—"}`,
    `- Modalidad aceptada: ${mod}${profile.modalityCondition ? ` (condición: ${profile.modalityCondition})` : ""}`,
    `- Salario mínimo: ${profile.salaryMin || "—"} ${profile.currency || ""}`.trim(),
    `- Teléfono: ${profile.phone || "—"}`,
    `- Email: ${profile.email || "—"}`,
    links ? `\n### Enlaces de contacto/exposición\n${links}` : "",
  ].join("\n");
}

// Guarda el contexto en disco (`save_context`) y lo agrega como fuente al notebook (`add_context_source`).
// Best-effort: sin backend o sin notebook, no hace nada (no rompe el "Terminar"). Devuelve si se ingestó.
export async function ingestContext(
  notebookId: string,
  roles: RoleVariant[],
  softSkills: string[],
  profile: CandidateProfile,
): Promise<boolean> {
  const content = buildContextMd(roles, softSkills, profile);
  const path = await tryInvoke<string>("save_context", { content });
  if (!path) return false;
  return (await tryInvoke<boolean>("add_context_source", { notebookId, contextPath: path })) ?? false;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The faithful local simulation of the NotebookLM ingest pipeline (used until the Rust/CLI backend exists).
// Mirrors the real stages so the UI and the eventual wiring speak the same event language.
async function simulateIngest(file: CvFile, emit: (e: IngestEvent) => void, signal?: AbortSignal) {
  const steps: { line: string; value: number; wait: number }[] = [
    { line: "· Preparando notebook de contexto…", value: 0.08, wait: 500 },
    { line: `✓ Notebook creado para ${file.name}`, value: 0.28, wait: 700 },
    { line: "⟳ Indexando CV en NotebookLM…", value: 0.55, wait: 900 },
    { line: "⟳ Consolidando y deduplicando contexto…", value: 0.74, wait: 700 },
    { line: "· Mapeando familias de roles…", value: 0.9, wait: 700 },
    { line: "✓ Mapa de roles listo", value: 1, wait: 400 },
  ];
  for (const s of steps) {
    if (signal?.aborted) return;
    await sleep(s.wait);
    if (signal?.aborted) return;
    emit({ kind: "log", line: s.line });
    emit({ kind: "progress", value: s.value });
  }
  emit({ kind: "roles", roles: DEFAULT_ROLES });
}

// Run the ingest. Prefers the real backend (Rust core → CLI → notebooklm-ai-plugin); falls back to the
// simulation when the `start_ingest` command isn't registered. Resolves when the pipeline finishes.
export async function runIngest(
  file: CvFile,
  emit: (e: IngestEvent) => void,
  signal?: AbortSignal,
  notebookId?: string, // si ya existe (reemplazo de CV) → el core reutiliza ese notebook en vez de crear
): Promise<void> {
  let unlisten: (() => void) | undefined;
  try {
    // One listener: forward every event to the view, and settle when a terminal event arrives.
    const backend = await new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const finish = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
      listen<IngestEvent>("gary://ingest", (ev) => {
        emit(ev.payload);
        if ((ev.payload.kind === "progress" && ev.payload.value >= 1) || ev.payload.kind === "error") finish(true);
      }).then((off) => { unlisten = off; }, reject);
      signal?.addEventListener("abort", () => finish(true), { once: true });
      // Ask the Rust core to drive the plugin. No backend (web mode, unregistered command, or the CV bytes
      // were never persisted so there's no path to add) → simulate.
      if (!file.path) { finish(false); return; }
      tryInvoke<boolean>("start_ingest", { cvPath: file.path, notebookId }).then((started) => {
        if (!started) finish(false);
      });
    });
    if (backend) return;
  } catch {
    // fall through to simulation
  } finally {
    unlisten?.();
  }
  await simulateIngest(file, emit, signal);
}
