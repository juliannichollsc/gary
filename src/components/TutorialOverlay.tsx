// GARY 🐾 — Tutorial overlay (spec 08). Scrim (fondo modal que atenúa toda la app y bloquea el clic) + una
// tarjeta flotante con el texto de cada paso y los controles: Cancelar (✕), Skipear tutorial (centro),
// Continuar / Finalizar tutorial. Movimiento GSAP según design-system §5 (scrim fade + card 0.96→1), envuelto
// en gsap.matchMedia() que respeta prefers-reduced-motion. Esc = cancelar.
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { X, HelpCircle } from "../icons";
import { useT } from "../i18n";
import { useTutorial } from "../tutorial";

export function TutorialOverlay() {
  const t = useT();
  const { active, step, total, current, isLast, next, back, close } = useTutorial();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Esc cierra el tutorial (cancelar). Solo mientras está activo.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close]);

  // Entrada: scrim fade + card escala 0.96→1 (design-system §5). Reduced-motion → aparición instantánea.
  useGSAP(() => {
    if (!active) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(scrimRef.current, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power2.out" });
      gsap.fromTo(cardRef.current, { opacity: 0, scale: 0.96, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.24, ease: "power3.out" });
    });
    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set([scrimRef.current, cardRef.current], { opacity: 1, scale: 1, y: 0 });
    });
    return () => mm.revert();
  }, { dependencies: [active], scope: rootRef });

  // Cambio de paso: crossfade suave del contenido (título + cuerpo). Reduced-motion → sin desplazamiento.
  useGSAP(() => {
    if (!active) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(contentRef.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" });
    });
    return () => mm.revert();
  }, { dependencies: [step, active], scope: rootRef });

  if (!active || !current) return null;

  const progress = t("tut.progress").replace("{n}", String(step + 1)).replace("{total}", String(total));

  return (
    <div className="tut" ref={rootRef} role="dialog" aria-modal="true" aria-label={t("tut.button")}>
      <div className="tut-scrim" ref={scrimRef} onClick={close} aria-hidden />
      <div className="tut-card" ref={cardRef}>
        <button className="tut-card__close" onClick={close} aria-label={t("tut.cancel")} title={t("tut.cancel")}>
          <X width={16} height={16} />
        </button>

        <div className="tut-card__content" ref={contentRef}>
          <div className="tut-card__badge"><HelpCircle width={14} height={14} /> {progress}</div>
          <h2 className="tut-card__title">{t(current.titleKey)}</h2>
          <p className="tut-card__body">{t(current.bodyKey)}</p>
        </div>

        {/* Puntos de progreso */}
        <div className="tut-dots" aria-hidden>
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} className={`tut-dot ${i === step ? "tut-dot--active" : ""}`} />
          ))}
        </div>

        <div className="tut-card__controls">
          <button className="btn btn--ghost btn--sm" onClick={back} disabled={step === 0}>{t("ob.back")}</button>
          <button className="tut-skip" onClick={close}>{t("tut.skip")}</button>
          <button className="btn btn--primary btn--sm" onClick={isLast ? close : next}>
            {isLast ? t("tut.finish") : t("tut.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
