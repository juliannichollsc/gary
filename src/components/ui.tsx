// GARY 🐾 — base primitives (components.md §A). Themed, keyboard-accessible, token-driven.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useState } from "react";
import { Loader, Check, Eye, EyeOff } from "../icons";

// The official brand mark (husky isotipo, watermark-cleaned, transparent bg). Served from public/.
export const ISOTIPO_SRC = "/isotipo-clean.png";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export function Button({
  variant = "secondary", size = "md", loading, iconLeft, iconRight, children, className = "", ...rest
}: {
  variant?: Variant; size?: Size; loading?: boolean; iconLeft?: ReactNode; iconRight?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`btn btn--${variant} btn--${size} ${className}`}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? <Loader width={16} height={16} /> : iconLeft}
      {children && <span>{children}</span>}
      {!loading && iconRight}
    </button>
  );
}

export function Chip({
  label, active, onClick, color, removable, onRemove,
}: {
  label: string; active?: boolean; onClick?: () => void; color?: string;
  removable?: boolean; onRemove?: () => void;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag className={`chip ${active ? "chip--active" : ""}`} onClick={onClick}
         style={color ? ({ "--chip-color": color } as React.CSSProperties) : undefined}>
      {color && <span className="chip__dot" />}
      {label}
      {removable && <span className="chip__x" onClick={onRemove} role="button" aria-label={`quitar ${label}`}>×</span>}
    </Tag>
  );
}

type Status = "success" | "warning" | "danger" | "info";
export function StatusDot({ status, pulse }: { status: Status; pulse?: boolean }) {
  return <span className={`dot dot--${status} ${pulse ? "dot--pulse" : ""}`} aria-hidden />;
}

export function SegmentedControl<T extends string>({
  options, value, onChange, ariaLabel,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value} role="tab" aria-selected={value === o.value}
          className={`segmented__item ${value === o.value ? "segmented__item--active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Input({
  label, helper, error, className = "", ...rest
}: { label?: string; helper?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      {label && <span className="field__label">{label}</span>}
      <input className={`input ${error ? "input--error" : ""} ${className}`} aria-invalid={!!error} {...rest} />
      {error ? <span className="field__error" role="alert">{error}</span>
             : helper && <span className="field__helper">{helper}</span>}
    </label>
  );
}

export function PasswordInput({
  label, helper, stored, ...rest
}: { label?: string; helper?: string; stored?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <label className="field">
      {label && <span className="field__label">{label}</span>}
      <span className="input input--group">
        <input type={show ? "text" : "password"} {...rest} />
        {stored && <span className="badge badge--ok"><Check width={12} height={12} /> Guardada en keychain</span>}
        <button type="button" className="input__eye" onClick={() => setShow((s) => !s)}
                aria-label={show ? "Ocultar" : "Mostrar"}>{show ? <EyeOff width={16} height={16} /> : <Eye width={16} height={16} />}</button>
      </span>
      {helper && <span className="field__helper">{helper}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
            className={`toggle ${checked ? "toggle--on" : ""}`} onClick={() => onChange(!checked)}>
      <span className="toggle__knob" />
    </button>
  );
}

// ScoreMeter (components.md §A/F, design-system §1.4) — mono number 0–5 + 5-dot meter with a
// perceptual color ramp (danger→warning→info→success). ≥4.0 (the apply threshold, operating-rules §6)
// gets a subtle accent ring. Never color-only: the number + filled-dot pattern carry the value too.
export type ScoreLevel = "danger" | "warning" | "info" | "success";
export function scoreLevel(score: number): ScoreLevel {
  if (score >= 4) return "success";
  if (score >= 3) return "info";
  if (score >= 2) return "warning";
  return "danger";
}
export function ScoreMeter({ score }: { score: number }) {
  const s = Math.max(0, Math.min(5, score));
  const level = scoreLevel(s);
  const filled = Math.round(s);
  const apply = s >= 4;
  return (
    <span
      className={`score score--${level} ${apply ? "score--apply" : ""}`}
      role="meter" aria-valuemin={0} aria-valuemax={5} aria-valuenow={s}
      aria-label={`Score ${s.toFixed(1)} de 5${apply ? " — apto para aplicar" : ""}`}
    >
      <span className="score__num">{s.toFixed(1)}</span>
      <span className="score__dots" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`score__dot ${i < filled ? "score__dot--on" : ""}`} />
        ))}
      </span>
    </span>
  );
}

// StatusBox (components.md §F, design-system §1.5) — tri-state, never color-only: dot + mono glyph
// (mirrors the offers-master.md boxes) + text label.
export type OfferStatus = "pendiente" | "aplicada" | "flag";
const STATUS_META: Record<OfferStatus, { glyph: string; label: string; tone: Status | "muted" }> = {
  pendiente: { glyph: "[ ]", label: "Pendiente", tone: "muted" },
  aplicada: { glyph: "[x]", label: "Aplicada", tone: "success" },
  flag: { glyph: "[~]", label: "Flag", tone: "warning" },
};
export function StatusBox({ status }: { status: OfferStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`statusbox statusbox--${m.tone}`}>
      {m.tone !== "muted" && <StatusDot status={m.tone} />}
      {m.tone === "muted" && <span className="statusbox__nodot" aria-hidden />}
      <span className="statusbox__glyph" aria-hidden>{m.glyph}</span>
      <span className="statusbox__label">{m.label}</span>
    </span>
  );
}

// Avatar — the brand mark (`paw`/`brand` → official isotipo image) or the user monogram.
export function Avatar({ kind = "brand", size = 40 }: { kind?: "paw" | "brand" | "user"; size?: number }) {
  if (kind !== "user") {
    return (
      <span className="avatar avatar--brand" style={{ width: size, height: size }}>
        <img className="avatar__img" src={ISOTIPO_SRC} alt="" draggable={false} />
      </span>
    );
  }
  return <span className="avatar avatar--user" style={{ width: size, height: size }}>JN</span>;
}
