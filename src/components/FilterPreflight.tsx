// GARY 🐾 — Filter preflight (spec 06 / components.md §H "LoadingState"). A BRIEF overlay shown when a
// search/filter starts from the chat: it checks the automation browser + which sites are ready, then
// dissolves to reveal the live terminal — because the user must see the real terminal (token spend + how
// their LLM agent works) in real time. This is a transient status, NOT a full-screen loader.
//
// Trigger is a stub for now (fired from ChatView on a search action). Spec 07 will drive it from real
// engine events (engine://data) as each channel finishes its sweep.
import { useEffect, useRef, useState } from "react";
import { Check, Loader } from "../icons";
import { useT } from "../i18n";

const SITES = ["LinkedIn", "Gmail", "GetOnBoard", "Himalayas", "Indeed", "Computrabajo"];

export function FilterPreflight({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [ready, setReady] = useState<Set<string>>(new Set());
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setReady(new Set(SITES));
      const t = window.setTimeout(() => doneRef.current(), 900);
      return () => clearTimeout(t);
    }
    const timers: number[] = [];
    SITES.forEach((s, i) => {
      timers.push(window.setTimeout(() => setReady((p) => new Set(p).add(s)), 350 + i * 420));
    });
    timers.push(window.setTimeout(() => doneRef.current(), 350 + SITES.length * 420 + 650));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="preflight" role="status" aria-live="polite" aria-label="Iniciando búsqueda">
      <div className="preflight__card">
        <div className="preflight__head">
          <Loader width={16} height={16} />
          <span>{t("pf.title")}</span>
        </div>

        <div className="preflight__row preflight__row--ok">
          <Check width={15} height={15} />
          <span className="preflight__name">{t("pf.browser")}</span>
          <span className="preflight__state">{t("pf.connected")}</span>
        </div>

        <ul className="preflight__list">
          {SITES.map((s) => {
            const ok = ready.has(s);
            return (
              <li key={s} className={`preflight__row ${ok ? "preflight__row--ok" : ""}`}>
                {ok ? <Check width={15} height={15} /> : <Loader width={15} height={15} />}
                <span className="preflight__name">{s}</span>
                <span className="preflight__state">{ok ? t("pf.ready") : t("pf.reviewing")}</span>
              </li>
            );
          })}
        </ul>

        <p className="preflight__note">{t("pf.note")}</p>
      </div>
    </div>
  );
}
