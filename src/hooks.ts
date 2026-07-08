// GARY 🐾 — hooks compartidos.
import { useEffect } from "react";

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
