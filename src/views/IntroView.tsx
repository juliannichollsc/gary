// GARY 🐾 — Intro / splash (spec 00, components.md §E2). The app entry: the desktop-app boot moment.
// The official isotipo draws in and the wordmark rises, then we route forward (Onboarding if the user is
// new, else Chat). GSAP boot wrapped in matchMedia so it honors prefers-reduced-motion (design-system §5).
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ISOTIPO_SRC } from "../components/ui";
import { useT } from "../i18n";

gsap.registerPlugin(useGSAP);

export function IntroView({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const t = useT();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // Full motion: mark scales in, wordmark + copy rise, a loading bar sweeps, then we enter.
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({ defaults: { ease: "power2.out" }, onComplete: onEnter });
        tl.from(".intro__mark", { opacity: 0, scale: 0.82, duration: 0.5 })
          .from(".intro__word", { opacity: 0, y: 10, duration: 0.42 }, "-=0.14")
          .from(".intro__tag", { opacity: 0, y: 8, duration: 0.36 }, "-=0.22")
          .from(".intro__sub", { opacity: 0, duration: 0.3 }, "-=0.18")
          .fromTo(".intro__bar-fill", { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: "power1.inOut" }, "-=0.18")
          .to({}, { duration: 0.2 }); // brief beat before routing forward
      });

      // Reduced motion: no movement, just show and route after a short, calm delay.
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(".intro__bar-fill", { scaleX: 1 });
        const call = gsap.delayedCall(0.7, onEnter);
        return () => call.kill();
      });

      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <div className="intro" ref={root}>
      <div className="intro__center">
        <span className="intro__mark">
          <img src={ISOTIPO_SRC} alt="" draggable={false} />
        </span>
        <h1 className="intro__word">GARY</h1>
        <p className="intro__tag">{t("brand.tagline")}</p>
        <p className="intro__sub">{t("intro.sub")}</p>
        <div className="intro__bar" aria-hidden="true"><span className="intro__bar-fill" /></div>
      </div>
      <button className="intro__skip" onClick={onEnter}>{t("intro.enter")}</button>
    </div>
  );
}
