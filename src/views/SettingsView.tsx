// GARY 🐾 — Ajustes. NO configuramos el modelo/CLI ni la API key: eso se decide en el Chat (terminal
// libre) y no intervenimos. Aquí gestionas tu CONTEXTO (el CV que GARY ingesta en NotebookLM) y el
// navegador de automatización. El "Actualizar CV" re-ingesta para refrescar el contexto.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, StatusDot, Input } from "../components/ui";
import { File } from "../icons";
import type { ViewId } from "../components/Sidebar";
import { TutorialButton } from "../components/TutorialButton";
import { loadOnboarding, type CvFile } from "../onboarding";
import {
  DEFAULTS, BROWSERS, type BrowserId, type Settings,
  PERF_LEVELS, type PerfLevel, recommendPerf,
  loadSettings, saveSettings, detectBrowsers,
  browserStatus, startBrowser, stopBrowser, type BrowserStatus,
  openInBrowser,
} from "../settings";
import { useT, useLang, setLang, LANGS, type Lang } from "../i18n";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Ruta convencional del CV base en disco (best-effort para "Ver CV"; el comando Rust open_path llega en spec 07).
const cvPath = (name: string) => `data/cv/base/${name}`;
const openLocalPath = (path: string) => { invoke("open_path", { path }).catch(() => {}); };

export function SettingsView({ onNavigate }: { onNavigate?: (v: ViewId) => void }) {
  const t = useT();
  const lang = useLang();
  const recommended = recommendPerf();
  const [cv, setCv] = useState<CvFile | null>(null);
  const [notebookId, setNotebookId] = useState<string | undefined>(undefined);
  const [browser, setBrowser] = useState<BrowserStatus>({ running: false, port: DEFAULTS.browserPort });
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [browsers, setBrowsers] = useState(BROWSERS);

  // URL del notebook del usuario (el específico si ya existe; si no, la home de NotebookLM).
  const notebookUrl = notebookId
    ? `https://notebooklm.google.com/notebook/${notebookId}`
    : "https://notebooklm.google.com/";

  useEffect(() => {
    loadOnboarding().then((s) => { setCv(s.file); setNotebookId(s.notebookId); });
    loadSettings().then(setSettings);
    detectBrowsers().then(setBrowsers);
    // Sondea el estado del navegador para reflejar cierres (manuales o Detener) → "Corriendo/Detenido".
    const refresh = () => browserStatus().then(setBrowser);
    refresh();
    const id = window.setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  // Persiste al vuelo (sin SaveBar): navegador elegido + puerto.
  const patch = (p: Partial<Settings>) =>
    setSettings((prev) => { const next = { ...prev, ...p }; saveSettings(next); return next; });

  const onStartBrowser = async () => {
    const s = await startBrowser(settings.browser, settings.browserPort);
    if (s) setBrowser(s);
  };
  const onStopBrowser = async () => { const s = await stopBrowser(); if (s) setBrowser(s); };

  // Abrir NotebookLM en el MISMO navegador de automatización (:9333) donde vive la sesión de Google —
  // NO en el navegador por defecto del SO (antes abría Brave). Si no corre, lo arranca y luego abre la URL.
  const onOpenNotebook = async () => {
    let b = browser;
    if (!b.running) { const s = await startBrowser(settings.browser, settings.browserPort); if (s) { setBrowser(s); b = s; } }
    await openInBrowser(notebookUrl);
  };

  return (
    <div className="view">
      <header className="viewhead"><h1 className="viewhead__title">{t("settings.title")}</h1><TutorialButton /></header>

      <div className="settings">
        <p className="settings__intro">{t("settings.intro")}</p>

        {/* 1) Contexto: CV / NotebookLM */}
        <section className="settings__section">
          <div className="settings__head">
            <h2>{t("settings.cv.title")}</h2>
            <p>{t("settings.cv.desc")}</p>
          </div>
          <div className="settings__control">
            {cv ? (
              <div className="filechip">
                <span className="filechip__icon"><File width={18} height={18} /></span>
                <span className="filechip__meta">
                  <span className="filechip__name">{cv.name}</span>
                  <span className="filechip__size">{fmtSize(cv.size)} · {cvPath(cv.name)}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => openLocalPath(cvPath(cv.name))}>{t("settings.cv.viewcv")}</Button>
              </div>
            ) : (
              <p className="settings__hint">{t("settings.cv.none")}</p>
            )}
            <div className="settings__control settings__control--row">
              <Button variant="primary" onClick={() => onNavigate?.("onboarding")}>
                {cv ? t("settings.cv.update") : t("settings.cv.upload")}
              </Button>
              <Button variant="secondary" onClick={onOpenNotebook}>
                {t("settings.cv.opennotebook")}
              </Button>
            </div>
          </div>
        </section>

        {/* 2) Navegador de automatización */}
        <section className="settings__section">
          <div className="settings__head">
            <h2>{t("settings.browser.title")}</h2>
            <p>{t("settings.browser.desc")}</p>
          </div>
          <div className="settings__control">
            {/* Selector de navegador — Chrome es el probado/recomendado */}
            <label className="field">
              <span className="field__label">{t("settings.browser.pick")}</span>
              <select
                className="input"
                value={settings.browser}
                onChange={(e) => patch({ browser: e.currentTarget.value as BrowserId })}
              >
                {browsers.map((b) => (
                  <option key={b.id} value={b.id} title={b.tested ? "Probado y recomendado" : undefined}>
                    {b.label}{b.tested ? " · recomendado" : ""}
                  </option>
                ))}
              </select>
              <span className="field__helper">{t("settings.browser.helper")}</span>
            </label>

            <div className="settings__control settings__control--row">
              <span className={`pill ${browser.running ? "pill--ok" : "pill--muted"}`}>
                <StatusDot status={browser.running ? "success" : "info"} />
                {browser.running ? `${t("settings.browser.running")} :${browser.port}` : t("settings.browser.stopped")}
              </span>
              <Button variant="primary" onClick={onStartBrowser} disabled={browser.running}>{t("settings.browser.start")}</Button>
              <Button variant="danger" onClick={onStopBrowser} disabled={!browser.running}>{t("settings.browser.stop")}</Button>
              <label className="field field--inline">
                <span className="field__label">{t("settings.browser.port")}</span>
                <Input type="number" className="input--port" aria-label="Puerto de depuración (CDP)"
                  title="Puerto de depuración remota (CDP) del navegador"
                  value={settings.browserPort}
                  onChange={(e) => patch({ browserPort: Number(e.currentTarget.value) || DEFAULTS.browserPort })} />
              </label>
            </div>
          </div>
        </section>

        {/* 3) Rendimiento — fuentes DISTINTAS en paralelo (nunca más bots por sitio) */}
        <section className="settings__section">
          <div className="settings__head">
            <h2>{t("perf.title")}</h2>
            <p>{t("perf.desc")}</p>
          </div>
          <div className="settings__control">
            <label className="field">
              <select className="input" value={settings.performance}
                      onChange={(e) => patch({ performance: e.currentTarget.value as PerfLevel })}>
                {PERF_LEVELS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t(`perf.${p.id}`)} · {p.parallel} {t("perf.parallel")}
                    {p.id === recommended ? ` · ${t("perf.recommended")}` : ""}
                  </option>
                ))}
              </select>
              <span className="field__helper">{t("perf.recommended")}: {t(`perf.${recommended}`)}</span>
            </label>
          </div>
        </section>

        {/* 4) Idioma */}
        <section className="settings__section">
          <div className="settings__head">
            <h2>{t("lang.title")}</h2>
            <p>{t("lang.desc")}</p>
          </div>
          <div className="settings__control">
            <label className="field">
              <select className="input" value={lang} onChange={(e) => setLang(e.currentTarget.value as Lang)}>
                {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
