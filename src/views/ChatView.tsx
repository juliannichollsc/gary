// GARY 🐾 — Chat view (spec 01, components.md §B). The chat IS a real system terminal (PTY) opened
// at the project root, skinned from the same tokens so chat + terminal read as one surface. We do NOT
// preload any LLM: the user types `claude` / `gemini` / `opencode` in the terminal to start their agent,
// which then loads GARY's .claude/ skills + agents + docs. All the intelligence lives in the docs.
// The composer chips are just common task prompts sent verbatim to the terminal (no launcher buttons).
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Send } from "../icons";
import { cssVar, type Theme } from "../theme";
import { FilterPreflight } from "../components/FilterPreflight";
import { TutorialButton } from "../components/TutorialButton";
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

function xtermTheme() {
  return {
    background: cssVar("--bg"),
    foreground: cssVar("--text"),
    cursor: cssVar("--accent"),
    selectionBackground: cssVar("--accent-soft"),
  };
}

export function ChatView({ theme, active = true, seed, onSeedConsumed }: {
  theme: Theme; active?: boolean; seed?: string | null; onSeedConsumed?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [preflight, setPreflight] = useState(false); // overlay breve al iniciar una búsqueda
  const t = useT();

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
      fontFamily: 'var(--font-mono), ui-monospace, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: xtermTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const un1 = listen<string>("pty://data", (e) => term.write(e.payload));
    const un2 = listen("pty://exit", () =>
      term.write("\r\n\x1b[33m[GARY] sesión de la terminal terminada\x1b[0m\r\n"));
    term.onData((d) => { invoke("write_stdin", { data: d }); });

    const doFit = () => { fit.fit(); invoke("resize_pty", { rows: term.rows, cols: term.cols }); };
    window.addEventListener("resize", doFit);

    // Welcome banner (guides the non-technical user). No agent is started automatically.
    term.writeln(`\x1b[38;2;206;129;45m${translate(getLang(), "ch.banner1")}\x1b[0m`);
    term.writeln(translate(getLang(), "ch.banner2"));
    term.writeln(translate(getLang(), "ch.banner3"));
    term.writeln("");

    // Open the real system shell at the project root. CWD "." → Rust resolves it to project root.
    invoke("open_terminal")
      .then(doFit)
      .catch((err) => term.writeln(`\x1b[31m[error] no se pudo abrir la terminal: ${err}\x1b[0m`));

    return () => {
      window.removeEventListener("resize", doFit);
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
      if (term) { invoke("resize_pty", { rows: term.rows, cols: term.cols }); term.focus(); }
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

  const send = (text: string, isSearch = false) => {
    if (isSearch) setPreflight(true); // arranca el preflight breve
    invoke("write_stdin", { data: text + "\r" });
    termRef.current?.focus();
  };

  return (
    <div className="chat">
      <header className="viewhead">
        <h1 className="viewhead__title">Chat</h1>
        <span className="badge badge--mono">{t("ch.badge")}</span>
        <TutorialButton />
      </header>

      <div className="chat__term" onClick={() => termRef.current?.focus()}>
        <div ref={hostRef} className="chat__xterm" />
        {preflight && <FilterPreflight onDone={() => setPreflight(false)} />}
      </div>

      <div className="composer">
        <div className="composer__quick">
          {QUICK.map((q) => (
            <button key={q.key} className="chip" onClick={() => send(t(q.prompt ?? q.key), q.search)}>{t(q.key)}</button>
          ))}
        </div>
        <form
          className="composer__input"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) { send(draft); setDraft(""); }
          }}
        >
          <input
            ref={inputRef} name="msg" value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={t("ch.placeholder")} autoComplete="off" aria-label="GARY"
          />
          <button type="submit" className="composer__send" aria-label="Enviar"><Send width={16} height={16} /></button>
        </form>
      </div>
    </div>
  );
}
