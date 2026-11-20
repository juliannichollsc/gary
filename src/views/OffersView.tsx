// GARY 🐾 — Mapa de ofertas (spec 04, components.md §F, PROMPTS §5). Full-bleed table that renders the
// scored offer map. Toolbar (search + channel/status filters + score-min) · per-channel collapsible
// groups · OfferRow with ScoreMeter + StatusBox + "Preparar aplicación".
//
// The Apply modal is CANCELLED (SESSION-CONTEXT 2026-07-02): "Preparar aplicación" hands off to the
// CHAT/supervisor. It builds a Spanish apply-intent prompt and seeds the Chat composer (the user still
// reviews and sends — "GARY no envía; el click final es tuyo"). No modal, no auto-submit.
//
// Detail = a side DRAWER (the table stays visible, selection highlighted) instead of an inline expand.
// Keyboard: j/k or ↑/↓ move the selection, Enter opens/closes the detail, Esc closes it, "/" focuses search.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { invoke } from "@tauri-apps/api/core";
import { Button, ScoreMeter, StatusBox, type OfferStatus } from "../components/ui";
import { EmptyState, ErrorState, SkeletonRows } from "../components/states";
import { FilterMenu } from "../components/FilterMenu";
import { CvGenModal } from "../components/CvGenModal";
import { Search, ChevronDown, ChevronRight, File, X, ExternalLink, Info, RowsComfortable, RowsCompact } from "../icons";
import { useReloadOnFocus } from "../hooks";
import { useToast } from "../toast";
import { useT } from "../i18n";

// Bajo Tauri existe el puente IPC; en `pnpm dev` dentro de un navegador normal no → tratamos como "sin datos".
const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ---------- Data model ----------
// TODO(spec 07): this in-file mock is DERIVED from data/offers-master.md example rows so the view renders
// realistically offline. It will be replaced by the Rust `run_engine` / offers-master.md parser, which
// must emit this exact shape (company-deduped, 0–5 two-way-fit score, [ ]/[x]/[~] status). Candidate-agnostic.
export type Channel = "Gmail" | "LinkedIn" | "Indeed" | "GetOnBoard" | "Himalayas" | "Computrabajo" | "Dice" | "Hireline" | "Glassdoor" | "Dover" | "ATS" | "Web";

export interface Offer {
  id: string;
  company: string;
  role: string;
  channel: Channel;
  score: number;        // 0–5 two-way-fit
  status: OfferStatus;  // pendiente [ ] · aplicada [x] · flag [~]
  url: string;
  meta?: string;        // comp / location, shown in mono
  // Detalle por oferta (el CV tailored que GARY crea es throwaway, uno por oferta):
  cvFile?: string;      // nombre del CV adaptado para esta oferta
  cvVariant?: string;   // variante de rol usada (Frontend / Fullstack / Backend)
  cvPath?: string;      // ubicación del archivo en disco
  roleSummary?: string; // descripción del rol / resumen del CV para ese ATS (reemplaza "respuestas borrador")
}

// "ATS" = ofertas del scanner zero-token de 16 providers (engines/scan.mjs), aparte de las conexiones.
// "Web" = páginas de empresa halladas por la búsqueda web del LM en la sesión (skill source-web, sin bots).
const CHANNELS: Channel[] = ["Gmail", "LinkedIn", "Indeed", "GetOnBoard", "Himalayas", "Computrabajo", "Dice", "Hireline", "Glassdoor", "Dover", "ATS", "Web"];
const STATUSES: { value: OfferStatus; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "aplicada", label: "Aplicada" },
  { value: "flag", label: "Flag" },
];


// ---------- Detalle por oferta (drawer lateral) ----------
// El CV tailored que GARY crea (nombre + variante + ubicación) y la descripción del rol / resumen del CV
// para ese ATS, con la acción principal ("Preparar aplicación") a mano.
function OfferDrawer({ offer: o, onClose, onPrepare, onRegenerate, onOpen }: {
  offer: Offer; onClose: () => void; onPrepare: (o: Offer) => void; onRegenerate: (o: Offer) => void;
  onOpen: (path: string) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  // Entrada: desliza 16px + fade sólo al ABRIR (cambiar de oferta con j/k no re-anima el panel).
  useLayoutEffect(() => {
    if (!ref.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(ref.current, { opacity: 0, x: 16 }, { opacity: 1, x: 0, duration: 0.22, ease: "power3.out" });
  }, []);

  return (
    <aside className="offerdrawer" ref={ref} aria-label={`${o.company} — ${o.role}`}>
      <header className="offerdrawer__head">
        <div className="offerdrawer__title">
          <h2 className="offerdrawer__company">{o.company}</h2>
          <p className="offerdrawer__role">{o.role}</p>
        </div>
        <button className="offerdrawer__close" onClick={onClose} aria-label={t("common.close")}>
          <X width={16} height={16} />
        </button>
      </header>

      <div className="offerdrawer__facts">
        <ScoreMeter score={o.score} />
        <StatusBox status={o.status} />
        <span className="offerdrawer__channel">{o.channel}</span>
      </div>
      {o.meta && <p className="offerdrawer__meta">{o.meta}</p>}

      <section className="offerdrawer__block">
        <h3 className="offerdrawer__label">{t("of.detail.roledesc")}</h3>
        {o.roleSummary
          ? <p className="offerdrawer__text">{o.roleSummary}</p>
          : <p className="offerdrawer__text offerdrawer__text--muted">{t("of.detail.nosummary")}</p>}
        <button className="offerdrawer__link" onClick={() => onOpen(o.url)}>
          {t("of.detail.viewoffer")} <ExternalLink width={13} height={13} aria-hidden />
        </button>
      </section>

      <section className="offerdrawer__block">
        <h3 className="offerdrawer__label">{t("of.detail.cv")}</h3>
        {o.cvFile ? (
          <>
            <div className="offerdrawer__cv">
              <File width={16} height={16} aria-hidden />
              <span className="offerdrawer__cvname">{o.cvFile}</span>
              {o.cvVariant && <span className="badge badge--variant">{o.cvVariant}</span>}
            </div>
            {o.cvPath && <code className="offerdrawer__path" title={o.cvPath}>{o.cvPath}</code>}
            <div className="offerdrawer__actions">
              <Button variant="ghost" size="sm" disabled={!o.cvPath} onClick={() => o.cvPath && onOpen(o.cvPath)}>{t("of.detail.viewpdf")}</Button>
              <Button variant="ghost" size="sm" onClick={() => onRegenerate(o)}>{t("of.detail.regen")}</Button>
            </div>
          </>
        ) : (
          <p className="offerdrawer__text offerdrawer__text--muted">{t("of.detail.nocv")}</p>
        )}
      </section>

      <footer className="offerdrawer__foot">
        {/* Computrabajo, Dice y Hireline son las excepciones a "nunca enviar" (decisión del owner): se dice explícito. */}
        <p className={`offerdrawer__guard ${["Computrabajo", "Dice", "Hireline"].includes(o.channel) ? "offerdrawer__guard--auto" : ""}`}>
          {o.channel === "Computrabajo" ? t("of.guard.ct") : o.channel === "Dice" ? t("of.guard.dice") : o.channel === "Hireline" ? t("of.guard.hireline") : t("of.guard.short")}
        </p>
        <Button variant={o.score >= 4 ? "primary" : "secondary"} onClick={() => onPrepare(o)}>{t("of.prepare")}</Button>
      </footer>
    </aside>
  );
}

// ---------- View ----------
export function OffersView({ onPrepareApply, onStartSearch, focusOfferId, onFocusConsumed }: {
  onPrepareApply: (offer: Offer) => void;
  onStartSearch?: () => void;
  focusOfferId?: string | null;   // abrir esta oferta al entrar (paleta de comandos)
  onFocusConsumed?: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<Set<Channel>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<OfferStatus>>(new Set());
  const [minScore, setMinScore] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<Channel>>(new Set());
  const [selected, setSelected] = useState<string | null>(null); // fila con el cursor (teclado/click)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [regen, setRegen] = useState<Offer | null>(null); // oferta cuyo CV se está regenerando
  const searchRef = useRef<HTMLInputElement>(null);
  // Densidad de filas (preferencia por usuario): cómoda (2–3 líneas por oferta) o compacta (una línea).
  const [density, setDensity] = useState<"comfortable" | "compact">(() => {
    try { return localStorage.getItem("gary-offers-density") === "compact" ? "compact" : "comfortable"; } catch { return "comfortable"; }
  });
  const pickDensity = (d: "comfortable" | "compact") => {
    setDensity(d);
    try { localStorage.setItem("gary-offers-density", d); } catch { /* sólo en memoria */ }
  };
  const tableRef = useRef<HTMLDivElement>(null);

  // GARY arranca DE 0: sin ofertas hasta que el terminal corra un hunt y escriba data/offers-master.md,
  // parseado por el comando Rust `read_offers`. Recarga al entrar y al recuperar foco: el agente pudo
  // MERGEar survivors nuevos mientras estabas en el chat. Error real del core → ErrorState con reintento.
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false); // skeleton sólo si la primera carga pasa de 300ms
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!inTauri()) { setLoading(false); return; }
    invoke<Offer[]>("read_offers")
      .then((o) => { setOffers(o ?? []); setError(null); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);
  useReloadOnFocus(reload);
  useEffect(() => {
    if (!loading) return;
    const id = window.setTimeout(() => setSlow(true), 300);
    return () => clearTimeout(id);
  }, [loading]);

  // Abre una ruta local (CV) o una URL (oferta) con el sistema, vía `open_path`. Fallo → toast con la causa.
  const openLocalPath = useCallback((path: string) => {
    invoke("open_path", { path }).catch((e) => toast.show({ type: "danger", message: `${t("toast.open.failed")}: ${e}` }));
  }, [toast, t]);

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  };
  const clearFilters = () => { setQuery(""); setChannelFilter(new Set()); setStatusFilter(new Set()); setMinScore(0); };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return offers.filter((o) => {
      if (q && !(o.company.toLowerCase().includes(q) || o.role.toLowerCase().includes(q))) return false;
      if (channelFilter.size && !channelFilter.has(o.channel)) return false;
      if (statusFilter.size && !statusFilter.has(o.status)) return false;
      if (o.score < minScore) return false;
      return true;
    });
  }, [offers, query, channelFilter, statusFilter, minScore]);

  const groups = useMemo(
    () =>
      CHANNELS.map((channel) => ({
        channel,
        offers: filtered
          .filter((o) => o.channel === channel)
          .sort((a, b) => b.score - a.score),
      })).filter((g) => g.offers.length > 0),
    [filtered]
  );

  // Orden visual de las filas visibles (grupos expandidos) → navegación j/k.
  const visible = useMemo(
    () => groups.flatMap((g) => (collapsed.has(g.channel) ? [] : g.offers)),
    [groups, collapsed]
  );
  const current = visible.find((o) => o.id === selected) ?? null;
  const showDrawer = drawerOpen && current;

  // Oferta pedida desde la paleta: limpia filtros, expande su canal, la selecciona y abre el detalle.
  useEffect(() => {
    if (!focusOfferId || loading) return;
    const o = offers.find((x) => x.id === focusOfferId);
    if (o) {
      clearFilters();
      setCollapsed((s) => { const n = new Set(s); n.delete(o.channel); return n; });
      setSelected(o.id); setDrawerOpen(true);
    }
    onFocusConsumed?.();
  }, [focusOfferId, loading, offers]);

  // Mantén la fila seleccionada a la vista.
  useEffect(() => {
    if (!selected) return;
    const row = tableRef.current?.querySelector<HTMLElement>(`[data-offer="${CSS.escape(selected)}"]`);
    if (!row) return;
    // Roving focus: la fila seleccionada recibe el foco (Enter la abre), salvo que el usuario esté escribiendo.
    const a = document.activeElement as HTMLElement | null;
    if (!a || !(a.tagName === "INPUT" || a.tagName === "TEXTAREA")) row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const move = (delta: number) => {
    if (!visible.length) return;
    const i = visible.findIndex((o) => o.id === selected);
    const next = i < 0 ? (delta > 0 ? 0 : visible.length - 1) : Math.max(0, Math.min(visible.length - 1, i + delta));
    setSelected(visible[next].id);
  };

  // Atajos de la vista. Ignorados mientras se escribe en un campo (salvo Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
      if (e.key === "Escape" && drawerOpen && !regen) { setDrawerOpen(false); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || regen) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter" && selected && !(el.closest("button") && !el.classList.contains("offerrow"))) {
        e.preventDefault(); setDrawerOpen((d) => !d);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const total = filtered.length;
  const applied = filtered.filter((o) => o.status === "aplicada").length;

  let content;
  if (error) {
    content = <ErrorState title={t("of.error.title")} detail={error} onRetry={() => { setLoading(true); reload(); }} />;
  } else if (loading) {
    content = slow ? <SkeletonRows label={t("common.loading")} /> : null;
  } else if (offers.length === 0) {
    content = <EmptyState title={t("of.empty.title")} body={t("of.empty.body")}
                          action={onStartSearch && { label: t("ch.quick.search"), onClick: onStartSearch }} />;
  } else if (groups.length === 0) {
    content = <EmptyState title={t("of.nomatch.title")} body={t("of.nomatch.body")}
                          action={{ label: t("of.clearfilters"), onClick: clearFilters }} />;
  } else {
    content = (
      <div className="offers__table" role="grid" aria-label={t("of.table.label")} ref={tableRef}
           aria-rowcount={visible.length + 1}>
        <div className="offers__colhead offers__grid" role="row">
          <span role="columnheader">{t("of.col.company")}</span>
          <span role="columnheader">{t("of.col.score")}</span>
          <span role="columnheader">{t("of.col.status")}</span>
          <span role="columnheader" className="offers__colhead-action"><span className="sr-only">{t("of.col.action")}</span></span>
        </div>

        {groups.map((g) => {
          const isCollapsed = collapsed.has(g.channel);
          return (
            <section key={g.channel} className="offers__group" role="rowgroup">
              <div role="row">
                <div role="gridcell" aria-colspan={4}>
                  <button
                    className="offers__grouphead"
                    aria-expanded={!isCollapsed}
                    onClick={() => setCollapsed((s) => toggle(s, g.channel))}
                  >
                    {isCollapsed ? <ChevronRight width={16} height={16} aria-hidden /> : <ChevronDown width={16} height={16} aria-hidden />}
                    <span className="offers__groupname">{g.channel}</span>
                    <span className="offers__groupcount">{g.offers.length}</span>
                  </button>
                </div>
              </div>

              {!isCollapsed &&
                g.offers.map((o, i) => {
                  const isSel = selected === o.id;
                  return (
                    <div key={o.id} className="offerrow-wrap" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                      <div
                        data-offer={o.id}
                        className={`offerrow offers__grid ${isSel ? "offerrow--selected" : ""} ${isSel && showDrawer ? "offerrow--open" : ""}`}
                        role="row" aria-selected={isSel}
                        tabIndex={isSel || (!current && visible[0]?.id === o.id) ? 0 : -1}
                        onClick={() => { setSelected(o.id); setDrawerOpen(true); }}
                      >
                        <div className="offerrow__co" role="gridcell">
                          <span className="offerrow__cotext">
                            <span className="offerrow__company">{o.company}</span>
                            <span className="offerrow__role">{o.role}</span>
                            {o.meta && <span className="offerrow__meta">{o.meta}</span>}
                          </span>
                        </div>
                        <div role="gridcell"><ScoreMeter score={o.score} /></div>
                        <div role="gridcell"><StatusBox status={o.status} /></div>
                        <div role="gridcell" className="offerrow__action">
                          <button
                            className={`btn btn--sm ${o.score >= 4 ? "btn--primary" : "btn--secondary"}`}
                            onClick={(e) => { e.stopPropagation(); onPrepareApply(o); }}
                          >
                            {t("of.prepare")}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`view offers ${density === "compact" ? "offers--compact" : ""}`}>
      <header className="viewhead">
        <h1 className="viewhead__title">{t("nav.offers")}</h1>
      </header>

      {/* Toolbar: search · channel chips · status chips · score-min · summary */}
      <div className="offers__toolbar" role="search">
        <label className="offers__search">
          <Search width={16} height={16} aria-hidden />
          <input
            ref={searchRef}
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t("of.search")} aria-label={t("of.search")} autoComplete="off"
            aria-keyshortcuts="/"
          />
          <kbd className="kbd" aria-hidden>/</kbd>
        </label>

        <FilterMenu label={t("of.col.channel")} options={CHANNELS.map((c) => ({ value: c, label: c }))}
                    selected={channelFilter} onToggle={(c) => setChannelFilter((s) => toggle(s, c))}
                    onClear={() => setChannelFilter(new Set())} />
        <FilterMenu label={t("of.col.status")}
                    options={STATUSES.map((s) => ({ value: s.value, label: t(`of.status.${s.value}`) }))}
                    selected={statusFilter} onToggle={(v) => setStatusFilter((s) => toggle(s, v))}
                    onClear={() => setStatusFilter(new Set())} />

        <label className="offers__scoremin">
          <span className="offers__scoremin-label">{t("of.scoremin")}</span>
          <input
            type="range" min={0} max={5} step={0.5} value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            aria-label={t("of.scoremin")} aria-valuetext={minScore.toFixed(1)}
          />
          <span className="offers__scoremin-val">{minScore.toFixed(1)}</span>
        </label>

        <div className="segmented segmented--icons" role="radiogroup" aria-label={t("of.density")}>
          {(["comfortable", "compact"] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={density === d}
                    className={`segmented__item ${density === d ? "segmented__item--active" : ""}`}
                    onClick={() => pickDensity(d)} title={t(`of.density.${d}`)} aria-label={t(`of.density.${d}`)}>
              {d === "comfortable" ? <RowsComfortable width={15} height={15} /> : <RowsCompact width={15} height={15} />}
            </button>
          ))}
        </div>

        <div className="offers__summary" aria-live="polite">
          <strong>{total}</strong> {t("of.offers")}, <strong>{applied}</strong> {t("of.applied")}
        </div>
      </div>

      {/* Persistent Submit-guard (apply-initiation surface; design-system §6) */}
      <div className="offers__guard" role="note"><Info width={14} height={14} aria-hidden /> <span>{t("of.guard")}</span></div>

      <div className={`offers__body ${showDrawer ? "offers__body--drawer" : ""}`}>
        {content}
        {showDrawer && (
          <OfferDrawer offer={current} onClose={() => setDrawerOpen(false)} onPrepare={onPrepareApply}
                       onRegenerate={setRegen} onOpen={openLocalPath} />
        )}
      </div>

      {!loading && !error && visible.length > 0 && (
        <div className="offers__keys" aria-hidden>
          <span><kbd className="kbd">j</kbd><kbd className="kbd">k</kbd> {t("of.keys.move")}</span>
          <span><kbd className="kbd">Enter</kbd> {t("of.keys.open")}</span>
          <span><kbd className="kbd">Esc</kbd> {t("of.keys.close")}</span>
        </div>
      )}

      {regen && (
        <CvGenModal
          title={t("of.gen.title")}
          subtitle={`${regen.company} — ${regen.role}`}
          onDone={() => setRegen(null)}
        />
      )}
    </div>
  );
}
