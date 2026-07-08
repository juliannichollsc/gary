// GARY 🐾 — Métricas (components.md §F2, PROMPTS §8). Registro histórico de hunts: overview +
// jobs reales por fuente + últimas consultas. Datos vía src/metrics.ts (mock hasta que exista
// read_metrics en Rust). Candidate- y model-agnostic; cifras en JetBrains Mono vía tokens.
import { useCallback, useMemo, useState } from "react";
import {
  type MetricsData, type Source, SOURCES,
  loadMetrics, totalQueries, totalFound, totalReal, totalTokens, activeSources, realBySource,
} from "../metrics";
import { Avatar } from "../components/ui";
import { TutorialButton } from "../components/TutorialButton";
import { useReloadOnFocus } from "../hooks";
import { useT } from "../i18n";
import "../styles/metrics.css";

export function MetricsView() {
  const t = useT();
  const [data, setData] = useState<MetricsData>({ hunts: [] });

  // Recarga al entrar y al recuperar foco: el agente pudo APPENDear un hunt nuevo a data/metrics.md.
  const reload = useCallback(() => { loadMetrics().then(setData); }, []);
  useReloadOnFocus(reload);

  // Agregados para overview + chart (memo: realBySource recorre todos los hunts).
  const stats = useMemo(() => ({
    queries: totalQueries(data),
    found: totalFound(data),
    real: totalReal(data),
    tokens: totalTokens(data),
    active: activeSources(data),
    bySource: realBySource(data),
  }), [data]);

  // Escala del chart: el máximo por fuente (evita dividir por 0 cuando no hay datos).
  const maxSource = Math.max(1, ...SOURCES.map((s) => stats.bySource[s]));

  // Últimas consultas primero (el log guarda las más nuevas al final).
  const recent = useMemo(() => [...data.hunts].reverse(), [data.hunts]);

  return (
    <div className="view">
      <header className="viewhead">
        <h1 className="viewhead__title">{t("nav.metrics")}</h1>
        <TutorialButton />
        <span className="badge badge--mono">{stats.queries}</span>
      </header>

      {stats.queries === 0 ? (
        <div className="empty">
          <Avatar kind="brand" size={64} />
          <div className="empty__title">{t("me.empty.title")}</div>
          <div className="empty__body">{t("me.empty.body")}</div>
        </div>
      ) : (
      <div className="metrics">
        <p className="metrics__intro">{t("me.intro")}</p>

        {/* Overview */}
        <section className="metrics__section" aria-label="Resumen">
          <div className="metrics__overview">
            <Stat label={t("me.stat.queries")} value={String(stats.queries)} hint="" />
            <Stat label={t("me.stat.found")} value={String(stats.found)} hint="" />
            <Stat label={t("me.stat.real")} value={String(stats.real)} hint="" accent />
            <Stat label={t("me.stat.tokens")} value={fmtTokens(stats.tokens)} hint="" />
            <Stat label={t("me.stat.sources")} value={String(stats.active)} hint={`/ ${SOURCES.length}`} />
          </div>
        </section>

        {/* JobsBySourceChart — jobs reales por fuente */}
        <section className="metrics__section" aria-label="Jobs reales por fuente">
          <div>
            <h2 className="metrics__sectiontitle">{t("me.chart.title")}</h2>
            <p className="metrics__sectionhint">{t("me.chart.hint")}</p>
          </div>
          <div className="chart" role="list">
            {SOURCES.map((s) => {
              const v = stats.bySource[s];
              const pct = Math.round((v / maxSource) * 100);
              return (
                <div
                  key={s}
                  className={`chart__row${v === 0 ? " chart__row--empty" : ""}`}
                  role="listitem"
                  aria-label={`${s}: ${v} jobs reales`}
                >
                  <span className="chart__name">{s}</span>
                  <span className="chart__track" aria-hidden="true">
                    <span className="chart__bar" style={{ width: `${Math.max(pct, v > 0 ? 4 : 0)}%` }} />
                  </span>
                  <span className="chart__val" aria-hidden="true">{v}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* QueryHistoryPanel — últimas consultas */}
        <section className="metrics__section" aria-label="Últimas consultas">
          <div>
            <h2 className="metrics__sectiontitle">{t("me.history.title")}</h2>
            <p className="metrics__sectionhint">{t("me.history.hint")}</p>
          </div>
          <div className="qhistory">
            {recent.map((h) => (
              <div className="qhistory__row" key={h.date}>
                <span className="qhistory__time">{formatTime(h.date)}</span>
                <span className="qhistory__model" title={h.model}>{h.model}</span>
                <span className="qhistory__tokens">{fmtTokens(h.tokens)} tok</span>
                <span className="qhistory__counts">
                  <span className="qhistory__real">{h.real}</span>
                  <span className="qhistory__sep">/</span>
                  <span className="qhistory__total">{h.total}</span>
                  <span className="qhistory__sep">reales/total</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      )}
    </div>
  );
}

// Tarjeta de resumen (cifra en mono).
function Stat({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`statcard${accent ? " statcard--accent" : ""}`}>
      <span className="statcard__label">{label}</span>
      <span className="statcard__value">{value}</span>
      <span className="statcard__hint">{hint}</span>
    </div>
  );
}

// 12345 → "12.3k" · 1200000 → "1.2M" (cifras de tokens compactas).
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// "2026-07-02T11:05" → "2026-07-02 · 11:05" (formato estable, sin locale).
function formatTime(iso: string): string {
  const [d, t] = iso.split("T");
  return t ? `${d} · ${t}` : d;
}
