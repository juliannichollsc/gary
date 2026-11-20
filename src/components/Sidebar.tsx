// GARY 🐾 — Sidebar (components.md §C, gary.pen prompt 1/2). Deliberately quiet: search trigger, nav,
// connections (collapsed to a one-line summary by default) and the theme switch. The brand lives in the
// Titlebar (not repeated here). Only rendered once onboarding is complete; the user can hide it (Titlebar
// button / Ctrl+B) — the slide is animated by SidebarDock in App.tsx. The active nav item is marked by ONE
// shared pill that slides between items (design-system §5 "nav switch").
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { MessageSquare, Map, Sparkles, BarChart, Settings, Sun, Moon, Loader, Check, ChevronDown, ChevronRight, Search } from "../icons";
import { StatusDot } from "./ui";
import { openInBrowser, checkSiteLogin, startBrowser, browserStatus, loadSettings, DEFAULTS, type BrowserId } from "../settings";
import { useToast } from "../toast";
import { useT } from "../i18n";
import type { Theme } from "../theme";

export type ViewId = "chat" | "offers" | "onboarding" | "metrics" | "settings";

// Locked nav order (SESSION-CONTEXT): Chat → Offers → Onboarding → Metrics → Settings. Labels are i18n keys.
const NAV: { id: ViewId; key: string; icon: ReactNode }[] = [
  { id: "chat", key: "nav.chat", icon: <MessageSquare /> },
  { id: "offers", key: "nav.offers", icon: <Map /> },
  { id: "onboarding", key: "nav.onboarding", icon: <Sparkles /> },
  { id: "metrics", key: "nav.metrics", icon: <BarChart /> },
  { id: "settings", key: "nav.settings", icon: <Settings /> },
];

// Sitios mapeados + su URL de login. Flujo (sin polling): Conectar (abre la URL) → pending (botón
// "Verificar sesión") → al pulsarlo valida UNA vez → checking → connected / pending.
type ConnStatus = "connected" | "disconnected" | "pending" | "checking";
type Conn = { site: string; url: string; status: ConnStatus };

const INITIAL_CONNS: Conn[] = [
  { site: "Gmail", url: "https://mail.google.com/", status: "disconnected" },
  { site: "LinkedIn", url: "https://www.linkedin.com/login", status: "disconnected" },
  { site: "Indeed", url: "https://www.indeed.com/", status: "disconnected" },
  { site: "GetOnBoard", url: "https://www.getonbrd.com/", status: "disconnected" },
  { site: "Himalayas", url: "https://himalayas.app/", status: "disconnected" },
  { site: "Computrabajo", url: "https://www.computrabajo.com/", status: "disconnected" },
  { site: "Dice", url: "https://www.dice.com/dashboard/login", status: "disconnected" },
  { site: "Hireline", url: "https://hireline.io/", status: "disconnected" },
  { site: "Glassdoor", url: "https://www.glassdoor.com/", status: "disconnected" },
  { site: "Dover", url: "https://jobs.dover.com/", status: "disconnected" },
];

const LS_CONNS_OPEN = "gary-conns-open";
// Plegada por defecto: la sección sólo muestra el resumen (n/total + puntos) hasta que el usuario la abre.
const readOpen = () => { try { return localStorage.getItem(LS_CONNS_OPEN) === "1"; } catch { return false; } };

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function ConnectionRow({ c, onConnect, onVerify }: { c: Conn; onConnect: () => void; onVerify: () => void }) {
  const t = useT();
  return (
    <div className={`conn conn--${c.status}`}>
      <span className="conn__status" aria-hidden>
        {c.status === "connected" && <StatusDot status="success" />}
        {c.status === "checking" && <Loader width={12} height={12} />}
        {c.status === "pending" && <StatusDot status="warning" />}
        {c.status === "disconnected" && <span className="conn__ring" />}
      </span>
      <span className="conn__name">{c.site}</span>
      {c.status === "connected" && (
        <span className="conn__state"><Check width={13} height={13} aria-hidden /> {t("conn.connected")}</span>
      )}
      {c.status === "checking" && <span className="conn__state conn__state--muted">{t("conn.checking")}</span>}
      {c.status === "pending" && (
        <button className="conn__connect" onClick={onVerify}>{t("conn.verify")}</button>
      )}
      {c.status === "disconnected" && (
        <button className="conn__connect" onClick={onConnect}>{t("conn.connect")}</button>
      )}
    </div>
  );
}

export function Sidebar({
  view, onNavigate, theme, onToggleTheme, onOpenPalette,
}: {
  view: ViewId; onNavigate: (v: ViewId) => void; theme: Theme; onToggleTheme: () => void;
  onOpenPalette: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [conns, setConns] = useState<Conn[]>(INITIAL_CONNS);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [open, setOpen] = useState(readOpen);
  // Navegador/puerto configurados (para poder iniciar :9333 si está cerrado).
  const [browser, setBrowser] = useState<BrowserId>(DEFAULTS.browser);
  const [port, setPort] = useState(DEFAULTS.browserPort);

  useEffect(() => { loadSettings().then((s) => { setBrowser(s.browser); setPort(s.browserPort); }); }, []);

  const toggleOpen = () => setOpen((o) => {
    try { localStorage.setItem(LS_CONNS_OPEN, o ? "0" : "1"); } catch { /* storage bloqueado: sólo en memoria */ }
    return !o;
  });

  const setStatus = (site: string, status: ConnStatus) =>
    setConns((cs) => cs.map((c) => (c.site === site ? { ...c, status } : c)));

  // Asegura el navegador de automatización arriba: si fue cerrado / no está iniciado, lo inicia.
  const ensureBrowser = async (): Promise<boolean> => {
    const b = await browserStatus();
    if (b.running) return true;
    const s = await startBrowser(browser, port);
    if (!s?.running) toast.show({ type: "danger", message: t("toast.browser.failed") });
    return !!s?.running;
  };

  const verifyOne = async (c: Conn) => {
    setStatus(c.site, "checking");
    // UNA verificación silenciosa (attachea a :9333, sin abrir pestañas visibles) con timeout anti-cuelgue.
    const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), 70_000));
    return await Promise.race([checkSiteLogin(c.url), timeout]);
  };

  // Conectar: si el navegador no está iniciado, lo INICIA (ya no manda a Ajustes); luego abre la URL del
  // sitio en el navegador de automatización para que el usuario inicie sesión a mano → pasa a "pending".
  const connect = async (c: Conn) => {
    if (!(await ensureBrowser())) return;
    await openInBrowser(c.url);
    setStatus(c.site, "pending");
    toast.show({ type: "info", message: t("toast.conn.signin").replace("{site}", c.site) });
  };

  // Verificar sesión: valida UNA vez (sin polling → sin bucle). Si detecta login → "Conectado";
  // si no, vuelve a "pending" para que el usuario reintente cuando ya inició sesión.
  const verify = async (c: Conn) => {
    if (c.status === "checking") return; // evita doble disparo mientras corre
    const ok = await verifyOne(c);
    setStatus(c.site, ok ? "connected" : "pending");
    toast.show(ok
      ? { type: "success", message: t("toast.conn.ok").replace("{site}", c.site) }
      : { type: "warning", message: t("toast.conn.missing").replace("{site}", c.site) });
  };

  // Verificar TODAS, una por una en serie (silencioso). Para usuarios que ya iniciaron sesión antes y
  // vuelven a la app: confirma en cuáles siguen logueados. Si el navegador fue cerrado, lo abre primero.
  const verifyAll = async () => {
    if (verifyingAll) return;
    setVerifyingAll(true);
    if (!(await ensureBrowser())) { setVerifyingAll(false); return; }
    let ok = 0;
    for (const c of conns) {
      const r = await verifyOne(c);
      if (r) ok++;
      setStatus(c.site, r ? "connected" : "disconnected");
    }
    setVerifyingAll(false);
    toast.show({
      type: ok ? "success" : "warning",
      message: t("toast.conn.summary").replace("{n}", String(ok)).replace("{total}", String(conns.length)),
    });
  };

  // ---- Pastilla del nav: un único indicador que se desliza al ítem activo ----
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const placePill = useCallback((animate: boolean) => {
    const nav = navRef.current, pill = pillRef.current;
    const el = nav?.querySelector<HTMLElement>(".navitem--active");
    if (!nav || !pill || !el) { if (pill) pill.style.opacity = "0"; return; }
    const to = { y: el.offsetTop, height: el.offsetHeight, opacity: 1 };
    if (animate && placed.current && !reduced()) gsap.to(pill, { ...to, duration: 0.26, ease: "power3.inOut" });
    else gsap.set(pill, to);
    placed.current = true;
  }, []);
  useLayoutEffect(() => { placePill(true); }, [view, placePill]);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const ro = new ResizeObserver(() => placePill(false)); // colapso a icon-rail (<880px) cambia alturas
    ro.observe(nav);
    return () => ro.disconnect();
  }, [placePill]);

  const connected = conns.filter((c) => c.status === "connected").length;

  return (
    <aside className="sidebar">
      <button className="sidebar__search" onClick={onOpenPalette} aria-keyshortcuts="Control+K"
              aria-label={t("palette.trigger")} data-tip={`${t("palette.trigger")} · Ctrl K`}>
        <Search width={15} height={15} aria-hidden />
        <span className="sidebar__search-label">{t("palette.trigger")}</span>
        <kbd className="kbd">Ctrl K</kbd>
      </button>

      <nav className="nav" aria-label={t("nav.label")} ref={navRef}>
        <span className="nav__pill" ref={pillRef} aria-hidden />
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`navitem ${view === n.id ? "navitem--active" : ""}`}
            aria-current={view === n.id ? "page" : undefined}
            onClick={() => onNavigate(n.id)}
            data-tip={t(n.key)}
          >
            {n.icon}
            <span>{t(n.key)}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar__scroll">
        <div className="conns">
          <div className="conns__head">
            <button className="conns__toggle" onClick={toggleOpen} aria-expanded={open} aria-controls="conns-list">
              {open ? <ChevronDown width={14} height={14} aria-hidden /> : <ChevronRight width={14} height={14} aria-hidden />}
              <span className="conns__label">{t("conns.title")}</span>
              {/* Resumen de un vistazo: un punto por sitio (lleno = conectado) + n/total */}
              <span className="conns__dots" aria-hidden>
                {conns.map((c) => <span key={c.site} className={`conns__dot conns__dot--${c.status}`} />)}
              </span>
              <span className="sr-only">
                {t("conns.count").replace("{n}", String(connected)).replace("{total}", String(conns.length))}
              </span>
            </button>
            <button className="conns__verify" onClick={verifyAll} disabled={verifyingAll}
                    title={t("conns.verifyAll")} aria-label={t("conns.verifyAll")}>
              {verifyingAll && <Loader width={12} height={12} />}
              <span>{t("conns.verify")}</span>
            </button>
          </div>

          {open && (
            <div className="conns__list" id="conns-list">
              {conns.map((c) => (
                <ConnectionRow key={c.site} c={c} onConnect={() => connect(c)} onVerify={() => verify(c)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sidebar__footer">
        <button className="themetoggle" onClick={onToggleTheme}
                aria-label={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}>
          <span className={theme === "dark" ? "themetoggle__on" : ""}><Moon width={15} height={15} /></span>
          <span className={theme === "light" ? "themetoggle__on" : ""}><Sun width={15} height={15} /></span>
        </button>
      </div>
    </aside>
  );
}
