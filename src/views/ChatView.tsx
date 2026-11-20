// GARY 🐾 — Chat view (spec 01, components.md §B). The chat IS a real system terminal (PTY) opened
// at the project root, skinned from the same tokens so chat + terminal read as one surface. We do NOT
// preload any LLM: the user types `claude` / `gemini` / `opencode` in the COMPOSER to start their agent,
// which then loads GARY's .claude/ skills + agents + docs. All the intelligence lives in the docs.
// ONE input: the terminal is output-only; everything is typed in the composer (empty composer → ↑↓/Enter/
// Esc/Tab reach the terminal for the agent's menus). While the agent works the composer shows "pensando…".
// The composer chips are just common task prompts sent verbatim to the terminal (no launcher buttons).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Send, TerminalIcon, Globe, Cpu, RotateCcw, X } from "../icons";
import { cssVar, type Theme } from "../theme";
import { FilterPreflight } from "../components/FilterPreflight";
import { StatusDot } from "../components/ui";
import { useBrowserStatus } from "../hooks";
import { loadSettings, startBrowser } from "../settings";
import { useToast } from "../toast";
import { useT, translate, getLang } from "../i18n";

// Chips de acción rápida: se envían (traducidos) a la terminal. `search` dispara el preflight breve.
// Chips de tareas comunes. `key` = etiqueta del chip; `prompt` (opcional) = texto REAL enviado al agente
// (para instrucciones más largas que la etiqueta). `search` = arranca el preflight breve.
const QUICK: { key: string; prompt?: string; search?: boolean }[] = [
  { key: "ch.quick.search", search: true },
  { key: "ch.quick.gmail" },
  { key: "ch.quick.continue", search: true },
  { key: "ch.quick.map" },
  { key: "ch.quick.filters", prompt: "ch.quick.filters.prompt" },
];

// Tema COMPLETO de xterm desde los tokens: fondo/texto/cursor + los 16 colores ANSI (--term-*). Sin la
// paleta ANSI, la salida de claude/gemini/engines usa los primarios de xterm, que chocan con la marca.
const ANSI = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
function xtermTheme() {
  const theme: Record<string, string> = {
    background: cssVar("--bg"),
    foreground: cssVar("--text"),
    cursor: cssVar("--accent"),
    cursorAccent: cssVar("--bg"),
    selectionBackground: cssVar("--accent-soft"),
  };
  for (const c of ANSI) {
    theme[c] = cssVar(`--term-${c}`);
    theme[`bright${cap(c)}`] = cssVar(`--term-bright-${c}`);
  }
  return theme;
}

// xterm dibuja en canvas: NO entiende `var(--font-mono)` → hay que pasarle la familia ya resuelta.
const monoFont = () => cssVar("--font-mono") || "ui-monospace, monospace";

// Detección best-effort del agente que el usuario lanza en la terminal: una línea que es EXACTAMENTE el
// nombre de un CLI soportado (opcionalmente con flags) → ese es el agente activo. Sólo informativo (barra
// de estado); GARY nunca lanza ni elige el CLI por el usuario.
const AGENT_RE = /^\s*(claude|gemini|opencode|codex)(\s+-.*)?\s*$/;
export function detectAgent(line: string): string | null {
  const m = AGENT_RE.exec(line);
  return m ? m[1] : null;
}

export function ChatView({ theme, active = true, seed, onSeedConsumed }: {
  theme: Theme; active?: boolean; seed?: string | null; onSeedConsumed?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [preflight, setPreflight] = useState(false); // overlay breve al iniciar una búsqueda
  const t = useT();
  const toast = useToast();
  // Barra de estado: sesión de la terminal, agente detectado, navegador :9333 y engines en ejecución.
  const [session, setSession] = useState<"starting" | "alive" | "ended" | "error">("starting");
  const [agent, setAgent] = useState<string | null>(null);
  const [engines, setEngines] = useState<Set<number>>(new Set());
  const [startingBrowser, setStartingBrowser] = useState(false);
  const browser = useBrowserStatus(active);
  const lineBuf = useRef(""); // línea que el usuario está tecleando (para detectAgent)
  // "Pensando…": se activa al enviar y se apaga cuando la salida del PTY queda quieta. Los CLIs (claude,
  // gemini) animan su spinner mientras trabajan → hay salida continua; al terminar o al pedir permiso, se
  // detiene. Heurística sin parsear la UI del CLI: >1.4s sin salida (y >0.9s desde el envío) = libre.
  const [busy, setBusy] = useState(false);
  const lastOut = useRef(0);
  const sentAt = useRef(0);
  const agentRef = useRef<string | null>(null);
  agentRef.current = agent;

  // Alimenta el detector de agente con lo que va a stdin (teclas de xterm + chips/composer).
  const track = (data: string) => {
    if (data.startsWith("\x1b")) return; // flechas / secuencias de escape: no son texto de la línea
    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        const a = detectAgent(lineBuf.current);
        if (a) setAgent(a);
        lineBuf.current = "";
      } else if (ch === "\x7f" || ch === "\b") {
        lineBuf.current = lineBuf.current.slice(0, -1);
      } else if (ch === "\x03" || ch === "\x15") {
        lineBuf.current = ""; // Ctrl+C / Ctrl+U
      } else if (ch >= " ") {
        lineBuf.current += ch;
      }
    }
  };

  // Abre (o reabre) el shell del sistema en la raíz del proyecto. Error → estado visible + toast.
  const openTerminal = (term: Terminal, fit: FitAddon) => {
    setSession("starting");
    return invoke("open_terminal")
      .then(() => {
        setSession("alive");
        fit.fit();
        invoke("resize_pty", { rows: term.rows, cols: term.cols });
      })
      .catch((err) => {
        setSession("error");
        term.writeln(`\x1b[31m[error] ${translate(getLang(), "ch.term.error")}: ${err}\x1b[0m`);
        toast.show({ type: "danger", message: `${translate(getLang(), "ch.term.error")}: ${err}` });
      });
  };

  const writeBanner = (term: Terminal) => {
    term.writeln(`\x1b[38;2;206;129;45m${translate(getLang(), "ch.banner1")}\x1b[0m`);
    term.writeln(translate(getLang(), "ch.banner2"));
    term.writeln(translate(getLang(), "ch.banner3"));
    term.writeln("");
  };

  const restartTerminal = () => {
    const term = termRef.current, fit = fitRef.current;
    if (!term || !fit) return;
    term.reset();
    setAgent(null);
    lineBuf.current = "";
    writeBanner(term);
    openTerminal(term, fit).then(() => inputRef.current?.focus());
  };

  const onStartBrowser = async () => {
    setStartingBrowser(true);
    const cfg = await loadSettings();
    const s = await startBrowser(cfg.browser, cfg.browserPort);
    setStartingBrowser(false);
    if (s?.running) { browser.setStatus(s); toast.show({ type: "success", message: t("toast.browser.started") }); }
    else toast.show({ type: "danger", message: t("toast.browser.failed") });
  };

  // Engines lanzados por el core (run_engine) → contador en la barra. run_id 0 = aviso del core, no un run.
  useEffect(() => {
    const unData = listen<{ run_id: number }>("engine://data", (e) => {
      const id = e.payload.run_id;
      if (id) setEngines((s) => (s.has(id) ? s : new Set(s).add(id)));
    });
    const unExit = listen<{ run_id: number }>("engine://exit", (e) => {
      setEngines((s) => { const n = new Set(s); n.delete(e.payload.run_id); return n; });
    });
    return () => { unData.then((f) => f()); unExit.then((f) => f()); };
  }, []);

  // Apply-intent handoff from the Offers map (spec 04): prefill the composer with the Spanish prompt so
  // the user reviews and sends it to the supervisor. We never auto-send — "el click final es tuyo".
  useEffect(() => {
    if (!seed) return;
    setDraft(seed);
    inputRef.current?.focus();
    onSeedConsumed?.();
  }, [seed]);

  // Boot the terminal once. We open the *system shell* (no LLM preloaded) at the project root, so any
  // agent the user launches sees .claude/. The user types the CLI (`claude` / `gemini` / …) themselves.
  useEffect(() => {
    if (!hostRef.current) return;
    const term = new Terminal({
      fontFamily: monoFont(),
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      allowProposedApi: false,
      theme: xtermTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    // Las fuentes van empaquetadas (@fontsource) pero cargan async: al estar listas, re-aplicamos la familia
    // para que xterm re-mida las celdas con JetBrains Mono (si no, queda medido con el fallback).
    document.fonts?.ready.then(() => { term.options.fontFamily = monoFont(); fit.fit(); });

    const un1 = listen<string>("pty://data", (e) => { lastOut.current = Date.now(); term.write(e.payload); });
    const un2 = listen("pty://exit", () => {
      setSession("ended");
      setAgent(null);
      term.write(`\r\n\x1b[33m[GARY] ${translate(getLang(), "ch.term.ended")}\x1b[0m\r\n`);
    });
    // La terminal es SÓLO SALIDA: se escribe únicamente desde el composer del chat (una sola entrada, sin
    // duplicidad). Bloqueamos el teclado y el pegado sobre xterm, pero NO usamos `disableStdin`: eso también
    // cortaría las respuestas automáticas de xterm a las consultas del CLI (cursor/DA), que siguen por onData.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && term.hasSelection()) {
        navigator.clipboard?.writeText(term.getSelection()).catch(() => {}); // copiar sigue funcionando
      }
      return false;
    });
    term.textarea?.addEventListener("paste", (e) => { e.preventDefault(); e.stopPropagation(); }, true);
    term.textarea?.setAttribute("aria-label", translate(getLang(), "ch.term.readonly"));
    term.textarea?.setAttribute("readonly", "");
    term.onData((d) => { invoke("write_stdin", { data: d }); });

    // Re-encuadre por tamaño del CONTENEDOR (no sólo de la ventana): mostrar/ocultar la sidebar cambia el ancho
    // sin disparar window.resize. fit() por frame; el resize del PTY se agrupa (el shell no necesita 15 SIGWINCH).
    let raf = 0, ptyTimer = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!hostRef.current?.offsetWidth) return; // oculto (otra vista activa): xterm mediría 0
        fit.fit();
        clearTimeout(ptyTimer);
        ptyTimer = window.setTimeout(() => invoke("resize_pty", { rows: term.rows, cols: term.cols }), 120);
      });
    });
    ro.observe(hostRef.current);

    // Welcome banner (guides the non-technical user). No agent is started automatically.
    writeBanner(term);

    // Open the real system shell at the project root. CWD "." → Rust resolves it to project root.
    openTerminal(term, fit);

    return () => {
      ro.disconnect(); cancelAnimationFrame(raf); clearTimeout(ptyTimer);
      un1.then((f) => f()); un2.then((f) => f());
      term.dispose();
    };
  }, []);

  // Al reaparecer (volver a la pestaña Chat), la vista estuvo display:none y el xterm quedó medido en 0.
  // Reajustamos al frame siguiente y sincronizamos el tamaño del PTY, luego enfocamos. La sesión NUNCA se
  // desmontó, así que el agente que corría sigue vivo — sólo re-encuadramos.
  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(() => {
      fitRef.current?.fit();
      const term = termRef.current;
      if (term) invoke("resize_pty", { rows: term.rows, cols: term.cols });
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // Re-skin the terminal when the theme flips. Defer to the next frame so the parent has already flipped
  // `data-theme` on <html> (child effects run before parent effects) → xtermTheme() reads the NEW tokens,
  // not the stale ones; then force a full repaint so existing cells recolor.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const raf = requestAnimationFrame(() => {
      term.options.theme = xtermTheme();
      term.refresh(0, term.rows - 1);
    });
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  // Vigila la salida mientras está ocupado → apaga "pensando" cuando el PTY se queda quieto.
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      if (now - sentAt.current > 900 && now - lastOut.current > 1400) setBusy(false);
    }, 250);
    return () => clearInterval(id);
  }, [busy]);

  const markBusy = () => { sentAt.current = Date.now(); lastOut.current = Date.now(); setBusy(true); };
  const write = (data: string) => invoke("write_stdin", { data });

  // Envío desde el composer. El texto y el Enter van en escrituras separadas: los TUIs (ink) tratan un bloque
  // rápido "texto\r" como pegado y no lo envían. Multilínea → bracketed paste para que llegue como un todo.
  const send = (text: string, isSearch = false) => {
    if (isSearch) setPreflight(true); // arranca el preflight breve
    track(text + "\r");
    write(text.includes("\n") ? `\x1b[200~${text}\x1b[201~` : text);
    window.setTimeout(() => write("\r"), 30);
    markBusy();
    inputRef.current?.focus();
  };

  // Con el composer VACÍO, las teclas de navegación pasan a la terminal (menús de permisos del agente:
  // ↑/↓ + Enter, Esc para interrumpir, Tab/Shift+Tab del CLI). Respeta el modo "application cursor".
  const forwardKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (draft !== "") return false;
    const app = termRef.current?.modes.applicationCursorKeysMode;
    const arrows: Record<string, string> = { ArrowUp: "A", ArrowDown: "B", ArrowRight: "C", ArrowLeft: "D" };
    let seq: string | null = null;
    if (arrows[e.key] && !e.shiftKey && !e.altKey && !e.ctrlKey) seq = (app ? "\x1bO" : "\x1b[") + arrows[e.key];
    else if (e.key === "Enter" && !e.shiftKey) seq = "\r";
    else if (e.key === "Escape") seq = "\x1b";
    else if (e.key === "Tab" && agentRef.current) seq = e.shiftKey ? "\x1b[Z" : "\t"; // sin agente, Tab = foco
    else if (e.ctrlKey && e.key.toLowerCase() === "c") seq = "\x03";
    else if (e.ctrlKey && e.key.toLowerCase() === "b" && agentRef.current) seq = "\x02"; // claude: a segundo plano
    if (seq === null) return false;
    e.preventDefault();
    write(seq);
    if (seq === "\r") markBusy();
    return true;
  };

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return; // IME (chino, etc.)
    if (forwardKey(e)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim()) { send(draft); setDraft(""); }
    }
  };

  // Detener: Esc interrumpe al agente (claude/gemini); en el shell, Ctrl+C.
  const stop = () => { write(agentRef.current ? "\x1b" : "\x03"); inputRef.current?.focus(); };

  // Autoajuste del alto del composer (1–6 líneas).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 6 * 24 + 12)}px`;
  }, [draft]);

  const agentName = agent ? agent[0].toUpperCase() + agent.slice(1) : null;

  return (
    <div className="chat">
      <header className="viewhead">
        <h1 className="viewhead__title">Chat</h1>
        <div className="chatstatus" role="status" aria-label={t("ch.status.label")}>
          <span className="chatstatus__item" title={t("ch.status.terminal")}>
            <TerminalIcon width={14} height={14} aria-hidden />
            <StatusDot status={session === "alive" ? "success" : session === "starting" ? "warning" : "danger"}
                       pulse={session === "starting"} />
            <span className="chatstatus__text">{t(`ch.session.${session}`)}</span>
            {(session === "ended" || session === "error") && (
              <button className="chatstatus__action" onClick={restartTerminal}>
                <RotateCcw width={12} height={12} aria-hidden /> {t("ch.term.restart")}
              </button>
            )}
          </span>
          <span className="chatstatus__item" title={t("ch.status.agent")}>
            <span className="chatstatus__key">{t("ch.status.agent")}</span>
            <span className={`chatstatus__val ${agent ? "" : "chatstatus__val--muted"}`}>{agent ?? t("ch.agent.none")}</span>
          </span>
          {browser.known && (
            <span className="chatstatus__item" title={t("ch.status.browser")}>
              <Globe width={14} height={14} aria-hidden />
              <StatusDot status={browser.status.running ? "success" : "danger"} />
              <span className="chatstatus__text">
                {browser.status.running ? t("ch.browser.on") : t("ch.browser.off")}
                <span className="chatstatus__port">:{browser.status.port}</span>
              </span>
              {!browser.status.running && (
                <button className="chatstatus__action" onClick={onStartBrowser} disabled={startingBrowser}>
                  {t("ch.browser.start")}
                </button>
              )}
            </span>
          )}
          {engines.size > 0 && (
            <span className="chatstatus__item" title={t("ch.status.engines")}>
              <Cpu width={14} height={14} aria-hidden />
              <StatusDot status="info" pulse />
              <span className="chatstatus__text">{t("ch.engines.running").replace("{n}", String(engines.size))}</span>
            </span>
          )}
        </div>
      </header>

      {/* Clic en la terminal → el foco va al composer (salvo que el usuario esté seleccionando para copiar). */}
      <div className="chat__term" onMouseUp={() => { if (!termRef.current?.hasSelection()) inputRef.current?.focus(); }}>
        <div ref={hostRef} className="chat__xterm" />
        {preflight && <FilterPreflight onDone={() => setPreflight(false)} />}
      </div>

      <div className="composer">
        {/* Fila superior: mientras el agente trabaja, "pensando" + Detener; si no, las sugerencias rápidas. */}
        {busy ? (
          <div className="composer__busy" role="status" aria-live="polite">
            <span className="thinking" aria-hidden><span /><span /><span /></span>
            <span className="composer__busytext">
              {agentName ? t("ch.thinking").replace("{agent}", agentName) : t("ch.running")}
            </span>
            <button type="button" className="composer__stop" onClick={stop}>
              <X width={12} height={12} aria-hidden /> {t("ch.stop")} <kbd className="kbd">Esc</kbd>
            </button>
          </div>
        ) : (
          <div className="composer__quick">
            {QUICK.map((q) => (
              <button key={q.key} className="chip" onClick={() => send(t(q.prompt ?? q.key), q.search)}>{t(q.key)}</button>
            ))}
          </div>
        )}
        <form
          className="composer__input"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) { send(draft); setDraft(""); }
          }}
        >
          <textarea
            ref={inputRef} name="msg" value={draft} rows={1}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={onComposerKey}
            placeholder={t("ch.placeholder")} autoComplete="off" spellCheck={false}
            aria-label={t("ch.placeholder")} aria-describedby="composer-hint"
          />
          <button type="submit" className="composer__send" aria-label={t("ch.send")} disabled={!draft.trim()}>
            <Send width={16} height={16} />
          </button>
        </form>
        <p className="composer__hint" id="composer-hint">{t("ch.composer.hint")}</p>
      </div>
    </div>
  );
}
