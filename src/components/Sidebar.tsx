// GARY 🐾 — Sidebar (components.md §C, gary.pen prompt 1/2). 260px: brand, nav, connections, theme, user.
import { useEffect, useState, type ReactNode } from "react";
import { MessageSquare, Map, Sparkles, BarChart, Settings, Sun, Moon, Loader } from "../icons";
import { Avatar, StatusDot } from "./ui";
import { browserStatus, openInBrowser, checkSiteLogin, startBrowser, loadSettings, DEFAULTS, type BrowserId } from "../settings";
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
];

function ConnectionRow({ c, onConnect, onVerify }: { c: Conn; onConnect: () => void; onVerify: () => void }) {
  const t = useT();
  return (
    <div className="conn">
      <span className="conn__name">{c.site}</span>
      {c.status === "connected" && (
        <span className="conn__state"><StatusDot status="success" /> {t("conn.connected")}</span>
      )}
      {c.status === "checking" && (
        <span className="conn__state conn__state--muted"><Loader width={13} height={13} /> {t("conn.checking")}</span>
      )}
      {c.status === "pending" && (
        <button className="btn btn--ghost btn--sm conn__connect" onClick={onVerify}>{t("conn.verify")}</button>
      )}
      {c.status === "disconnected" && (
        <button className="btn btn--ghost btn--sm conn__connect" onClick={onConnect}>{t("conn.connect")}</button>
      )}
    </div>
  );
}

export function Sidebar({
  view, onNavigate, theme, onToggleTheme,
}: {
  view: ViewId; onNavigate: (v: ViewId) => void; theme: Theme; onToggleTheme: () => void;
}) {
  const t = useT();
  const [conns, setConns] = useState<Conn[]>(INITIAL_CONNS);
  const [verifyingAll, setVerifyingAll] = useState(false);
  // Navegador/puerto configurados (para poder iniciar :9333 si está cerrado).
  const [browser, setBrowser] = useState<BrowserId>(DEFAULTS.browser);
  const [port, setPort] = useState(DEFAULTS.browserPort);
  useEffect(() => { loadSettings().then((s) => { setBrowser(s.browser); setPort(s.browserPort); }); }, []);

  const setStatus = (site: string, status: ConnStatus) =>
    setConns((cs) => cs.map((c) => (c.site === site ? { ...c, status } : c)));

  // Asegura el navegador de automatización arriba: si fue cerrado / no está iniciado, lo inicia.
  const ensureBrowser = async (): Promise<boolean> => {
    const b = await browserStatus();
    if (b.running) return true;
    const s = await startBrowser(browser, port);
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
    await ensureBrowser();
    await openInBrowser(c.url);
    setStatus(c.site, "pending");
  };

  // Verificar sesión: valida UNA vez (sin polling → sin bucle). Si detecta login → "Conectado";
  // si no, vuelve a "pending" para que el usuario reintente cuando ya inició sesión.
  const verify = async (c: Conn) => {
    if (c.status === "checking") return; // evita doble disparo mientras corre
    const ok = await verifyOne(c);
    setStatus(c.site, ok ? "connected" : "pending");
  };

  // Verificar TODAS, una por una en serie (silencioso). Para usuarios que ya iniciaron sesión antes y
  // vuelven a la app: confirma en cuáles siguen logueados. Si el navegador fue cerrado, lo abre primero.
  const verifyAll = async () => {
    if (verifyingAll) return;
    setVerifyingAll(true);
    await ensureBrowser();
    for (const c of conns) {
      const ok = await verifyOne(c);
      setStatus(c.site, ok ? "connected" : "disconnected");
    }
    setVerifyingAll(false);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <Avatar kind="brand" size={40} />
        <div className="brand__text">
          <div className="brand__name">GARY</div>
          <div className="brand__tag">{t("brand.tagline")}</div>
        </div>
      </div>

      <nav className="nav" aria-label="Navegación principal">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`navitem ${view === n.id ? "navitem--active" : ""}`}
            aria-current={view === n.id ? "page" : undefined}
            onClick={() => onNavigate(n.id)}
          >
            {n.icon}
            <span>{t(n.key)}</span>
          </button>
        ))}
      </nav>

      <div className="conns">
        <div className="conns__head">
          <span className="conns__label">{t("conns.title")}</span>
          <button className="conns__verify" onClick={verifyAll} disabled={verifyingAll}
                  title={t("conns.verifyAll")} aria-label={t("conns.verifyAll")}>
            {verifyingAll && <Loader width={12} height={12} />}
            <span>{t("conns.verify")}</span>
          </button>
        </div>
        {conns.map((c) => (
          <ConnectionRow key={c.site} c={c} onConnect={() => connect(c)} onVerify={() => verify(c)} />
        ))}
      </div>

      <div className="sidebar__footer">
        <button className="themetoggle" onClick={onToggleTheme}
                aria-label={`Cambiar a tema ${theme === "dark" ? "claro" : "oscuro"}`}>
          <span className={theme === "dark" ? "themetoggle__on" : ""}><Moon width={16} height={16} /></span>
          <span className={theme === "light" ? "themetoggle__on" : ""}><Sun width={16} height={16} /></span>
        </button>
        <div className="user">
          <Avatar kind="user" size={28} />
          <span className="user__name">{t("user.you")}</span>
        </div>
      </div>
    </aside>
  );
}
