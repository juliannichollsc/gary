---
name: source-boards
description: Session-based board sweep for GARY — Dice (search + logged-in Recommended Jobs feed) and Hireline, both with FULLY AUTOMATIC in-platform apply, plus Glassdoor and Dover (map only), as source nodes. Drive the user's logged-in automation Chrome through each board's REMOTE-only search with engines/board-sweep.mjs (0 tokens, human pacing, block-aware), map offers into output/board-sweep/<site>-jobs.json, then triage that temp file against the candidate profile and merge survivors into data/offers-master.md. Use when sourcing Dice, Hireline, Glassdoor or Dover.
metadata:
  author: "Julián Nicholls (@jnichollsc)"
---

# Session boards — Dice · Hireline · Glassdoor · Dover (by @jnichollsc)

> **Before changing anything for this channel** (engine, selectors, verification, defaults): follow the `connections` skill §1 change protocol — baseline + re-run `node engines/check-connections.mjs`, change only this site's own rule, keep defaults, log the incident. Verification rule for this site lives ONLY in `engines/connections.mjs`.

> Candidate-agnostic. Canonical rules: `docs/operating-rules.md`; per-board runbook: `docs/career-ops-map.md`.
> All four boards are FREE for candidates (no subscription/membership). Paid boards are out of scope.

## Why session-based
These boards have no public API. The engine rides the user's own session in the automation Chrome (:9333):
real cookies + real browser fingerprint + human pacing = no IP/bot blocks. Login is the USER's job: if a board
needs it, tell the user to sign in from the **Conexiones** panel and press "Verificar" — never log in for them.
`engines/check-login.mjs` uses STRICT per-site rules for these boards (they list jobs without a session):
connected ⇔ no login/register marker in the page (visible or folded into a hamburger menu). Out of scope: Torre (its own AI matching, profile-based — not a
search-and-paginate board).

**Session check before mapping (Glassdoor + Dover, 2026-11-11).** `board-sweep --site glassdoor` (after its first results
page) and `dover-jobs.mjs` (after landing on the board) apply that site's Conexiones rule (`engines/connections.mjs`) to
their own page. Logged out → they print `⏸ GLASSDOOR-LOGIN-NEEDED` / `⏸ DOVER-LOGIN-NEEDED`, close their tab and **exit 6**
(nothing mapped, no block file — it is not a block). When you see that line, tell the user right away, in plain words:
> «Para buscar en <Glassdoor|Dover> necesito tu sesión. Abre **Conexiones → <sitio> → Conectar**, inicia sesión con tu
> cuenta (en Dover sirve "Continue with Google") y pulsa **Verificar**. Cuando diga ✓ conectado, avísame y sigo.»
Then re-run the same command. Never log in for the user, never type their credentials, never skip the channel silently
(if they don't want to sign in, report the channel as "sin sesión — no mapeado" in the session summary). Dice and
Hireline don't run this check (unchanged behavior).

## 1. Map (deterministic, 0 tokens)
```
node engines/board-sweep.mjs --site dice-recs                 # Dice Recommended Jobs (profile-matched), ≤7 days, JD included
node engines/board-sweep.mjs --site dice                      # keywords = config/easyapply-filter.json → titles
node engines/board-sweep.mjs --site hireline --kw "{SKILL_1},{SKILL_2}" --pages 3
node engines/board-sweep.mjs --site glassdoor                # MAP ONLY: fromAge filter, no JD (job pages 403)
node engines/dover-jobs.mjs [--jd] [--workplace remote|hybrid|onsite|any]   # Dover: own engine, JSON API
```
- REMOTE-only by construction: Dice `filters.workplaceTypes=Remote` · Hireline `/remoto/empleos` · Glassdoor
  location `Remote` (IS11047 — in practice US-located remote jobs → region-lock drops most) · Dover
  `location_type=REMOTE` (default; `--workplace` follows the user's modality).
- **Glassdoor = MAP ONLY (2026-11-11).** Cards no longer print the job age, so the search URL carries the site's own
  "Date posted" filter `?fromAge=7` (from `--max-age`) and rows are stamped `dateFilter: "≤7d (Glassdoor)"`
  (= recency verified by the site filter, not by the card). Opening `/job-listing/` pages answered **403** and
  blocked the run on 2026-11-06 → `--jd` is ignored for Glassdoor: triage on title + company + location + snippet,
  the user opens the JD.
- **Dover (jobs.dover.com) = MAP ONLY, own engine `engines/dover-jobs.mjs` (2026-11-11).** The whole board is small
  (~500 open jobs, a handful remote per week) and its UI calls a JSON API, so there are NO title keywords by default:
  the engine does what the UI's filters do — `location_type=REMOTE` + `date_posted=7d` ("Past week") +
  `ordering=recent` — and pages (limit 50) by date until a posting is older than `--max-age`; each row's own
  `date_posted` is gated again (≤7 d). Calls run INSIDE the user's jobs.dover.com tab (same origin). `--jd` adds the
  JD from the detail API (`user_provided_description`, 4–9 s apart — no page views). `--kw "a,b"` is optional (Dover's
  own search box). Rows: `{ id, url: https://jobs.dover.com/?jobId=<id>, title, company, location ("Remote (United
  States)"), workplace, countries[], employment, salary, posted (ISO), postedDays, apply: "manual", description? }`.
  Output `output/board-sweep/dover-jobs.json`, block file `dover-block.json`. Apply = the company's Dover form →
  the USER applies (`apply: manual`); GARY never clicks Apply there. Startup roles are mostly US/Canada-located →
  region-lock on `countries` / `location`.
- Output (temp, resumable, dedup by URL): `output/board-sweep/<site>-jobs.json` →
  `{ site, updated, keywords, jobs: [{ site, kw, url, title, company, location, posted, salary, snippet?, description? }] }`.
- `dice-recs` = `https://www.dice.com/recommended-jobs?page=N` (needs the user's Dice session). Maps every page,
  drops cards older than `--max-age` (default **7** days), then opens each survivor's detail to confirm the REAL
  "Posted" date: the card shows the UPDATED date — recruiters "refresh" old postings ("Posted 60+ days ago •
  Updated today"; staffing agencies re-bumping, evergreen/pipeline reqs, ATS feed syncs). Three outcomes:
  - Posted ≤ 7 d → **fresh** (normal score, priority 1).
  - Posted > 7 d but Updated ≤ 7 d → kept with **`refreshed: true`** + its JD → **score −1.0** (more competition,
    lower response rate), priority 2: queue only after every fresh survivor and only if its score is still ≥ the
    apply threshold.
  - Neither → `stale: true` (no JD; kept only so re-runs skip it) → IGNORE in triage.
  Each row also carries `applyType` ("Easy Apply" / "Apply Now"), `postedDays`, `updatedDays`, `employment`, `salary`.
- Titles hitting a `reject` pattern of `easyapply-filter.json` are dropped before saving (`--no-prefilter` to keep all).
- `--jd` also opens each offer and captures its JD (paced). Without it, read JDs only for the title-level survivors.

## 2. Anti-block pacing (MANDATORY)
ONE process, ONE tab, SERIAL. **One bot per site** is enforced: every engine locks its domain
(`output/locks/<domain>.lock`), so `board-sweep --site dice-recs` and `dice-apply` (both dice.com) — or
`board-sweep --site hireline` and `hireline-apply` — must run ONE AFTER THE OTHER; a second one exits with code 3.
Different sites may run side by side.
Results page 8–15 s · JD 4–9 s · between keywords 45–90 s · ≤120 views/run (`--max-views`). `--pace >1` slows.
On HTTP 405/423/429, a 403 or Cloudflare/captcha challenge that doesn't auto-clear → the engine STOPS, saves
progress and writes `output/board-sweep/<site>-block.json`; it refuses to run that site again the same day.
Do NOT delete the block file to force a retry. Ask the user to open the site in Chrome:9333 and sign in /
clear the check, then resume another day.

## 3. Triage → offers map
Read `<site>-jobs.json` and apply the agnostic gates (region-lock §1, language, role/skill two-way fit from
`data/cv/base/gary-context.md`; comp + dedup per the candidate's preference). Score 0–5 on the JD (fetch it for
title survivors if `--jd` wasn't used). MERGE survivors into `data/offers-master.md` under
`## CANAL Dice` / `## CANAL Hireline` / `## CANAL Glassdoor` / `## CANAL Dover` and update metrics (per-site
column in `data/metrics.md` — Glassdoor and Dover each have their own). Token count = only the triage/evaluate LLM work; the sweep itself is 0.

## 4. Apply
- **Dice = FULLY AUTOMATIC (owner decision 2026-11-10 — the second exception to "never Submit", after
  Computrabajo).** Dice is US-heavy, so triage also needs the candidate's **work-authorization / sponsorship**
  situation and contract preference (W2 vs C2C/1099). These are CANDIDATE DATA: read them from the NotebookLM
  RAG; if the RAG doesn't have them, ASK the user during the search session and store the answer in the RAG —
  never assume, hardcode or write them to local files. After triage, write the survivors (non-`stale`,
  passing region-lock + work-authorization + role/skill fit; fresh first, then `refreshed` with the −1.0 penalty) to
  `output/board-sweep/dice-apply-queue.json` as
  `[{ url, title, company }]`, then run:
  ```
  node engines/dice-apply.mjs --dry-run        # optional: walk the wizard to Submit, send nothing
  node engines/dice-apply.mjs                  # send (≤10/run)
  ```
  It applies only through Dice's own wizard (Resume & Cover letter → Next → Review → Submit) with the resume on
  the user's Dice profile. Never sent: company-site/external applies (`external`), `already-applied`, no resume,
  or a REQUIRED question the wizard left empty (`needs-answer` + the question in the note → ask the user /
  resolve via the NotebookLM RAG; never guess). Log: `output/board-sweep/dice-applied.json`. Pacing 4–9 s/detail,
  2.5–4.5 s/step, 30–60 s between applications; shares `dice-block.json` with the sweep. Mark applied rows in
  `data/offers-master.md` and count them in the metrics Applied total.
- **Hireline = FULLY AUTOMATIC (owner decision 2026-11-10 — third exception).** Map:
  `node engines/board-sweep.mjs --site hireline --jd [--hl-l latam|remoto-mx|remoto-co] [--hl-jk 2|6] [--hl-jd 1]`
  (no `--kw` → the whole remote listing; small feed). Note cards like "Remoto: México" inside the LATAM filter →
  region-lock them. Triage → `output/board-sweep/hireline-apply-queue.json` → apply:
  ```
  node engines/hireline-apply.mjs --phone "<10-11 digits, from the RAG>"   # --dry-run to stop before sending
  ```
  Hireline pre-fills the form from the user's Hireline profile (name, location, salary, English, relocation,
  skills) and offers the CV already uploaded. The phone is the one field it may not pre-fill — pass it from the
  RAG per run, never store it. Skips: no apply link, "Ya has aplicado", no CV, REQUIRED empty fields
  (`needs-answer`). Log: `output/board-sweep/hireline-applied.json`; block file `hireline-block.json`.
- **Glassdoor:** map only — every row is `apply: manual` for the user (Easy Apply there is Indeed Apply; GARY does
  not open Glassdoor job pages).
- **Dover:** map only — every row is `apply: manual`; the user applies on the company's Dover form.
Never click Submit on any other board. Never solve a captcha.
