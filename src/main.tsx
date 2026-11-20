// GARY 🐾 — React entry. Mounts the app shell; the Chat view owns the embedded terminal (PTY bridge).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/app.css";
import App from "./App";
import { Titlebar } from "./components/Titlebar";
import { TutorialProvider } from "./tutorial";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* El tutorial envuelve también la Titlebar: su botón de ayuda es el único punto de entrada global. */}
    <TutorialProvider>
      <div className="gary-shell">
        <Titlebar />
        <div className="gary-shell__body">
          <App />
        </div>
      </div>
    </TutorialProvider>
  </StrictMode>
);
