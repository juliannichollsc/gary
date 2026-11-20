// GARY 🐾 — custom window titlebar. Window decorations are disabled (tauri.conf.json), so this bar
// provides the drag region (data-tauri-drag-region) and the min / max-restore / close controls. It
// degrades gracefully when not running under Tauri (getCurrentWindow throws → we no-op).
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PanelLeft, HelpCircle } from "../icons";
import { useTutorial } from "../tutorial";
import { useSidebar, toggleSidebar } from "../layout";
import { useT } from "../i18n";
import "../styles/titlebar.css";

// Wrap each window action in try/catch so a plain browser (no Tauri) doesn't crash the UI.
async function windowAction(fn: (w: ReturnType<typeof getCurrentWindow>) => Promise<unknown>) {
  try {
    await fn(getCurrentWindow());
  } catch {
    /* not running under Tauri — controls are inert */
  }
}

const iconProps = { width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": true } as const;

export function Titlebar() {
  const t = useT();
  const sidebar = useSidebar();
  const tut = useTutorial();
  return (
    <div className="titlebar">
      <div className="titlebar__brand" data-tauri-drag-region>
        {/* Mostrar/ocultar la sidebar — sólo existe cuando hay sidebar (onboarding completo). */}
        {sidebar.available && (
          <button
            type="button"
            className={`titlebar__toggle ${sidebar.open ? "titlebar__toggle--on" : ""}`}
            onClick={toggleSidebar}
            aria-label={sidebar.open ? t("sidebar.hide") : t("sidebar.show")}
            aria-pressed={sidebar.open}
            aria-keyshortcuts="Control+B"
            title={`${sidebar.open ? t("sidebar.hide") : t("sidebar.show")} (Ctrl+B)`}
          >
            <PanelLeft width={16} height={16} />
          </button>
        )}
        <img className="titlebar__logo" src="/isotipo-clean.png" alt="" draggable={false} />
        <span className="titlebar__word">GARY</span>
      </div>

      {/* Espacio central arrastrable entre la marca y los controles. */}
      <div className="titlebar__drag" data-tauri-drag-region />

      {/* Ayuda: punto de entrada ÚNICO al tutorial guiado (antes repetido en el header de cada vista). */}
      {sidebar.ready && (
        <button type="button" className="titlebar__help" onClick={tut.start} disabled={tut.active}
                aria-label={t("tut.button")} title={t("tut.button")}>
          <HelpCircle width={15} height={15} />
          <span>{t("tut.help")}</span>
        </button>
      )}

      <div className="titlebar__controls">
        <button
          type="button"
          className="titlebar__btn"
          aria-label="Minimizar"
          onClick={() => windowAction((w) => w.minimize())}
        >
          <svg {...iconProps}>
            <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>

        <button
          type="button"
          className="titlebar__btn"
          aria-label="Maximizar o restaurar"
          onClick={() => windowAction((w) => w.toggleMaximize())}
        >
          <svg {...iconProps}>
            <rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>

        <button
          type="button"
          className="titlebar__btn titlebar__btn--close"
          aria-label="Cerrar"
          onClick={() => windowAction((w) => w.close())}
        >
          <svg {...iconProps}>
            <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" />
            <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
