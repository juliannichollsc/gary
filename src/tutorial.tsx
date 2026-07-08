// GARY 🐾 — Guided tutorial (spec 08). A 7-step overlay OVER the real app: each step navigates to a real
// surface (a view / an onboarding sub-step / the sidebar), dims everything with a scrim, and floats an
// explanatory card. The state lives here (context); App reads it to compute the "effective view" it renders,
// so we never mutate the real `view` → cancel/skip/finish just turn the overlay off and the app is exactly
// where it was. Interaction with the view behind is blocked by the scrim (no accidental ingest/connect).
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ViewId } from "./components/Sidebar";

// Un paso del tutorial. `view` = superficie real a mostrar detrás (null = la vista actual, para la bienvenida);
// `onbStep` fuerza el sub-paso del OnboardingView (solo se muestra, no se persiste). Los textos son claves i18n.
export type TutorialStep = {
  view: ViewId | null;
  onbStep?: number;
  titleKey: string;
  bodyKey: string;
};

// 9 pasos: bienvenida + 8 vistas (CV/NotebookLM · Preguntas · Mapa de roles · Conexiones · Ajustes · Chat ·
// Métricas · Mapa de ofertas). Orden final tras el Chat: Métricas → Mapa de ofertas (última).
export const TUTORIAL_STEPS: TutorialStep[] = [
  { view: null,          titleKey: "tut.intro.title", bodyKey: "tut.intro.body" },
  { view: "onboarding",  onbStep: 1, titleKey: "tut.s1.title", bodyKey: "tut.s1.body" }, // Subir CV
  { view: "onboarding",  onbStep: 3, titleKey: "tut.s2.title", bodyKey: "tut.s2.body" }, // Preguntas típicas
  { view: "onboarding",  onbStep: 4, titleKey: "tut.s3.title", bodyKey: "tut.s3.body" }, // Mapa de roles
  { view: "chat",        titleKey: "tut.s4.title", bodyKey: "tut.s4.body" },              // Conexiones (sidebar)
  { view: "settings",    titleKey: "tut.s5.title", bodyKey: "tut.s5.body" },              // Ajustes
  { view: "chat",        titleKey: "tut.s6.title", bodyKey: "tut.s6.body" },              // Chat
  { view: "metrics",     titleKey: "tut.s7.title", bodyKey: "tut.s7.body" },              // Métricas
  { view: "offers",      titleKey: "tut.s8.title", bodyKey: "tut.s8.body" },              // Mapa de ofertas (última)
];

export type TutorialApi = {
  active: boolean;
  step: number;                 // 0..TUTORIAL_STEPS.length-1
  total: number;
  current: TutorialStep | null; // null cuando no está activo
  isLast: boolean;
  start: () => void;            // abre el tutorial en el paso 0
  next: () => void;
  back: () => void;
  close: () => void;            // cancelar / skipear / finalizar → cierra (la app vuelve donde estaba)
};

const Ctx = createContext<TutorialApi | null>(null);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  const api = useMemo<TutorialApi>(() => ({
    active,
    step,
    total: TUTORIAL_STEPS.length,
    current: active ? TUTORIAL_STEPS[step] : null,
    isLast: step === TUTORIAL_STEPS.length - 1,
    start: () => { setStep(0); setActive(true); },
    next: () => setStep((s) => Math.min(TUTORIAL_STEPS.length - 1, s + 1)),
    back: () => setStep((s) => Math.max(0, s - 1)),
    close: () => setActive(false),
  }), [active, step]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useTutorial(): TutorialApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTutorial must be used within a TutorialProvider");
  return c;
}
