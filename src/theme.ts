// GARY 🐾 — theme hook. Dark default; light first-class. Persists to localStorage now
// (Tauri settings later, spec 02). Flips `data-theme` on <html> so tokens + xterm re-derive.
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("gary-theme") as Theme) || "dark"
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("gary-theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

// Read a resolved token value from the DOM (used to skin the xterm terminal from the same tokens).
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
