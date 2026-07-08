---
name: source-gmail
description: Gmail source node for GARY — harvest the user's job-alert inbox over the automation browser (CDP) and return offer URLs grouped by platform, filtering out already-applied confirmations. Use when sourcing the user's job-alert emails. A GARY skill by Julián Nicholls (@jnichollsc).
metadata:
  author: "Julián Nicholls (@jnichollsc)"
---

# Gmail source (by @jnichollsc)
> Candidate-agnostic. Canonical rules: `docs/operating-rules.md`; per-board runbook: `docs/career-ops-map.md` §4.

Mine the user's job-alert inbox over the logged-in automation browser (CDP). The alert account is DATA
(`config/profile.yml` → `job_search.gmail_alerts_account`) — NOT a Claude Gmail-connector account, and NOT the
user's personal browser. Engine: `node engines/gmail-harvest.mjs [--days N] [--u 0]`. Flow: harvest alert threads →
extract + dedup offer URLs → chunk → triage by real JD. Never applies. Candidate facts come from `config/profile.yml`
+ the NotebookLM RAG. Expect region-locked / native-mobile skew → triage hard.

## 1. BLOCKS / anti-bot
- **Reading your own inbox is legitimate** — no scraping, so no captcha wall on harvest. The browser is already
  logged in over CDP (looks human).
- **Already-applied confirmations** in the inbox → filter them out (they are not fresh offers).
- **Guest-page validation** (below) can hit a rate wall if hammered → the WebFetch triage stays parallel-but-bounded, same as any WebFetch channel; back off on 429.
- **Closed/expired** offers surface as guest pages with no JD → drop them at the triage step, never on the alert subject alone.

## 2. AUTOMATION
- Harvest runs over the CDP debug browser (`config/profile.yml` → `job_search.automation_browser`), a DIFFERENT
  site from LinkedIn — so it may run CONCURRENTLY with the serial LinkedIn tab (it does not share the 429 budget).
- `gmail-harvest.mjs` opens each alert thread, extracts every offer URL (LinkedIn / Indeed / GetOnBoard / Computrabajo),
  and groups them by platform. It fills NOTHING and clicks no apply — pure sourcing.
- Survivors flow to the apply engines of their home board (LinkedIn → `apply-from-linkedin.mjs`, external ATS → same),
  which fill to the Submit step and **STOP**. Gmail itself never touches an apply button.

## 3. PAGINATION
- Traverse the whole alert set via `--days N` (the recency window) across the alert threads for the period.
- **≤1-week early-stop:** default the harvest to the recent window (`--days`); older alerts are out of scope.
- **Card-pattern pre-filter:** LinkedIn alert emails skew region-locked (US/Canada) + native-mobile → low yield; triage hard and drop obvious region/stack mismatches before spending a JD read.

## 4. JD READ — CDP BOT FIRST (token reduction), WebFetch only as fallback
- **LinkedIn URLs → the CDP bot, NOT WebFetch.** After harvest, route the LinkedIn `/jobs/view/{id}` URLs through the
  SAME engine as the sweep: `node engines/linkedin-scan.mjs --urls output/gmail-harvest/offers-<date>.json`. It reads
  each JD in the logged-in :9333 tab, runs the SAME zero-token pre-filter, dedups against `linkedin-seen.json`, and
  writes the SAME `output/gmail-harvest/survivors.json` (JD ≤1500 captured). **The LLM triages FROM that file — no
  per-offer WebFetch → big token reduction.** Serial, one reused tab, gentle pacing (logged-in CDP → no 429; stay serial
  to avoid detection).
- **JD renders ONLY in the search split-view.** For a standalone offer the engine navigates the logged-in tab to
  `https://www.linkedin.com/jobs/search/?currentJobId={id}` — the `#job-details` pane populates there. Direct
  `/jobs/view/{id}` nav renders nav chrome with NO JD (LinkedIn behaviour), which silently marked every offer
  unreadable. The pane hydrates a beat AFTER the selector attaches, so the engine waits for the selector (≤14s) **and
  then** a settle delay before scraping.
- **GENERIC, self-healing JD selector.** `scrapeDetail()` picks stable-id-first (`#job-details`) then GENERIC
  `[class*="jobs-description"]` fallbacks, so a LinkedIn class rename keeps matching. If the JD pane stops rendering
  entirely, the engine's consecutive-empty guard (`--fail-limit`, default 8) ABORTS after N empty JDs in a row and
  prints `ENGINE-SELECTOR-STALE` → **that is the signal for the LM supervisor to refresh the selectors** in
  `engines/linkedin-scan.mjs` against the current DOM, rather than burning the whole batch. (This is the supervisor's
  case #1 — an unexpected engine error to recover/adapt.) Full failure-mode reference:
  [`../source-linkedin/references/linkedin-dom-recovery.md`](../source-linkedin/references/linkedin-dom-recovery.md).
- **WebFetch = FALLBACK only** for non-LinkedIn ATS JDs, or if the CDP tab is unavailable (guest `/jobs/view/{id}` pages
  render without login). WebFetch parallelizes but **costs tokens** (the JD enters the agent's context), so prefer the bot.
- **Dedup vs `output/gmail-harvest/linkedin-seen.json`:** dedup harvested LinkedIn jobIds against the global seen set, mark
  the new ones seen, so an offer already covered by the EasyApply sweep is not re-triaged.
- **Rule: read the real JD, never the alert subject/title alone.** The alert email is only a URL feed — fit is decided on the fetched JD, then merged into the master doc.

## 5. AFTER the read (CDP `survivors.json` OR WebFetch) — the MANDATORY order, NEVER re-navigate
Whether the JDs came from the CDP bot (`survivors.json`) or the WebFetch fallback, the offers are now
**read once and captured**. Do the following IN ORDER — and never re-open/re-fetch an offer whose JD you
already have:
1. **Triage FROM the captured JD** (the `survivors.json` file, or the WebFetch results already in context).
   Apply the agnostic gate — region-lock + language + role/skill fit; comp & company-dedup follow the
   candidate PREFERENCE in the RAG/`gary-context.md`. Keep or discard each; do NOT re-navigate to re-read.
2. **MERGE survivors → `data/offers-master.md`** (score 0–5, status boxes) **and UPDATE `data/metrics.md`**
   (channel row + Applied/Actionable totals). This is the persist-after-every-connection rule. On a STOP
   mid-run, write the ACTUAL processed + the EXPECTED remainder, and note where to resume.
3. **The read artifact is TRANSIENT.** `output/gmail-harvest/survivors.json` (and any WebFetch JD held in
   context) is scratch for THIS session only — once merged into the master it is **deprecated/disposable**.
   The ONLY cross-session stores are `data/offers-master.md` + `data/metrics.md`. Don't treat `survivors.json`
   as a record and don't re-run the scan to "refresh" it — re-navigating 60+ offers you already read is the
   waste this pipeline exists to avoid.
