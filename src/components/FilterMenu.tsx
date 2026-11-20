// GARY 🐾 — FilterMenu: a compact multi-select filter ("Canal ▾", "Estado ▾") that replaces rows of toggle
// chips in toolbars. Trigger shows the active count; the popover lists checkable options. ARIA menu with
// menuitemcheckbox; ↑/↓ move, Space/Enter toggle, Esc closes and returns focus to the trigger.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "../icons";
import { useT } from "../i18n";

export function FilterMenu<T extends string>({ label, options, selected, onToggle, onClear }: {
  label: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  onToggle: (v: T) => void;
  onClear: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemsRef.current[0]?.focus();
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    const items = itemsRef.current.filter(Boolean) as HTMLButtonElement[];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); items[Math.min(items.length - 1, i + 1)]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[Math.max(0, i - 1)]?.focus(); }
    else if (e.key === "Tab") setOpen(false);
  };

  const count = selected.size;
  return (
    <div className="fmenu" ref={rootRef} onKeyDown={open ? onKey : undefined}>
      <button
        ref={triggerRef} type="button"
        className={`fmenu__trigger ${count ? "fmenu__trigger--active" : ""}`}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
      >
        <span>{label}</span>
        {count > 0 && <span className="fmenu__count">{count}</span>}
        <ChevronDown width={14} height={14} aria-hidden />
      </button>
      {open && (
        <div className="fmenu__pop" role="menu" aria-label={label}>
          {options.map((o, i) => {
            const on = selected.has(o.value);
            return (
              <button
                key={o.value} ref={(el) => { itemsRef.current[i] = el; }} type="button"
                role="menuitemcheckbox" aria-checked={on} className="fmenu__item" onClick={() => onToggle(o.value)}
              >
                <span className={`fmenu__box ${on ? "fmenu__box--on" : ""}`} aria-hidden>{on && <Check width={11} height={11} />}</span>
                {o.label}
              </button>
            );
          })}
          <div className="fmenu__foot">
            <button
              ref={(el) => { itemsRef.current[options.length] = el; }} type="button" role="menuitem"
              className="fmenu__clear" onClick={onClear} disabled={!count}
            >
              {t("of.clearfilters")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
