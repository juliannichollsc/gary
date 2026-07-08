// GARY 🐾 — Mapa de ofertas (spec 04, components.md §F, PROMPTS §5). Full-bleed table that renders the
// scored offer map. Toolbar (search + channel/status filters + score-min) · per-channel collapsible
// groups · OfferRow with ScoreMeter + StatusBox + "Preparar aplicación".
//
// The Apply modal is CANCELLED (SESSION-CONTEXT 2026-07-02): "Preparar aplicación" hands off to the
// CHAT/supervisor. It builds a Spanish apply-intent prompt and seeds the Chat composer (the user still
// reviews and sends — "GARY no envía; el click final es tuyo"). No modal, no auto-submit.
import { useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Avatar, Button, Chip, ScoreMeter, StatusBox, type OfferStatus } from "../components/ui";
import { CvGenModal } from "../components/CvGenModal";
import { TutorialButton } from "../components/TutorialButton";
import { Search, ChevronDown, ChevronRight, File } from "../icons";
import { useReloadOnFocus } from "../hooks";
import { useT } from "../i18n";

// Abre una ruta local (CV) o una URL (oferta) con el sistema, vía el comando Rust `open_path`.
const openLocalPath = (path: string) => { invoke("open_path", { path }).catch(() => {}); };

// ---------- Data model ----------
// TODO(spec 07): this in-file mock is DERIVED from data/offers-master.md example rows so the view renders
// realistically offline. It will be replaced by the Rust `run_engine` / offers-master.md parser, which
// must emit this exact shape (company-deduped, 0–5 two-way-fit score, [ ]/[x]/[~] status). Candidate-agnostic.
export type Channel = "Gmail" | "LinkedIn" | "Indeed" | "GetOnBoard" | "Himalayas" | "Computrabajo" | "ATS";

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
const CHANNELS: Channel[] = ["Gmail", "LinkedIn", "Indeed", "GetOnBoard", "Himalayas", "Computrabajo", "ATS"];
const STATUSES: { value: OfferStatus; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "aplicada", label: "Aplicada" },
  { value: "flag", label: "Flag" },
];


// ---------- Detalle por oferta ----------
// Panel expandible: el CV tailored que GARY crea (nombre + variante + ubicación del archivo) y la
// descripción del rol / resumen del CV para ese ATS. Sustituye a las "respuestas borrador".
function OfferDetail({ offer: o, onRegenerate }: { offer: Offer; onRegenerate: (o: Offer) => void }) {
  const t = useT();
  const hasCv = !!o.cvFile;
  return (
    <div className="offerdetail" role="region" aria-label={o.company}>
      <div className="offerdetail__grid">
        <section className="offerdetail__block">
          <h3 className="offerdetail__label">{t("of.detail.cv")}</h3>
          {hasCv ? (
            <>
              <div className="offerdetail__cv">
                <File width={16} height={16} />
                <span className="offerdetail__cvname">{o.cvFile}</span>
                {o.cvVariant && <span className="badge badge--variant">{o.cvVariant}</span>}
              </div>
              {o.cvPath && (
                <div className="offerdetail__path" title={o.cvPath}>
                  <span className="offerdetail__pathlabel">{t("of.detail.location")}</span>
                  <code>{o.cvPath}</code>
                </div>
              )}
              <div className="offerdetail__actions">
                <Button variant="ghost" size="sm" onClick={() => o.cvPath && openLocalPath(o.cvPath)}>{t("of.detail.viewpdf")}</Button>
                <Button variant="ghost" size="sm" onClick={() => onRegenerate(o)}>{t("of.detail.regen")}</Button>
              </div>
            </>
          ) : (
            <p className="offerdetail__empty">{t("of.detail.nocv")}</p>
          )}
        </section>

        <section className="offerdetail__block">
          <h3 className="offerdetail__label">{t("of.detail.roledesc")}</h3>
          <p className="offerdetail__summary">{o.roleSummary ?? ""}</p>
          <button className="offerdetail__link" onClick={() => openLocalPath(o.url)}>{t("of.detail.viewoffer")}</button>
        </section>
      </div>
    </div>
  );
}

// ---------- View ----------
export function OffersView({ onPrepareApply }: { onPrepareApply: (offer: Offer) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<Set<Channel>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<OfferStatus>>(new Set());
  const [minScore, setMinScore] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<Channel>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null); // oferta con el detalle abierto
  const [regen, setRegen] = useState<Offer | null>(null); // oferta cuyo CV se está regenerando
  // GARY arranca DE 0: sin ofertas hasta que el terminal corra un hunt y escriba data/offers-master.md,
  // parseado por el comando Rust `read_offers`. Sin backend/datos → vacío (empty state). Recarga al entrar
  // y al recuperar foco: el agente pudo MERGEar survivors nuevos mientras estabas en el chat.
  const [offers, setOffers] = useState<Offer[]>([]);
  const reload = useCallback(() => {
    invoke<Offer[]>("read_offers").then((o) => setOffers(o ?? [])).catch(() => {});
  }, []);
  useReloadOnFocus(reload);

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  };

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

  const total = filtered.length;
  const applied = filtered.filter((o) => o.status === "aplicada").length;

  return (
    <div className="view offers">
      <header className="viewhead">
        <h1 className="viewhead__title">{t("nav.offers")}</h1>
        <TutorialButton />
        <span className="badge badge--mono">{offers.length}</span>
      </header>

      {/* Toolbar: search · channel chips · status chips · score-min · summary */}
      <div className="offers__toolbar" role="search">
        <label className="offers__search">
          <Search width={16} height={16} />
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t("of.search")} aria-label={t("of.search")} autoComplete="off"
          />
        </label>

        <div className="offers__filters" role="group" aria-label="Filtrar por canal">
          {CHANNELS.map((c) => (
            <Chip key={c} label={c} active={channelFilter.has(c)}
                  onClick={() => setChannelFilter((s) => toggle(s, c))} />
          ))}
        </div>

        <div className="offers__filters" role="group" aria-label="Filtrar por estado">
          {STATUSES.map((s) => (
            <Chip key={s.value} label={t(`of.status.${s.value}`)} active={statusFilter.has(s.value)}
                  onClick={() => setStatusFilter((set) => toggle(set, s.value))} />
          ))}
        </div>

        <label className="offers__scoremin">
          <span className="offers__scoremin-label">{t("of.scoremin")}</span>
          <input
            type="range" min={0} max={5} step={0.5} value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            aria-label="Puntaje mínimo" aria-valuetext={minScore.toFixed(1)}
          />
          <span className="offers__scoremin-val">{minScore.toFixed(1)}</span>
        </label>

        <div className="offers__summary" aria-live="polite">
          <strong>{total}</strong> {t("of.offers")} · <strong>{applied}</strong> {t("of.applied")}
        </div>
      </div>

      {/* Persistent Submit-guard (apply-initiation surface; design-system §6) */}
      <div className="offers__guard" role="note">{t("of.guard")}</div>

      {/* Grouped table */}
      {offers.length === 0 ? (
        <div className="empty">
          <Avatar kind="brand" size={64} />
          <div className="empty__title">{t("of.empty.title")}</div>
          <div className="empty__body">{t("of.empty.body")}</div>
        </div>
      ) : groups.length === 0 ? (
        <div className="empty">
          <Avatar kind="brand" size={64} />
          <div className="empty__title">{t("of.nomatch.title")}</div>
          <div className="empty__body">{t("of.nomatch.body")}</div>
        </div>
      ) : (
        <div className="offers__table" role="table" aria-label="Ofertas por canal">
          <div className="offers__colhead offers__grid" role="row">
            <span role="columnheader">{t("of.col.company")}</span>
            <span role="columnheader">{t("of.col.channel")}</span>
            <span role="columnheader">{t("of.col.score")}</span>
            <span role="columnheader">{t("of.col.status")}</span>
            <span role="columnheader" className="offers__colhead-action">{t("of.col.action")}</span>
          </div>

          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.channel);
            return (
              <section key={g.channel} className="offers__group" role="rowgroup">
                <button
                  className="offers__grouphead"
                  aria-expanded={!isCollapsed}
                  onClick={() => setCollapsed((s) => toggle(s, g.channel))}
                >
                  {isCollapsed ? <ChevronRight width={16} height={16} /> : <ChevronDown width={16} height={16} />}
                  <span className="offers__groupname">{g.channel}</span>
                  <span className="offers__groupcount">{g.offers.length}</span>
                </button>

                {!isCollapsed &&
                  g.offers.map((o, i) => {
                    const isOpen = expanded === o.id;
                    return (
                      <div key={o.id} className="offerrow-wrap" style={{ "--i": i } as React.CSSProperties}>
                        <div
                          className={`offerrow offers__grid ${isOpen ? "offerrow--open" : ""}`}
                          role="row" aria-expanded={isOpen}
                          onClick={() => setExpanded(isOpen ? null : o.id)}
                        >
                          <div className="offerrow__co" role="cell">
                            <span className="offerrow__disc" aria-hidden>
                              {isOpen ? <ChevronDown width={15} height={15} /> : <ChevronRight width={15} height={15} />}
                            </span>
                            <span className="offerrow__cotext">
                              <span className="offerrow__company">{o.company}</span>
                              <span className="offerrow__role">{o.role}</span>
                              {o.meta && <span className="offerrow__meta">{o.meta}</span>}
                            </span>
                          </div>
                          <div role="cell"><Chip label={o.channel} /></div>
                          <div role="cell"><ScoreMeter score={o.score} /></div>
                          <div role="cell"><StatusBox status={o.status} /></div>
                          <div role="cell" className="offerrow__action">
                            <button
                              className={`btn btn--sm ${o.score >= 4 ? "btn--primary" : "btn--secondary"}`}
                              onClick={(e) => { e.stopPropagation(); onPrepareApply(o); }}
                            >
                              {t("of.prepare")}
                            </button>
                          </div>
                        </div>
                        {isOpen && <OfferDetail offer={o} onRegenerate={setRegen} />}
                      </div>
                    );
                  })}
              </section>
            );
          })}
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
