// GARY 🐾 — estado de layout compartido (sidebar). Store mínimo (mismo patrón que i18n) porque lo leen dos
// árboles distintos: la Titlebar (botón mostrar/ocultar, montada fuera de <App/>) y el shell de la app.
//  · available: la sidebar existe sólo cuando el usuario ya completó el onboarding (o durante el tutorial).
//  · open: preferencia del usuario (mostrar/ocultar), persistida por usuario en localStorage.
import { useSyncExternalStore } from "react";

const LS_KEY = "gary-sidebar-open";
const read = (): boolean => { try { return localStorage.getItem(LS_KEY) !== "0"; } catch { return true; } };

let state = { available: false, open: read(), ready: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function setSidebarAvailable(available: boolean): void {
  if (state.available === available) return;
  state = { ...state, available }; emit();
}
// `ready`: la app ya pasó el splash (Intro) → la Titlebar puede ofrecer la ayuda/tutorial.
export function setAppReady(ready: boolean): void {
  if (state.ready === ready) return;
  state = { ...state, ready }; emit();
}
export function setSidebarOpen(open: boolean): void {
  if (state.open === open) return;
  state = { ...state, open };
  try { localStorage.setItem(LS_KEY, open ? "1" : "0"); } catch { /* storage bloqueado: sólo en memoria */ }
  emit();
}
export const toggleSidebar = (): void => setSidebarOpen(!state.open);

function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function useSidebar(): { available: boolean; open: boolean; ready: boolean } {
  return useSyncExternalStore(subscribe, () => state);
}
