# Spec 04 — Mapa de ofertas

> Screen: `pencil/gary.pen` prompt 5. Components: `components.md` §F. Renders `data/offers-master.md`.

## Scope
- **FilterBar** — search + channel chips (Gmail/LinkedIn/Indeed/GetOnBoard/Himalayas/Computrabajo) + status
  filter ([ ]/[x]/[~]) + score-min slider. Summary "N ofertas · M aplicadas".
- **OffersSummary** — persistent totals and compact operational context (queries run, active sources, jobs
  found) for the current hunt.
- **ChannelGroup** — collapsible per-channel section with count.
- **OfferRow** — company · role · channel chip · **ScoreMeter** (0–5, perceptual color, ≥4.0 accent ring) ·
  **StatusBox** (pendiente/aplicada/flag, icon+label+color) · comp/location meta · "Preparar aplicación"
  (primary if score ≥4.0).
- Read `data/offers-master.md` via a Rust command (`read_offers`), parse into the grouped model.

## Related metrics surface
The offers system also has a dedicated metrics view in `pencil/gary.pen` that compares:
- total queries run
- total jobs found
- active sources/websites
- jobs found per website

That metrics surface is implementation-adjacent to this spec and should reuse the same offer ingestion data.

## Acceptance criteria
- The table renders real offers parsed from `data/offers-master.md`, grouped by channel, with scores and
  statuses per the design-system §1.4/§1.5. Filters and search work. "Preparar aplicación" opens the apply
  modal (spec 05). Both themes; scores in JetBrains Mono; AA; row reveal stagger (spec 06).
