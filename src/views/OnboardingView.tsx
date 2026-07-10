// GARY 🐾 — Onboarding (spec 03, PROMPTS §4). 3-step stepper: Subir CV → Ingestar en NotebookLM (RAG) →
// Mapa de roles. Builds the candidate context. The UI reflects the CLI's ingest progress; it never calls an
// LLM API (see onboarding.ts). Continue is disabled until each step is valid; the stepper is keyboard-operable.
import { useEffect, useRef, useState } from "react";
import { Avatar, Button, Chip, StatusDot } from "../components/ui";
import { TutorialButton } from "../components/TutorialButton";
import { Check, File, Upload, X, Plus, Loader } from "../icons";
import { useT, useLang, setLang, LANGS, type Lang } from "../i18n";
import { notebooklmStatus, connectNotebooklm } from "../settings";
import {
  type CvFile, type RoleVariant, type IngestEvent, type CandidateProfile, type WorkModality, type ContactLink,
  EMPTY_PROFILE, CURRENCIES,
  loadOnboarding, saveOnboarding, saveCv, runIngest, ingestContext, loadRoleMap,
} from "../onboarding";

// Orden: Subir CV → Ingestar → Preguntas típicas → Mapa de roles. El mapa de roles va AL FINAL porque lo
// llena el agente LM (lee CV + NotebookLM en el chat); en el onboarding es solo informativo la 1ª vez.
const STEPS = ["ob.step.cv", "ob.step.ingest", "ob.step.questions", "ob.step.roles"]; // i18n keys
const LAST = STEPS.length; // 4

// Estado de la sesión de NotebookLM (mismo patrón que Conexiones en Sidebar, sin polling):
// unknown → (check) → connected | disconnected; Conectar → pending; Verificar → checking → connected/pending.
type NlmConn = "unknown" | "connected" | "disconnected" | "pending" | "checking";
const ACCEPT = ".pdf,.doc,.docx"; // solo PDF o Word
const isAllowedCv = (name: string) => /\.(pdf|docx?)$/i.test(name);

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function OnboardingView(
  { onDone, resume, forceStep, tutorial }:
  { onDone?: () => void; resume?: boolean; forceStep?: number; tutorial?: boolean },
) {
  const t = useT();
  const lang = useLang();
  const [step, setStep] = useState(1); // 1..3
  const [file, setFile] = useState<CvFile | null>(null);
  const [progress, setProgress] = useState(0); // 0..1
  const [log, setLog] = useState<string[]>([]);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleVariant[]>([]);
  const [softSkills, setSoftSkills] = useState<string[]>([]);
  const [profile, setProfile] = useState<CandidateProfile>(EMPTY_PROFILE);
  const [notebookId, setNotebookId] = useState<string | undefined>(undefined); // notebook de NotebookLM creado
  const [nlmConn, setNlmConn] = useState<NlmConn>("unknown"); // sesión de NotebookLM (gate previo a la ingesta)
  const openedForStep2 = useRef(false); // evita relanzar/abrir el navegador cada vez que se re-renderiza el paso 2
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadOnboarding().then(async (s) => {
      if (s.file) setFile(s.file);
      if (s.roles.length) setRoles(s.roles); // NO marcamos progress=1: al pasar al paso 2 se re-ingesta
      if (s.softSkills?.length) setSoftSkills(s.softSkills);
      if (s.profile) setProfile(s.profile);
      if (s.notebookId) setNotebookId(s.notebookId);
      // Origen SIDEBAR (resume) y el usuario YA tiene su notebook (CV ingestado) → saltar a Mapa de roles
      // (paso 4) para VER lo que mapeó el agente LM. Usamos `notebookId`, NO `done` (que solo se marca al
      // pulsar "Terminar"). "Actualizar CV" (Ajustes, resume=false) arranca en el paso 1 para correr el flujo
      // COMPLETO (el paso 2 borra las fuentes viejas y re-ingesta) y no acumular CVs/contextos.
      if (resume && (s.done || s.notebookId)) { setStep(LAST); setProgress(1); }
      // Arranque normal (App enrutó a onboarding porque falta terminar): RETOMAR el paso guardado para que
      // cerrar y reabrir el programa a mitad del wizard no reinicie al paso 1. (`resume` tiene prioridad.)
      else if (s.step && s.step >= 1 && s.step <= LAST) setStep(s.step);
      // El "Mapa de roles" vivo lo escribe el AGENTE en gary-context.md → si ya mapeó, PREVALECE sobre el
      // seed de onboarding.json. Se corre DESPUÉS del set del seed para que gane de forma determinista.
      const rm = await loadRoleMap();
      if (rm.roles.length) setRoles(rm.roles);
      if (rm.softSkills.length) setSoftSkills(rm.softSkills);
    });
    // Al abrir: chequeo BARATO (lectura de archivo, sin navegador ni polling) de la sesión de NotebookLM.
    notebooklmStatus().then((ok) => setNlmConn(ok ? "connected" : "disconnected"));
    return () => abortRef.current?.abort();
  }, []);


  // Refrescar el mapa de roles cuando la ventana recupera el foco: el agente (en el chat) pudo terminar de
  // mapear roles/skills en gary-context.md mientras mirabas otra cosa. Sólo pisa roles/soft-skills si el
  // agente ya produjo algo (no borra tus ediciones ni toca el formulario de perfil).
  useEffect(() => {
    const refresh = () => loadRoleMap().then((rm) => {
      if (rm.roles.length) setRoles(rm.roles);
      if (rm.softSkills.length) setSoftSkills(rm.softSkills);
    });
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Ingesta completa = barra al 100%. NO exigimos roles: el ingest determinista NO los detecta (eso lo hace
  // el agente LM leyendo el CV/NotebookLM); sembramos un mapa base editable en el paso 3 para no bloquear.
  const ingestDone = progress >= 1;
  const profileValid =
    !!profile.location.trim() && profile.modality.length > 0 &&
    !!profile.salaryMin.trim() && !!profile.currency &&
    !!profile.phone.trim() && !!profile.email.trim();
  const canContinue =
    step === 1 ? !!file : step === 2 ? ingestDone : step === 3 ? profileValid : true; // paso 4 (roles) = siempre
  // Paso MOSTRADO: en el tutorial forzamos la sub-vista sin tocar el estado real (`step`); fuera del tutorial
  // es el paso real. Solo afecta el render (la interacción está bloqueada por el scrim del overlay).
  const activeStep = tutorial && forceStep ? forceStep : step;

  // Persistencia parcial (mantiene todos los campos requeridos del estado). Incluye `step` para retomar.
  const persist = (patch: Partial<{ roles: RoleVariant[]; softSkills: string[]; profile: CandidateProfile; notebookId: string; step: number }>) => {
    if (!file) return;
    saveOnboarding({ done: false, file, roles, softSkills, profile, notebookId, step, ...patch });
  };

  // Recordar el paso entre reinicios: si el usuario cierra el programa a mitad del onboarding, al reabrir
  // retoma donde iba (no vuelve al paso 1). Sólo persistimos con CV ya subido (los pasos con estado que vale
  // la pena retomar); el paso 1 sin archivo es el arranque por defecto y no necesita guardarse.
  // En modo tutorial NO persistimos (el paso se fuerza solo para mostrar; no debe pisar el paso real guardado).
  useEffect(() => { if (file && !tutorial) persist({ step }); }, [step, file]);

  // Al ENTRAR al paso 2 (Ingestar) sin sesión lista, sólo dejamos el paso en "pending" para que el usuario
  // pulse "Verificar sesión". NO abrimos el navegador de automatización: la autenticación de NotebookLM la
  // hace el plugin con su propio Chrome (`login --force`), y levantar :9333 aquí sólo abría una ventana inútil.
  useEffect(() => {
    if (tutorial) { openedForStep2.current = false; return; } // en tutorial no tocamos el estado (solo mostramos)
    if (step !== 2) { openedForStep2.current = false; return; }
    if (openedForStep2.current) return;
    if (nlmConn !== "disconnected") return; // unknown/pending/connected/checking → nada
    openedForStep2.current = true;
    setNlmConn("pending");
  }, [step, nlmConn]);

  async function onPick(f: File) {
    if (!isAllowedCv(f.name)) {
      setError(t("ob.cv.error"));
      return;
    }
    setError(null);
    // Persistimos los bytes a disco YA (data/cv/base/<name>) para que la ingesta pueda `sources add-file`
    // esa ruta. En modo web/degradado save_cv falla → guardamos sólo {name,size} y la ingesta simula.
    try { setFile(await saveCv(f)); }
    catch { setFile({ name: f.name, size: f.size }); }
  }
  function removeFile() {
    abortRef.current?.abort();
    setFile(null); setProgress(0); setLog([]); setRoles([]); setIngesting(false); setError(null);
  }

  async function startIngest(f: CvFile) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    // Anti-simulación engañosa: si NotebookLM está conectado (backend real) pero el CV no quedó en disco,
    // NO simulamos un "notebook creado" falso — avisamos para re-subir el CV (así el create real puede correr).
    if (nlmConn === "connected" && !f.path) { setError(t("ob.nlm.nopath")); return; }
    setIngesting(true); setError(null); setProgress(0); setLog([]); setRoles([]);
    const onEvent = (e: IngestEvent) => {
      if (ac.signal.aborted) return;
      if (e.kind === "log") setLog((l) => [...l, e.line]);
      else if (e.kind === "progress") setProgress(e.value);
      else if (e.kind === "roles") setRoles(e.roles);
      else if (e.kind === "profile") setProfile((p) => mergeProfile(p, e.profile)); // autocompleta desde el CV
      else if (e.kind === "notebook") { setNotebookId(e.id); persist({ notebookId: e.id }); } // guarda el notebook creado
      else if (e.kind === "error") {
        setError(e.message);
        // Un fallo de ingesta suele ser sesión no válida (Gmail ≠ NotebookLM): vuelve al gate para re-verificar
        // honestamente (el engine valida de verdad contra NotebookLM antes de dar "conectado").
        setNlmConn("pending");
      }
    };
    // notebookId presente = reemplazo de CV → el core reutiliza el notebook en vez de crear uno nuevo.
    // El ingest determinista solo crea+indexa; NO detecta roles/skills (eso lo hace el agente LM luego).
    // Roles queda vacío a propósito → el paso 4 muestra el texto informativo. "Continuar" no depende de roles.
    try { await runIngest(f, onEvent, ac.signal, notebookId || undefined); }
    catch (err) { if (!ac.signal.aborted) setError(String(err)); }
    finally { if (!ac.signal.aborted) setIngesting(false); }
  }

  // Conectar NotebookLM: no abrimos nada nosotros — el plugin abre SU propio Chrome al verificar. Este botón
  // sólo deja el paso listo para pulsar "Verificar sesión".
  function connectNlm() {
    setError(null);
    setNlmConn("pending");
  }
  // Verificar sesión: delega TODO en el plugin (`login --force`), que abre su Chrome, espera el login de Google
  // y guarda las cookies. Si la sesión de ese perfil sigue viva, vuelve al instante sin interacción; si caducó,
  // el usuario entra en la ventana. Damos margen a ese login interactivo (el plugin sondea hasta 5 min).
  async function verifyNlm() {
    if (nlmConn === "checking") return;
    setNlmConn("checking");
    const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), 6 * 60_000));
    const ok = await Promise.race([connectNotebooklm(), timeout]);
    setNlmConn(ok ? "connected" : "pending");
    if (ok && file && !ingestDone && !ingesting) startIngest(file);
  }

  function goNext() {
    if (!canContinue) return;
    if (step === 1 && file) {
      setStep(2);
      // Sólo ingesta si la sesión de NotebookLM ya está lista; si no, el paso 2 muestra el gate "Conectar".
      if (nlmConn === "connected" && !ingestDone && !ingesting) startIngest(file);
    }
    else if (step < LAST) setStep(step + 1);
    else finish();
  }
  function goBack() { setStep((s) => Math.max(1, s - 1)); }

  async function finish() {
    await saveOnboarding({ done: true, file, roles, softSkills, profile, notebookId });
    onDone?.(); // entra al Chat DE INMEDIATO — no bloquear en la ingesta de contexto
    // Ingesta de skills/roles/respuestas al MISMO notebook, en SEGUNDO PLANO (best-effort): spawnea el
    // plugin + RPC (puede tardar), así que no debe retrasar la entrada al chat ni colgar el botón "Terminar".
    if (notebookId) { void ingestContext(notebookId, roles, softSkills, profile).catch(() => {}); }
  }

  function editRoleStack(id: string, stack: string[]) {
    const next = roles.map((r) => (r.id === id ? { ...r, stack } : r));
    setRoles(next);
    persist({ roles: next });
  }
  function editSoftSkills(next: string[]) {
    setSoftSkills(next);
    persist({ softSkills: next });
  }

  return (
    <div className="view">
      <header className="viewhead">
        <h1 className="viewhead__title">{t("nav.onboarding")}</h1>
        {/* Selector de idioma (por defecto el actual) — visible en TODO el onboarding para elegir al llegar.
            La misma opción vive en Ajustes. */}
        <label className="viewhead__lang">
          <select className="input" value={lang} onChange={(e) => setLang(e.currentTarget.value as Lang)}
                  aria-label={t("lang.title")} title={t("lang.title")}>
            {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <TutorialButton />
      </header>

      <div className="onboard">
        <div className="onboard__hero">
          <Avatar kind="brand" size={64} />
          <h2 className="onboard__title">{t("ob.welcome")}</h2>
          <p className="onboard__subtitle">{t("ob.welcomeSub")}</p>
        </div>

        <Stepper step={activeStep} onJump={(n) => { if (n < step) setStep(n); }} />

        {activeStep === 1 && <CvUpload file={file} onPick={onPick} onRemove={removeFile} error={error} />}
        {activeStep === 2 && nlmConn !== "connected" && (
          <NlmConnect conn={nlmConn} error={error} onConnect={connectNlm} onVerify={verifyNlm} />
        )}
        {activeStep === 2 && nlmConn === "connected" && (
          <IngestProgress file={file} progress={progress} log={log} ingesting={ingesting} error={error}
                          onRetry={() => file && startIngest(file)} />
        )}
        {activeStep === 3 && (
          <ProfileForm profile={profile} onChange={(p) => { setProfile(p); persist({ profile: p }); }} />
        )}
        {activeStep === 4 && (
          <RoleMap roles={roles} onEdit={editRoleStack} softSkills={softSkills} onEditSoft={editSoftSkills} />
        )}

        <div className="onboard__nav">
          <Button variant="ghost" onClick={goBack} disabled={activeStep === 1}>{t("ob.back")}</Button>
          <Button variant="primary" onClick={goNext} disabled={!canContinue}>
            {activeStep === LAST ? t("ob.finish") : t("ob.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Stepper ----------
function Stepper({ step, onJump }: { step: number; onJump: (n: number) => void }) {
  const t = useT();
  const fill = ((step - 1) / (STEPS.length - 1)) * 100;
  return (
    <div className="stepper" role="list" aria-label="Progreso de onboarding">
      <div className="stepper__track" aria-hidden><span className="stepper__fill" style={{ width: `${fill}%` }} /></div>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "active" : "todo";
        return (
          <button
            key={label} role="listitem" className={`step step--${state}`}
            onClick={() => n < step && onJump(n)} disabled={n >= step}
            aria-current={n === step ? "step" : undefined}
          >
            <span className="step__dot">{state === "done" ? <Check width={14} height={14} /> : n}</span>
            <span className="step__label">{t(label)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- CvUpload ----------
function CvUpload({ file, onPick, onRemove, error }: { file: CvFile | null; onPick: (f: File) => void; onRemove: () => void; error?: string | null }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  if (file) {
    return (
      <div className="onboard__body">
        <div className="filechip">
          <span className="filechip__icon"><File width={18} height={18} /></span>
          <span className="filechip__meta">
            <span className="filechip__name">{file.name}</span>
            <span className="filechip__size">{fmtSize(file.size)}</span>
          </span>
          <button className="filechip__x" onClick={onRemove} aria-label="Quitar archivo"><X width={16} height={16} /></button>
        </div>
        <p className="onboard__hint">{t("ob.cv.consolidated")}</p>
      </div>
    );
  }

  return (
    <div className="onboard__body">
      <div
        className={`cvupload ${drag ? "cvupload--drag" : ""}`}
        role="button" tabIndex={0}
        aria-label="Subir CV: arrastra y suelta o pulsa para elegir archivo"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onPick(f); }}
      >
        <span className="cvupload__icon"><Upload width={22} height={22} /></span>
        <span className="cvupload__title">{t("ob.cv.drag")}</span>
        <span className="cvupload__hint">{t("ob.cv.browse")}</span>
        <input ref={inputRef} type="file" accept={ACCEPT} hidden
               onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
      </div>
      {error && <p className="cvupload__error" role="alert">{error}</p>}
    </div>
  );
}

// ---------- NlmConnect (gate de sesión NotebookLM, patrón Conexiones: manual, un solo tiro, sin polling) ----------
function NlmConnect({
  conn, error, onConnect, onVerify,
}: { conn: NlmConn; error: string | null; onConnect: () => void; onVerify: () => void }) {
  const t = useT();
  return (
    <div className="onboard__body">
      <div className="nlmconnect">
        <div className="nlmconnect__head">
          <Avatar kind="brand" size={40} />
          <div>
            <h3 className="nlmconnect__title">{t("ob.nlm.title")}</h3>
            <p className="nlmconnect__hint">{t("ob.nlm.hint")}</p>
          </div>
        </div>
        <div className="nlmconnect__status">
          {conn === "checking"
            ? <span className="conn__state conn__state--muted"><Loader width={14} height={14} /> {t("conn.checking")}</span>
            : conn === "pending"
              ? <span className="conn__state conn__state--muted"><StatusDot status="warning" /> {t("ob.nlm.pending")}</span>
              : <span className="conn__state"><StatusDot status="info" /> {t("ob.nlm.disconnected")}</span>}
        </div>
        <div className="nlmconnect__actions">
          {conn === "pending" || conn === "checking"
            ? <Button variant="primary" onClick={onVerify} disabled={conn === "checking"}>{t("conn.verify")}</Button>
            : <Button variant="primary" onClick={onConnect}>{t("conn.connect")}</Button>}
        </div>
        {error && <p className="cvupload__error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

// ---------- IngestProgress ----------
function IngestProgress({
  file, progress, log, ingesting, error, onRetry,
}: { file: CvFile | null; progress: number; log: string[]; ingesting: boolean; error: string | null; onRetry: () => void }) {
  const t = useT();
  const pct = Math.round(progress * 100);
  return (
    <div className="onboard__body">
      {file && (
        <div className="filechip filechip--done">
          <span className="filechip__icon"><Check width={16} height={16} /></span>
          <span className="filechip__meta"><span className="filechip__name">{file.name}</span><span className="filechip__size">{fmtSize(file.size)}</span></span>
        </div>
      )}
      <div className="ingest">
        <div className="ingest__head">
          <span className="ingest__label">
            {ingesting && <Loader width={14} height={14} />}
            {error ? t("ob.ingest.error") : pct >= 100 ? t("ob.ingest.done") : t("ob.ingest.doing")}
          </span>
          <span className="ingest__pct">{pct}%</span>
        </div>
        <div className="ingest__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span className="ingest__fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="ingest__log" aria-live="polite">
          {log.map((line, i) => <div key={i} className="ingest__line">{line}</div>)}
        </div>
        {error && (
          <div className="ingest__error" role="alert">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={onRetry}>{t("ob.retry")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- RoleMap (+ soft skills) ----------
function RoleMap({
  roles, onEdit, softSkills, onEditSoft,
}: {
  roles: RoleVariant[]; onEdit: (id: string, stack: string[]) => void;
  softSkills: string[]; onEditSoft: (next: string[]) => void;
}) {
  const t = useT();
  // Primera vez (aún no hay mapa): solo texto informativo. El agente LM mapeará roles/skills/soft-skills
  // leyendo el CV + NotebookLM cuando inicies el proceso en el chat. Soft skills OCULTAS hasta que existan.
  if (roles.length === 0) {
    return (
      <div className="onboard__body">
        <div className="rolemap-empty">
          <Avatar kind="brand" size={44} />
          <h3 className="rolemap-empty__title">{t("ob.roles.empty.title")}</h3>
          <p className="rolemap-empty__desc">{t("ob.roles.empty.desc")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="onboard__body">
      <p className="onboard__hint">{t("ob.roles.hint")}</p>
      <div className="rolemap">
        {roles.map((r) => <RoleCard key={r.id} role={r} onEdit={onEdit} />)}
      </div>
      <div className="rolecard">
        <h3 className="rolecard__title">{t("ob.softskills")}</h3>
        <div className="rolecard__stack">
          {softSkills.map((t) => <Chip key={t} label={t} removable onRemove={() => onEditSoft(softSkills.filter((x) => x !== t))} />)}
          <AddTag ariaLabel="Añadir habilidad blanda"
                  onAdd={(t) => { if (!softSkills.includes(t)) onEditSoft([...softSkills, t]); }} />
        </div>
      </div>
    </div>
  );
}

// Input+botón reutilizable para añadir un tag a un stack.
function AddTag({ onAdd, ariaLabel }: { onAdd: (t: string) => void; ariaLabel: string }) {
  const t = useT();
  const [adding, setAdding] = useState("");
  const add = () => { const v = adding.trim(); if (v) onAdd(v); setAdding(""); };
  return (
    <span className="rolecard__add">
      <input value={adding} placeholder={t("ob.add")} aria-label={ariaLabel}
             onChange={(e) => setAdding(e.target.value)}
             onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
      <button onClick={add} aria-label="Añadir" disabled={!adding.trim()}><Plus width={14} height={14} /></button>
    </span>
  );
}

// ---------- ProfileForm (paso 4: preguntas típicas de aplicación) ----------
const MODALITIES: { id: WorkModality; label: string }[] = [
  { id: "remoto", label: "Remoto" },
  { id: "hibrido", label: "Híbrido" },
  { id: "presencial", label: "Presencial" },
];

const ALL_MODS: WorkModality[] = ["remoto", "hibrido", "presencial"];

// Autocompletado: rellena SOLO los campos vacíos con lo extraído del CV (no pisa lo que el usuario escribió).
function mergeProfile(base: CandidateProfile, patch: Partial<CandidateProfile>): CandidateProfile {
  const keep = (v: string) => v.trim().length > 0;
  return {
    location: keep(base.location) ? base.location : patch.location ?? base.location,
    modality: base.modality.length ? base.modality : patch.modality ?? base.modality,
    modalityCondition: keep(base.modalityCondition) ? base.modalityCondition : patch.modalityCondition ?? base.modalityCondition,
    salaryMin: keep(base.salaryMin) ? base.salaryMin : patch.salaryMin ?? base.salaryMin,
    currency: base.currency && base.currency !== "USD" ? base.currency : patch.currency ?? base.currency,
    phone: keep(base.phone) ? base.phone : patch.phone ?? base.phone,
    email: keep(base.email) ? base.email : patch.email ?? base.email,
    links: base.links.length ? base.links : patch.links ?? base.links,
  };
}

function ProfileForm({ profile, onChange }: { profile: CandidateProfile; onChange: (p: CandidateProfile) => void }) {
  const t = useT();
  const set = (p: Partial<CandidateProfile>) => onChange({ ...profile, ...p });
  const toggleMod = (m: WorkModality) =>
    set({ modality: profile.modality.includes(m) ? profile.modality.filter((x) => x !== m) : [...profile.modality, m] });
  const allSelected = ALL_MODS.every((m) => profile.modality.includes(m));
  const toggleAll = () =>
    set(allSelected ? { modality: [], modalityCondition: "" } : { modality: [...ALL_MODS] });

  const editLink = (i: number, p: Partial<ContactLink>) =>
    set({ links: profile.links.map((l, idx) => (idx === i ? { ...l, ...p } : l)) });

  return (
    <div className="onboard__body">
      <p className="onboard__hint">{t("ob.profile.hint")}</p>
      <div className="profileform">
        <label className="field">
          <span className="field__label">{t("ob.loc")}</span>
          <input className="input" value={profile.location} placeholder={t("ob.loc.ph")}
                 onChange={(e) => set({ location: e.target.value })} />
        </label>

        <div className="field">
          <span className="field__label">{t("ob.modality")}</span>
          <div className="profileform__chips">
            {MODALITIES.map((m) => (
              <Chip key={m.id} label={t(`ob.mod.${m.id}`)} active={profile.modality.includes(m.id)} onClick={() => toggleMod(m.id)} />
            ))}
            <Chip label={t("ob.mod.all")} active={allSelected} onClick={toggleAll} />
          </div>
          {allSelected && (
            <input className="input" value={profile.modalityCondition}
                   placeholder={t("ob.mod.cond.ph")}
                   onChange={(e) => set({ modalityCondition: e.target.value })} />
          )}
        </div>

        <label className="field">
          <span className="field__label">{t("ob.salary")}</span>
          <span className="profileform__salary">
            <input className="input" type="number" inputMode="numeric" value={profile.salaryMin} placeholder="0"
                   aria-label="Salario mínimo" onChange={(e) => set({ salaryMin: e.target.value })} />
            <select className="input" aria-label="Moneda" value={profile.currency}
                    onChange={(e) => set({ currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </span>
        </label>

        <label className="field">
          <span className="field__label">{t("ob.phone")}</span>
          <input className="input" type="tel" value={profile.phone} placeholder="+00 000 000 0000"
                 onChange={(e) => set({ phone: e.target.value })} />
        </label>

        <label className="field">
          <span className="field__label">{t("ob.email")}</span>
          <input className="input" type="email" value={profile.email} placeholder="you@email.com"
                 onChange={(e) => set({ email: e.target.value })} />
        </label>

        <div className="field">
          <span className="field__label">{t("ob.links")}</span>
          <span className="field__helper">{t("ob.links.hint")}</span>
          <div className="linkrows">
            {profile.links.map((l, i) => (
              <div className="linkrow" key={i}>
                <input className="input linkrow__label" value={l.label} placeholder={t("ob.link.label.ph")}
                       aria-label={t("ob.link.label.ph")} onChange={(e) => editLink(i, { label: e.target.value })} />
                <input className="input linkrow__url" value={l.url} placeholder="https://…" inputMode="url"
                       aria-label="URL del enlace" onChange={(e) => editLink(i, { url: e.target.value })} />
                <button className="linkrow__x" aria-label="Quitar enlace"
                        onClick={() => set({ links: profile.links.filter((_, idx) => idx !== i) })}><X width={16} height={16} /></button>
              </div>
            ))}
            <Button variant="secondary" size="sm" iconLeft={<Plus width={14} height={14} />}
                    onClick={() => set({ links: [...profile.links, { label: "", url: "" }] })}>
              {t("ob.addlink")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleCard({ role, onEdit }: { role: RoleVariant; onEdit: (id: string, stack: string[]) => void }) {
  const [adding, setAdding] = useState("");
  const remove = (tag: string) => onEdit(role.id, role.stack.filter((t) => t !== tag));
  const add = () => {
    const t = adding.trim();
    if (t && !role.stack.includes(t)) onEdit(role.id, [...role.stack, t]);
    setAdding("");
  };
  return (
    <div className="rolecard">
      <h3 className="rolecard__title">{role.label}</h3>
      <div className="rolecard__stack">
        {role.stack.map((tag) => <Chip key={tag} label={tag} removable onRemove={() => remove(tag)} />)}
        <span className="rolecard__add">
          <input value={adding} placeholder="Añadir…" aria-label={`Añadir tecnología a ${role.label}`}
                 onChange={(e) => setAdding(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <button onClick={add} aria-label="Añadir" disabled={!adding.trim()}><Plus width={14} height={14} /></button>
        </span>
      </div>
    </div>
  );
}
