// GARY 🐾 — Intro / splash (spec 00, components.md §E2). The app entry: the desktop-app boot moment.
// A 16-bit pixel-art loop of the isotipo husky puppy watching a bouncing ball ("LOADING…", public/gary-loading.gif, built by
// scripts/make-loading-gif.py) plays while the wordmark rises, then we route forward (Onboarding if the user
// is new, else Chat). GSAP boot wrapped in matchMedia so it honors prefers-reduced-motion (design-system §5).
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ISOTIPO_SRC } from "../components/ui";
import { useT } from "../i18n";

gsap.registerPlugin(useGSAP);

const LOADING_GIF = "/gary-loading.gif";

export function IntroView({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const t = useT();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // Full motion: the loading GIF pops in, wordmark + copy rise, and we hold for one full loop
      // (~3.4 s, the GIF's length) before entering.
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({ defaults: { ease: "power2.out" }, onComplete: onEnter });
        tl.from(".intro__loader", { opacity: 0, scale: 0.92, duration: 0.4 })
          .from(".intro__word", { opacity: 0, y: 10, duration: 0.42 }, "-=0.14")
          .from(".intro__tag", { opacity: 0, y: 8, duration: 0.36 }, "-=0.22")
          .from(".intro__sub", { opacity: 0, duration: 0.3 }, "-=0.18")
          .to({}, { duration: 2.3 }); // let the husky finish its loop before routing forward
      });

      // Reduced motion: no movement, just show and route after a short, calm delay.
      mm.add("(prefers-reduced-motion: reduce)", () => {
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
        <img className="intro__loader" src={LOADING_GIF} alt={t("intro.loading")} draggable={false} />
        {/* Reduced motion: the static isotipo replaces the animated loop (swapped in CSS). */}
        <span className="intro__mark">
          <img src={ISOTIPO_SRC} alt="" draggable={false} />
        </span>
        <h1 className="intro__word">GARY</h1>
        <p className="intro__tag">{t("brand.tagline")}</p>
        <p className="intro__sub">{t("intro.sub")}</p>
      </div>
      <button className="intro__skip" onClick={onEnter}>{t("intro.enter")}</button>
    </div>
  );
}
