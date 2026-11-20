// GARY 🐾 — Command palette (Ctrl/Cmd+K). One keyboard entry point for the whole app: jump to a view,
// run an app action, prefill a common task in the Chat composer (never auto-sent), or open an offer from
// the map. ARIA combobox + listbox; ↑/↓ move, Enter runs, Esc closes and returns focus where it was.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { Search } from "../icons";
import { useT } from "../i18n";

export type PaletteCommand = {
  id: string;
  group: string;        // encabezado de sección (ya traducido)
  label: string;        // ya traducido
  hint?: string;        // texto secundario a la derecha (canal, atajo…)
  icon?: ReactNode;
  keywords?: string;    // términos extra para el filtro
  run: () => void;
};

// Normaliza para buscar sin tildes ni mayúsculas ("métricas" ≈ "metricas").
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function CommandPalette({ open, onClose, commands }: {
  open: boolean; onClose: () => void; commands: PaletteCommand[];
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return commands.filter((c) => c.group !== t("palette.group.offers"));
    const terms = q.split(/\s+/);
    return commands.filter((c) => {
      const hay = norm(`${c.label} ${c.hint ?? ""} ${c.keywords ?? ""} ${c.group}`);
      return terms.every((w) => hay.includes(w));
    }).slice(0, 40);
  }, [commands, query, t]);

  // Abrir: recordar el foco previo, limpiar, enfocar el input y animar la entrada (escala sutil + fade).
  useLayoutEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    setQuery(""); setActive(0);
    inputRef.current?.focus();
    if (panelRef.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.fromTo(panelRef.current, { opacity: 0, scale: 0.98, y: -6 }, { opacity: 1, scale: 1, y: 0, duration: 0.16, ease: "power2.out" });
    }
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const close = () => { onClose(); returnFocus.current?.focus?.(); };
  const run = (c?: PaletteCommand) => { if (!c) return; onClose(); c.run(); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") { e.preventDefault(); } // foco atrapado en el input (único control)
  };

  // Agrupa preservando el orden de aparición.
  let lastGroup = "";
  return (
    <div className="palette" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="palette__panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={t("palette.title")}>
        <div className="palette__search">
          <Search width={16} height={16} aria-hidden />
          <input
            ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
            placeholder={t("palette.placeholder")} aria-label={t("palette.placeholder")}
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list"
            aria-activedescendant={results[active] ? `palette-opt-${results[active].id}` : undefined}
            autoComplete="off" spellCheck={false}
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <ul className="palette__list" id="palette-list" role="listbox" ref={listRef} aria-label={t("palette.title")}>
          {results.length === 0 && <li className="palette__empty" role="presentation">{t("palette.empty")}</li>}
          {results.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id} role="presentation">
                {head && <div className="palette__group" role="presentation">{head}</div>}
                <div
                  id={`palette-opt-${c.id}`} data-idx={i} role="option" aria-selected={i === active}
                  className={`palette__opt ${i === active ? "palette__opt--active" : ""}`}
                  onMouseMove={() => setActive(i)} onClick={() => run(c)}
                >
                  {c.icon && <span className="palette__icon" aria-hidden>{c.icon}</span>}
                  <span className="palette__label">{c.label}</span>
                  {c.hint && <span className="palette__hint">{c.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="palette__foot" aria-hidden>
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> {t("palette.nav")}</span>
          <span><kbd className="kbd">Enter</kbd> {t("palette.run")}</span>
        </div>
      </div>
    </div>
  );
}
