---
name: source-linkedin
description: LinkedIn source node for GARY — find auto-applicable LinkedIn offers (Easy Apply + external ATS) and Gmail-harvested LinkedIn URLs, offer-by-offer, reading each JD. Use when sourcing LinkedIn for the user. A GARY skill by Julián Nicholls (@jnichollsc).
metadata:
  author: "Julián Nicholls (@jnichollsc)"
---

# LinkedIn source (by @jnichollsc)
> Candidate-agnostic. Canonical rules: `docs/operating-rules.md`; per-board runbook: `docs/career-ops-map.md` §4.
> **When a LinkedIn sweep returns `scanned 0` / empty JDs / a `writeSeen` RangeError → read
> [`references/linkedin-dom-recovery.md`](references/linkedin-dom-recovery.md)** (currentJobId split-view
> requirement, self-healing selectors + `ENGINE-SELECTOR-STALE` escalation, corrupt-`seen` recovery).

One engine, offer-by-offer: `engines/linkedin-scan.mjs` drives the logged-in automation browser
(CDP debug Chrome — port/profile are DATA in `config/profile.yml` → `job_search.automation_browser`;
never the user's personal browser). Easy Apply is the ONLY truly auto-fillable node; the rest open-and-hand-off.
Candidate facts (titles, comp floor, YOE, eligibility, gap skills) come from `config/profile.yml`,
`config/easyapply-filter.json` and the NotebookLM RAG — never hardcoded. Never click Submit.

**The one command (full sweep):** `node engines/linkedin-scan.mjs --all --tpr r604800` (past week;
`--tpr r86400` = daily fresh). Single combo: `--kw "{TITLE}" --loc "{LOCATION}"` (Worldwide via `--geo 92000000`).
URL filters: Easy Apply `f_AL=true`, recency `f_TPR`, early-applicant `f_EA=true`, newest `sortBy=DD`, and
**work-type `f_WT` FROM THE CANDIDATE'S MODALITY** (`easyapply-filter.json` `workType`; default `2`=remote):
`1`=on-site/presencial · `2`=remote · `3`=hybrid (comma list ok). **If presencial/hybrid-only, `locations` = the
candidate's current CITY, not the remote regions** (both derived at session start — operating-rules §4/§1).
Titles/locations/workType come from the filter config, not this file. Override per run: `--wt 1` / `--loc "<city>"`.

## 1. BLOCKS / anti-bot
- **429 rate-limit** is the dominant risk → **keep ONE tab, SERIAL.** All combos run in a single reused
  tab, one at a time. Real parallelism is across SOURCES (a separate process may harvest Gmail), never
  multiple LinkedIn tabs (3 tabs → 429). Applying stays serial too (one Easy Apply modal at a time).
- **OAuth/login is anti-bot** → the browser is already logged in over CDP (looks human, `navigator.webdriver`
  false); never trigger a fresh Google/LinkedIn OAuth mid-run.
- **Already-applied** → the apply script detects the "Applied" state and skips.
- **Captcha / any anti-bot wall** → STOP for the user; never auto-solve.
- **Closed/expired** → if the detail pane renders no JD, the offer is left UNSEEN (retried next run), never rejected.

## 2. AUTOMATION
- Core CDP loop (agent-browser): `open <url>` → `snapshot -i` (`@eN` refs) → `click/fill @eN` → **re-`snapshot -i`**
  (refs go stale after every navigation). Never `close`/`close --all` (kills the shared session) — just `open` the next URL.
- **One-click Easy Apply** = the auto-fillable node: `node engines/apply-from-linkedin.mjs "<url>" "<cvPath>"`
  walks the multi-step modal, fills mapped fields from `config/apply-fieldmap.json`, attaches the CV, picks CV by JD language,
  advances to "Submit application"/"Enviar solicitud" and **STOPS**. Years-of-X / English-level fields grounded in the
  RAG (`cv-data.md`); unmapped/eligibility/legal → leave blank, flag **ASK_USER**, then `learn()`. Mandatory-C1/C2 when the
  candidate is below → do NOT lie, DISCARD.
- **External ATS** offers (non-EasyApply) = open-and-hand-off; the same script follows the external tab, fills safe fields, stops before Submit.

## 3. PAGINATION
- Traverse the WHOLE set via `&start=0,25,50…` across pages (overlap is harmless — see dedup). Stop when a page yields no new ids.
- **≤1-week early-stop** is enforced by `f_TPR` (week/day); apply the recency window from the card/JD date when needed.
- **Zero-token keyword PRE-FILTER per card** (in the engine): auto-discards clear misses (junior/intern, off-stack languages,
  US-only/work-auth, 10+ yrs) using `config/easyapply-filter.json` `positive`/`reject`. Conservative — anything ambiguous SURVIVES to the LLM.
- **Global persistent dedup:** `output/gmail-harvest/linkedin-seen.json` (jobId → record, written incrementally, resumable). Each offer processed once, ever — across pages, combos, and runs.

## 4. WEBFETCH FILTERING
- **No extra WebFetch for the EasyApply sweep** — the engine reads the REAL JD *in-session* by CLICKING each card so the
  detail pane loads it (navigating straight to `/jobs/view/{id}` does NOT render the JD). The full JD is captured into
  `output/gmail-harvest/survivors.json`, so the LLM scores fit 0–5 from that.
- **Gmail-harvested LinkedIn URLs → the SAME bot, NOT WebFetch (token reduction).** Feed them to the same engine:
  `node engines/linkedin-scan.mjs --urls output/gmail-harvest/offers-<date>.json` — it reads each `/jobs/view/{id}` JD
  in the logged-in :9333 tab, runs the SAME zero-token pre-filter, dedups against `linkedin-seen.json`, and writes the
  SAME `survivors.json` (JD ≤1500 captured). **The LLM triages FROM the file** — no per-offer WebFetch. Serial, one
  reused tab, gentle pacing (logged-in CDP → no rate-limit; stay serial to avoid detection). *(WebFetch stays only as a
  fallback if the CDP tab is unavailable — see `source-gmail`.)*
- **Rule: read the real JD, never title/card alone.**
