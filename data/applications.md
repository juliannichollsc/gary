<!--
  applications.md — the row-level applications tracker (candidate-AGNOSTIC skeleton).
  Ported from career-ops. In GARY the CANONICAL scored map of every offer is data/offers-master.md;
  this file is the flat tracker consumed by the pipeline engines (engines/merge-tracker.mjs,
  verify-pipeline.mjs, normalize-statuses.mjs, dedup-tracker.mjs, analyze-patterns.mjs) and used for
  the one-application-per-company dedup check (operating-rules §1).

  RULES
  - NEVER hand-add rows here — write a TSV to batch/tracker-additions/{num}-{slug}.tsv, then
    `node engines/merge-tracker.mjs` (idempotent). You MAY edit an existing row's Status/Notes.
  - Schema (score BEFORE status here; the TSV additions use status-before-score and the merge script
    swaps them):
      | # | Date | Company | Role | Score | Status | PDF | Report | Notes |
  - Canonical statuses (templates/states.yml): Evaluated · Applied · Responded · Interview · Offer ·
    Rejected · Discarded · SKIP. No bold, no dates, no extra text in the Status cell.
  - Company dedup: one application per company (best-fit role). Check here + data/offers-master.md
    BEFORE preparing anything.
  - Ships EMPTY per candidate. The example row below is illustrative — delete it.
-->

# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
<!-- EXAMPLE (delete): -->
<!-- | 1 | 2026-01-01 | Example Corp | Senior Frontend Engineer | 4.3/5 | Evaluated | ✅ | - | remote-worldwide; EasyApply auto-filled to Submit | -->
