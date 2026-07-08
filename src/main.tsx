// GARY 🐾 — React entry. Mounts the app shell; the Chat view owns the embedded terminal (PTY bridge).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./styles/tokens.css";
import "./styles/app.css";
import App from "./App";
import { Titlebar } from "./components/Titlebar";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="gary-shell">
      <Titlebar />
      <div className="gary-shell__body">
        <App />
      </div>
    </div>
  </StrictMode>
);
