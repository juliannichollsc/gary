// GARY 🐾 — hooks compartidos.
import { useCallback, useEffect, useState } from "react";
import { browserStatus, DEFAULTS, type BrowserStatus } from "./settings";

// Recarga datos al ENTRAR a la vista (montaje) y cada vez que la ventana/pestaña recupera el foco o vuelve
// a ser visible. Motivo: el agente LM (que corre en el chat) reescribe los archivos de datos locales
// (data/offers-master.md, data/metrics.md, onboarding.json); al volver a la vista Mapa de ofertas o
// Métricas queremos ver SIEMPRE la data fresca que acaba de producir, sin reiniciar la app. `load` debe ser
// estable (envuélvelo en useCallback) para no re-suscribir en cada render.
export function useReloadOnFocus(load: () => void): void {
  useEffect(() => {
    load(); // al entrar a la vista
    const onFocus = () => load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);
}

// Estado del navegador de automatización (:9333), sondeado mientras `enabled`. Lo comparten la barra de
// estado del Chat y la sección Conexiones para mostrar el mismo "Activo / Detenido" y ofrecer "Iniciar".
// Sondeo barato (browser_status es un TCP connect local); 5 s basta para reflejar un cierre manual.
export function useBrowserStatus(enabled = true, intervalMs = 5000) {
  const [status, setStatus] = useState<BrowserStatus>({ running: false, port: DEFAULTS.browserPort });
  const [known, setKnown] = useState(false); // false hasta la primera lectura → no mostramos "detenido" en falso
  const refresh = useCallback(async () => {
    const s = await browserStatus();
    setStatus(s); setKnown(true);
    return s;
  }, []);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = window.setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, refresh]);
  return { status, known, refresh, setStatus };
}
