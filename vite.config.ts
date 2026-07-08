import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GARY 🐾 — Vite config for the Tauri WebView2 (modern evergreen Chromium).
// Tauri expects a fixed port and no clearScreen so its logs stay visible.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },

  // The webview is a single, known-modern Chromium (WebView2 ships Edge/Chromium ≥ 105 on
  // supported Windows) — no legacy transpile needed. es2022 keeps output lean.
  build: {
    target: "es2022",
    minify: "esbuild",
    // Bump the warn limit slightly: xterm + React are legitimately chunky for a terminal app.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing vendor libs into their own long-lived cache chunks.
        manualChunks: {
          react: ["react", "react-dom"],
          xterm: ["@xterm/xterm", "@xterm/addon-fit"],
        },
      },
    },
  },
});
