// GARY 🐾 — Toast (components.md §H, design-system §5). App-level feedback for outcomes the user would
// otherwise miss (connection verified, browser failed to start, file couldn't open). Bottom-right stack,
// max 3, auto-dismiss (danger stays longer), pauses on hover, `aria-live` without stealing focus.
// Motion: slide-up + fade in (200ms), exit ~65% faster; reduced-motion → instant.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { CheckCircle, AlertTriangle, Info, X } from "./icons";
import { useT } from "./i18n";

export type ToastType = "success" | "warning" | "danger" | "info";
export type ToastInput = { type?: ToastType; message: string; action?: { label: string; onClick: () => void } };
type ToastItem = ToastInput & { id: number; type: ToastType };

type ToastApi = { show: (t: ToastInput) => void };
const Ctx = createContext<ToastApi | null>(null);

const MAX = 3;
const DURATION: Record<ToastType, number> = { success: 4000, info: 4500, warning: 6000, danger: 7000 };
const ICON: Record<ToastType, ReactNode> = {
  success: <CheckCircle width={18} height={18} />,
  info: <Info width={18} height={18} />,
  warning: <AlertTriangle width={18} height={18} />,
  danger: <AlertTriangle width={18} height={18} />,
};

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback((t: ToastInput) => {
    const item: ToastItem = { ...t, type: t.type ?? "info", id: nextId.current++ };
    setItems((xs) => [...xs, item].slice(-MAX));
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {items.map((it) => <Toast key={it.id} item={it} onGone={() => remove(it.id)} />)}
      </div>
    </Ctx.Provider>
  );
}

function Toast({ item, onGone }: { item: ToastItem; onGone: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  const [paused, setPaused] = useState(false);

  useLayoutEffect(() => {
    if (!ref.current || reduced()) return;
    gsap.fromTo(ref.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" });
  }, []);

  const dismiss = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    if (!ref.current || reduced()) return onGone();
    gsap.to(ref.current, { opacity: 0, y: 8, duration: 0.13, ease: "power2.in", onComplete: onGone });
  }, [onGone]);

  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(dismiss, DURATION[item.type]);
    return () => clearTimeout(id);
  }, [paused, dismiss, item.type]);

  return (
    <div ref={ref} className={`toast toast--${item.type}`} role={item.type === "danger" ? "alert" : "status"}
         onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
         onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <span className="toast__icon" aria-hidden>{ICON[item.type]}</span>
      <span className="toast__msg">{item.message}</span>
      {item.action && (
        <button className="toast__action" onClick={() => { item.action!.onClick(); dismiss(); }}>{item.action.label}</button>
      )}
      <button className="toast__close" onClick={dismiss} aria-label={t("common.dismiss")}><X width={14} height={14} /></button>
    </div>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used within a ToastProvider");
  return c;
}
