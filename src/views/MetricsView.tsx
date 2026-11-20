// GARY 🐾 — Métricas (components.md §F2, PROMPTS §8). Registro de hunts en dos pestañas que NO se
// mezclan: "Actual" (la última consulta) y "Anteriores" (el histórico sin ella). Cada una: overview +
// jobs reales por fuente (+ lista de consultas en Anteriores). Datos vía src/metrics.ts (mock hasta que exista
// read_metrics en Rust). Candidate- y model-agnostic; cifras en JetBrains Mono vía tokens.
import { useCallback, useMemo, useState } from "react";
import {
  type Hunt, type MetricsData, SOURCES,
  loadMetrics, splitHunts, totalQueries, totalFound, totalReal, totalTokens, activeSources, realBySource,
} from "../metrics";
import { EmptyState } from "../components/states";
import { SegmentedControl } from "../components/ui";
import { useReloadOnFocus } from "../hooks";
import { useT } from "../i18n";
import "../styles/metrics.css";

export function MetricsView({ onStartSearch }: { onStartSearch?: () => void }) {
  const t = useT();
  const [data, setData] = useState<MetricsData>({ hunts: [] });
  const [tab, setTab] = useState<"current" | "previous">("current");

  // Recarga al entrar y al recuperar foco: el agente pudo APPENDear un hunt nuevo a data/metrics.md.
  const reload = useCallback(() => { loadMetrics().then(setData); }, []);
  useReloadOnFocus(reload);

  // Actual = última fila; Anteriores = el resto. Los agregados se calculan SOLO sobre la pestaña visible.
  const { current, previous } = useMemo(() => splitHunts(data), [data]);
  const view = tab === "current" ? current : previous;
  const stats = useMemo(() => ({
    queries: totalQueries(view),
    found: totalFound(view),
    real: totalReal(view),
    tokens: totalTokens(view),
    active: activeSources(view),
    bySource: realBySource(view),
  }), [view]);

  // Escala del chart: el máximo por fuente (evita dividir por 0 cuando no hay datos).
  const maxSource = Math.max(1, ...SOURCES.map((s) => stats.bySource[s]));

  // Consultas anteriores, la más reciente primero (el log guarda las más nuevas al final).
  const recent = useMemo(() => [...previous.hunts].reverse(), [previous.hunts]);
  const latest = current.hunts[0];

  return (
    <div className="view">
      <header className="viewhead">
        <h1 className="viewhead__title">{t("nav.metrics")}</h1>
      </header>

      {!latest ? (
        <EmptyState title={t("me.empty.title")} body={t("me.empty.body")}
                    action={onStartSearch && { label: t("ch.quick.search"), onClick: onStartSearch }} />
      ) : (
      <div className="metrics">
        <p className="metrics__intro">{t("me.intro")}</p>

        <SegmentedControl
          ariaLabel={t("nav.metrics")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "current", label: t("me.tab.current") },
            { value: "previous", label: `${t("me.tab.previous")} (${previous.hunts.length})` },
          ]}
        />

        {tab === "previous" && previous.hunts.length === 0 ? (
          <p className="metrics__sectionhint">{t("me.previous.empty")}</p>
        ) : (
        <>
        {tab === "current" && (
          <p className="metrics__caption">
            {t("me.current.caption").replace("{date}", formatTime(latest.date)).replace("{model}", latest.model)}
            <MismatchWarn h={latest} />
          </p>
        )}

        {/* Overview */}
        <section className="metrics__section" aria-label="Resumen">
          <div className="metrics__overview">
            {tab === "previous" && <Stat label={t("me.stat.queries")} value={String(stats.queries)} hint="" />}
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
            <p className="metrics__sectionhint">{t(tab === "current" ? "me.chart.hint.current" : "me.chart.hint.previous")}</p>
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

        {/* QueryHistoryPanel — consultas anteriores */}
        {tab === "previous" && (
        <section className="metrics__section" aria-label="Últimas consultas">
          <div>
            <h2 className="metrics__sectiontitle">{t("me.history.title")}</h2>
            <p className="metrics__sectionhint">{t("me.history.hint")}</p>
          </div>
          <div className="qhistory">
            {recent.map((h, i) => (
              <div className="qhistory__row" key={`${h.date}-${i}`}>
                <span className="qhistory__time">{formatTime(h.date)}</span>
                <span className="qhistory__model" title={h.model}>{h.model}</span>
                <span className="qhistory__tokens">{fmtTokens(h.tokens)} tok</span>
                <span className="qhistory__counts">
                  <span className="qhistory__real">{h.real}</span>
                  <span className="qhistory__sep">/</span>
                  <span className="qhistory__total">{h.total}</span>
                  <span className="qhistory__sep">reales/total</span>
                  <MismatchWarn h={h} />
                </span>
              </div>
            ))}
          </div>
        </section>
        )}
        </>
        )}
      </div>
      )}
    </div>
  );
}

// Invariants of data/metrics.md: per-source sum == real, real <= total → flag a row that breaks them.
function MismatchWarn({ h }: { h: Hunt }) {
  const t = useT();
  const sum = SOURCES.reduce((a, s) => a + (h.bySource[s] ?? 0), 0);
  if (sum === h.real && h.real <= h.total) return null;
  return <span className="qhistory__warn" title={t("me.history.mismatch").replace("{sum}", String(sum))}>⚠</span>;
}

// Tarjeta de resumen (cifra en mono).
function Stat({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`statcard${accent ? " statcard--accent" : ""}`}>
      <span className="statcard__label">{label}</span>
      <span className="statcard__value">
        {value}{hint && <span className="statcard__hint">{hint}</span>}
      </span>
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
