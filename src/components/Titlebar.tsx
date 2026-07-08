// GARY 🐾 — custom window titlebar. Window decorations are disabled (tauri.conf.json), so this bar
// provides the drag region (data-tauri-drag-region) and the min / max-restore / close controls. It
// degrades gracefully when not running under Tauri (getCurrentWindow throws → we no-op).
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  return (
    <div className="titlebar">
      <div className="titlebar__brand" data-tauri-drag-region>
        <img className="titlebar__logo" src="/isotipo-clean.png" alt="" draggable={false} />
        <span className="titlebar__word">GARY</span>
      </div>

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
