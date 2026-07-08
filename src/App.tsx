// GARY 🐾 — app shell. Entry flow: Intro splash → (Onboarding if new, else Chat) → Sidebar shell.
import { useRef, useState } from "react";
import { Sidebar, type ViewId } from "./components/Sidebar";
import { ChatView } from "./views/ChatView";
import { SettingsView } from "./views/SettingsView";
import { OnboardingView } from "./views/OnboardingView";
import { OffersView, type Offer } from "./views/OffersView";
import { MetricsView } from "./views/MetricsView";
import { IntroView } from "./views/IntroView";
import { TutorialProvider, useTutorial } from "./tutorial";
import { TutorialOverlay } from "./components/TutorialOverlay";
import { loadOnboarding } from "./onboarding";
import { useTheme } from "./theme";

export default function App() {
  // El tutorial guiado (spec 08) necesita conducir la vista → envolvemos el shell en su provider.
  return (
    <TutorialProvider>
      <AppShell />
    </TutorialProvider>
  );
}

function AppShell() {
  const { theme, toggle } = useTheme();
  const tut = useTutorial();
  // App entry (SESSION-CONTEXT): the Intro splash receives the user, then routes forward.
  const [phase, setPhase] = useState<"intro" | "app">("intro");
  const [view, setView] = useState<ViewId>("chat");
  // Al navegar a Onboarding DESDE EL SIDEBAR (usuario ya con CV/notebook/preguntas) → reanudar en el paso
  // Mapa de roles para VER lo que mapeó el agente. "Actualizar CV" (Ajustes, usa setView directo) NO activa
  // esto → arranca en el paso 1 para re-subir el CV y correr el flujo completo.
  const [onbResume, setOnbResume] = useState(false);
  const navigate = (v: ViewId) => { setOnbResume(v === "onboarding"); setView(v); };
  const entered = useRef(false);
  // Apply-intent seed: "Preparar aplicación" (offers) hands off to the CHAT/supervisor — no modal
  // (SESSION-CONTEXT 2026-07-02). We prefill the Chat composer; the user reviews & sends (GARY no envía).
  const [applySeed, setApplySeed] = useState<string | null>(null);

  // Leave the splash once (skip button or boot animation end). Returning users land on Chat; new users
  // are taken to Onboarding first.
  const enterApp = () => {
    if (entered.current) return;
    entered.current = true;
    loadOnboarding().then((s) => {
      // Ya configurado = onboarding terminado O ya tiene su notebook (CV ingestado) → al Chat. Usamos
      // notebookId además de `done` porque `done` solo se marca al pulsar "Terminar" (si no, cada arranque
      // reenviaría a onboarding aunque el usuario ya tenga su NotebookLM).
      setView(s.done || s.notebookId ? "chat" : "onboarding");
      setPhase("app");
    });
  };

  const prepareApply = (offer: Offer) => {
    setApplySeed(`prepara la aplicación para ${offer.company} — ${offer.role}`);
    setView("chat");
  };

  if (phase === "intro") return <IntroView onEnter={enterApp} />;

  // Vista EFECTIVA: durante el tutorial mostramos la superficie del paso (o la vista actual en la bienvenida);
  // NUNCA tocamos `view`, así al cerrar el tutorial la app queda exactamente donde estaba. El scrim del overlay
  // bloquea la interacción con la vista de fondo (sin ingestas/conexiones accidentales).
  const effView: ViewId = tut.active ? (tut.current?.view ?? view) : view;
  const onbForceStep = tut.active ? tut.current?.onbStep : undefined;
  const onbTutorial = tut.active && effView === "onboarding";

  return (
    <div className="app">
      <Sidebar view={effView} onNavigate={navigate} theme={theme} onToggleTheme={toggle} />
      <main className="main">
        {/* ChatView queda SIEMPRE montado (sólo oculto cuando otra vista está activa). Desmontarlo corría el
            cleanup del efecto → term.dispose() + quitaba los listeners del PTY, y al volver re-invocaba
            open_terminal → reiniciaba la terminal y mataba la sesión del agente. Mantenerlo montado preserva
            la sesión al cambiar de pestaña; `active` dispara un refit al reaparecer (xterm mide 0 mientras
            está display:none). */}
        <div className="viewhost" hidden={effView !== "chat"}>
          <ChatView theme={theme} active={effView === "chat"} seed={applySeed} onSeedConsumed={() => setApplySeed(null)} />
        </div>
        {effView === "offers" && <OffersView onPrepareApply={prepareApply} />}
        {effView === "onboarding" && (
          <OnboardingView onDone={() => setView("chat")} resume={onbResume}
                          forceStep={onbForceStep} tutorial={onbTutorial} />
        )}
        {effView === "metrics" && <MetricsView />}
        {effView === "settings" && <SettingsView onNavigate={setView} />}
      </main>
      <TutorialOverlay />
    </div>
  );
}
