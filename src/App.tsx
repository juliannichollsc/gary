// GARY 🐾 — app shell. Entry flow: Intro splash → (Onboarding if new, else Chat) → Sidebar shell.
// App-level services: toasts (ToastProvider), the Ctrl/Cmd+K command palette and a short view crossfade.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar, type ViewId } from "./components/Sidebar";
import { ChatView } from "./views/ChatView";
import { SettingsView } from "./views/SettingsView";
import { OnboardingView } from "./views/OnboardingView";
import { OffersView, type Offer } from "./views/OffersView";
import { MetricsView } from "./views/MetricsView";
import { IntroView } from "./views/IntroView";
import { useTutorial } from "./tutorial";
import { TutorialOverlay } from "./components/TutorialOverlay";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { loadOnboarding } from "./onboarding";
import { loadSettings, startBrowser } from "./settings";
import { useTheme } from "./theme";
import { useSidebar, setSidebarAvailable, setAppReady, toggleSidebar } from "./layout";
import { ToastProvider, useToast } from "./toast";
import { useT } from "./i18n";
import { MessageSquare, Map, Sparkles, BarChart, Settings, Sun, HelpCircle, Globe, Send, PanelLeft } from "./icons";

// Contenedor animado de la sidebar: al ocultar/mostrar desliza a la izquierda (ancho → 0 + contenido -16px y
// fade). Sigue montada mientras está oculta (conserva el estado de Conexiones) pero `inert` → sin foco ni clics.
// `animateIn`: la primera aparición tras completar el onboarding entra animada; en un arranque normal no.
function SidebarDock({ open, animateIn, children }: { open: boolean; animateIn: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const dock = ref.current, inner = dock?.firstElementChild as HTMLElement | null;
    if (!dock || !inner) return;
    dock.toggleAttribute("inert", !open);
    if (!open) dock.classList.remove("is-open"); // .is-open = totalmente abierto (permite tooltips fuera del rail)
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isFirst = first.current;
    first.current = false;
    if (reduced || (isFirst && !(open && animateIn))) {
      gsap.set(dock, open ? { clearProps: "width" } : { width: 0 });
      dock.classList.toggle("is-open", open);
      gsap.set(inner, open ? { clearProps: "transform,opacity" } : { x: -16, opacity: 0 });
      return;
    }
    gsap.killTweensOf([dock, inner]);
    if (open) {
      const w = inner.offsetWidth; // ancho natural (260 o el icon-rail de 64 en ventanas angostas)
      gsap.fromTo(dock, { width: dock.offsetWidth }, { width: w, duration: 0.28, ease: "power3.inOut", clearProps: "width",
                                                       onComplete: () => dock.classList.add("is-open") });
      gsap.fromTo(inner, { x: -16, opacity: 0 }, { x: 0, opacity: 1, duration: 0.24, delay: 0.06, ease: "power2.out", clearProps: "transform,opacity" });
    } else {
      gsap.to(inner, { x: -16, opacity: 0, duration: 0.16, ease: "power2.in" });
      gsap.fromTo(dock, { width: dock.offsetWidth }, { width: 0, duration: 0.24, ease: "power3.inOut" });
    }
  }, [open]);
  return <div className="sidebar-dock" ref={ref} aria-hidden={!open}>{children}</div>;
}

export default function App() {
  // El TutorialProvider vive en main.tsx (lo comparten la Titlebar —botón de ayuda— y el shell).
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

function AppShell() {
  const { theme, toggle } = useTheme();
  const tut = useTutorial();
  const t = useT();
  const toast = useToast();
  // App entry (SESSION-CONTEXT): the Intro splash receives the user, then routes forward.
  const [phase, setPhase] = useState<"intro" | "app">("intro");
  const [view, setView] = useState<ViewId>("chat");
  // La sidebar sólo existe cuando el usuario ya completó el onboarding (mismo criterio que el ruteo inicial:
  // `done` o ya tiene su notebook). Durante el tutorial se muestra porque el recorrido la explica.
  const [configured, setConfigured] = useState(false);
  const justConfigured = useRef(false); // true sólo al terminar el onboarding en esta sesión → entrada animada
  const sidebar = useSidebar();
  const sidebarShown = phase === "app" && (configured || tut.active);
  useEffect(() => { setSidebarAvailable(sidebarShown); }, [sidebarShown]);
  useEffect(() => { setAppReady(phase === "app"); }, [phase]);
  // Al navegar a Onboarding DESDE EL SIDEBAR (usuario ya con CV/notebook/preguntas) → reanudar en el paso
  // Mapa de roles para VER lo que mapeó el agente. "Actualizar CV" (Ajustes, usa setView directo) NO activa
  // esto → arranca en el paso 1 para re-subir el CV y correr el flujo completo.
  const [onbResume, setOnbResume] = useState(false);
  const navigate = (v: ViewId) => { setOnbResume(v === "onboarding"); setView(v); };
  const entered = useRef(false);
  // Apply-intent seed: "Preparar aplicación" (offers) hands off to the CHAT/supervisor — no modal
  // (SESSION-CONTEXT 2026-07-02). We prefill the Chat composer; the user reviews & sends (GARY no envía).
  const [applySeed, setApplySeed] = useState<string | null>(null);
  // Oferta a enfocar en el Mapa (desde la paleta de comandos).
  const [focusOffer, setFocusOffer] = useState<string | null>(null);

  // ---- Command palette (Ctrl/Cmd+K) ----
  // Listener en fase de CAPTURA: llega antes que xterm, así el atajo funciona también con la terminal
  // enfocada (y no se envía Ctrl+K = kill-line al shell).
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteOffers, setPaletteOffers] = useState<Offer[]>([]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      // Sin onboarding completo no hay navegación libre (ni paleta ni sidebar): el flujo guía al usuario.
      if (key === "k") {
        if (phase !== "app" || tut.active || !configured) return;
        e.preventDefault(); e.stopPropagation();
        setPaletteOpen((o) => !o);
      } else if (key === "b") {
        // Ctrl+B se respeta en la terminal y en el composer del chat: claude lo usa para mandar tareas a
        // segundo plano (el composer se lo reenvía al agente).
        if (!sidebarShown || tut.active || (e.target as HTMLElement).closest?.(".xterm, .composer")) return;
        e.preventDefault(); e.stopPropagation();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  useEffect(() => {
    if (paletteOpen) invoke<Offer[]>("read_offers").then((o) => setPaletteOffers(o ?? [])).catch(() => setPaletteOffers([]));
  }, [paletteOpen]);

  // Leave the splash once (skip button or boot animation end). Returning users land on Chat; new users
  // are taken to Onboarding first.
  const enterApp = () => {
    if (entered.current) return;
    entered.current = true;
    loadOnboarding().then((s) => {
      // Ya configurado = onboarding terminado O ya tiene su notebook (CV ingestado) → al Chat. Usamos
      // notebookId además de `done` porque `done` solo se marca al pulsar "Terminar" (si no, cada arranque
      // reenviaría a onboarding aunque el usuario ya tenga su NotebookLM).
      const ok = !!(s.done || s.notebookId);
      setConfigured(ok);
      setView(ok ? "chat" : "onboarding");
      setPhase("app");
    });
  };

  const prepareApply = (offer: Offer) => {
    setApplySeed(`prepara la aplicación para ${offer.company} — ${offer.role}`);
    setView("chat");
  };

  // Lleva una tarea común al composer del Chat (prefill: el usuario revisa y envía).
  const seedChat = (text: string) => { setApplySeed(text); setView("chat"); };

  const onStartBrowser = async () => {
    const cfg = await loadSettings();
    const s = await startBrowser(cfg.browser, cfg.browserPort);
    toast.show(s?.running
      ? { type: "success", message: t("toast.browser.started") }
      : { type: "danger", message: t("toast.browser.failed") });
  };

  const commands = useMemo<PaletteCommand[]>(() => {
    const go = t("palette.group.go"), act = t("palette.group.actions"), ask = t("palette.group.chat");
    const nav: [ViewId, string, JSX.Element][] = [
      ["chat", "nav.chat", <MessageSquare width={16} height={16} />],
      ["offers", "nav.offers", <Map width={16} height={16} />],
      ["onboarding", "nav.onboarding", <Sparkles width={16} height={16} />],
      ["metrics", "nav.metrics", <BarChart width={16} height={16} />],
      ["settings", "nav.settings", <Settings width={16} height={16} />],
    ];
    const list: PaletteCommand[] = nav.map(([id, key, icon]) => ({
      id: `go-${id}`, group: go, label: t(key), icon, run: () => navigate(id),
    }));
    for (const key of ["ch.quick.search", "ch.quick.gmail", "ch.quick.continue"]) {
      list.push({ id: `ask-${key}`, group: ask, label: t(key), icon: <Send width={16} height={16} />,
                  hint: t("palette.hint.prefill"), run: () => seedChat(t(key)) });
    }
    list.push(
      { id: "act-theme", group: act, label: theme === "dark" ? t("theme.toLight") : t("theme.toDark"),
        icon: <Sun width={16} height={16} />, keywords: "theme tema dark light oscuro claro", run: toggle },
      { id: "act-browser", group: act, label: t("palette.act.browser"), icon: <Globe width={16} height={16} />,
        keywords: "chrome 9333 cdp", run: onStartBrowser },
      { id: "act-tutorial", group: act, label: t("tut.button"), icon: <HelpCircle width={16} height={16} />,
        keywords: "help ayuda", run: tut.start },
      { id: "act-sidebar", group: act, label: sidebar.open ? t("sidebar.hide") : t("sidebar.show"),
        icon: <PanelLeft width={16} height={16} />, hint: "Ctrl B", keywords: "sidebar barra lateral menu", run: toggleSidebar },
    );
    const og = t("palette.group.offers");
    for (const o of paletteOffers) {
      list.push({ id: `offer-${o.id}`, group: og, label: `${o.company} — ${o.role}`,
                  hint: `${o.channel} · ${o.score.toFixed(1)}`, keywords: o.meta,
                  icon: <Map width={16} height={16} />,
                  run: () => { setFocusOffer(o.id); setView("offers"); } });
    }
    return list;
  }, [t, theme, paletteOffers, tut.start, sidebar.open]);

  // Crossfade corto al cambiar de vista (140ms, sólo opacidad; reduced-motion → nada).
  const mainRef = useRef<HTMLElement>(null);
  const effViewForFade = tut.active ? (tut.current?.view ?? view) : view;
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const shown = Array.from(main.children).filter((el) => !(el as HTMLElement).hidden);
    gsap.fromTo(shown, { opacity: 0 }, { opacity: 1, duration: 0.14, ease: "power1.out", clearProps: "opacity" });
  }, [effViewForFade, phase]);

  if (phase === "intro") return <IntroView onEnter={enterApp} />;

  // Vista EFECTIVA: durante el tutorial mostramos la superficie del paso (o la vista actual en la bienvenida);
  // NUNCA tocamos `view`, así al cerrar el tutorial la app queda exactamente donde estaba. El scrim del overlay
  // bloquea la interacción con la vista de fondo (sin ingestas/conexiones accidentales).
  const effView: ViewId = tut.active ? (tut.current?.view ?? view) : view;
  const onbForceStep = tut.active ? tut.current?.onbStep : undefined;
  const onbTutorial = tut.active && effView === "onboarding";

  return (
    <div className="app">
      {sidebarShown && (
        <SidebarDock open={sidebar.open} animateIn={justConfigured.current}>
          <Sidebar view={effView} onNavigate={navigate} theme={theme} onToggleTheme={toggle}
                   onOpenPalette={() => setPaletteOpen(true)} />
        </SidebarDock>
      )}
      <main className="main" ref={mainRef}>
        {/* ChatView queda SIEMPRE montado (sólo oculto cuando otra vista está activa). Desmontarlo corría el
            cleanup del efecto → term.dispose() + quitaba los listeners del PTY, y al volver re-invocaba
            open_terminal → reiniciaba la terminal y mataba la sesión del agente. Mantenerlo montado preserva
            la sesión al cambiar de pestaña; `active` dispara un refit al reaparecer (xterm mide 0 mientras
            está display:none). */}
        <div className="viewhost" hidden={effView !== "chat"}>
          <ChatView theme={theme} active={effView === "chat"} seed={applySeed} onSeedConsumed={() => setApplySeed(null)} />
        </div>
        {effView === "offers" && (
          <OffersView onPrepareApply={prepareApply} onStartSearch={() => seedChat(t("ch.quick.search"))}
                      focusOfferId={focusOffer} onFocusConsumed={() => setFocusOffer(null)} />
        )}
        {effView === "onboarding" && (
          <OnboardingView onDone={() => { justConfigured.current = !configured; setConfigured(true); setView("chat"); }}
                          resume={onbResume} returning={configured}
                          forceStep={onbForceStep} tutorial={onbTutorial} />
        )}
        {effView === "metrics" && <MetricsView onStartSearch={() => seedChat(t("ch.quick.search"))} />}
        {effView === "settings" && <SettingsView onNavigate={setView} />}
      </main>
      <TutorialOverlay />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}
