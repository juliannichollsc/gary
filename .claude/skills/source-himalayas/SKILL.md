---
name: source-himalayas
description: Himalayas source node for GARY — paginate ALL match pages and scrape each job's full JD via CDP (Cloudflare auto-clears ~4s → poll until clear), validate fit by description not slug. Use when sourcing Himalayas. A GARY skill by Julián Nicholls (@jnichollsc).
metadata:
  author: "Julián Nicholls (@jnichollsc)"
---

# Himalayas source (by @jnichollsc)
> Candidate-agnostic. Canonical rules: `docs/operating-rules.md`; per-board runbook: `docs/career-ops-map.md` §4.

Engine: `node engines/himalayas-matches.mjs` over the logged-in automation browser (CDP debug Chrome —
port/profile are DATA in `config/profile.yml` → `job_search.automation_browser`; never the user's personal browser).
Paginate `/jobs/matches?page=1..N`, map every match, then navigate each job and scrape the FULL JD. Himalayas is an
aggregator: apply links OUT to the company ATS (auto-fillable like any external ATS). Validate fit by description, not slug.
Candidate facts come from `config/profile.yml` + the NotebookLM RAG. Never click Submit. Flags: `--max-pages N`, `--no-desc`, `--fresh`.

## 1. BLOCKS / anti-bot
- **Cloudflare "Just a moment…"** guards every job DETAIL page (the matches LIST loads fine). It **auto-clears ~4s in the
  real logged-in browser**, so the engine **POLLS** the page (re-check title/content every ~2s, up to ~16s) and extracts
  ONLY once the challenge clears. A short fixed wait captures the challenge page — that was the original bug (208 "Just a moment" captures).
- **429 / rate-limit** → anti-block cadence: **MAX 2 concurrent JD fetches + ~2s gap** between batches. Runs serial-ish on the CDP browser.
- **The public `/jobs/api` is NOT a workaround** — it returns only the latest ~20 GLOBAL jobs (offset-paginated), ignores
  `limit`/`company`, has ZERO overlap with personalized matches, and per-job `.json` is itself Cloudflare-blocked. CDP + poll-until-clear is the only path to personalized-match JDs.
- **Closed/expired** → a page that never clears past the challenge or renders no JD is left uncaptured (resumable retry), never scored on the title.

## 2. AUTOMATION
- Core CDP loop (agent-browser): `open <url>` → `snapshot -i` (`@eN` refs) → `click/fill @eN` → **re-`snapshot -i`**
  (refs go stale). Never `close`/`close --all`; to move on, `open` the next URL.
- **Resumable:** `output/gmail-harvest/himalayas-jobs.json` is rewritten after every batch; a re-run skips jobs already
  captured with a real (non-blocked) description, so a timeout never loses progress. Runs in the background (~8–10 min for ~200 jobs).
- **Apply = external ATS → auto-fillable:** `node engines/apply-from-linkedin.mjs "<job-or-apply-url>" "<cvPath>"` follows the
  external tab (Greenhouse/Ashby/Workable/JazzHR/etc.), fills safe fields + EEO + standard answers, and **advances to Submit and STOPS**. Captcha + final Submit stay the user's.

## 3. PAGINATION
- Traverse the WHOLE set: open `/jobs/matches?page=1`, **read the MAX page number from the pagination control**, then loop
  `?page=1..N` mapping every match `{url,title,company}` (dedup by url across pages). The matches list is multi-page (e.g. ~11 pages) — title-only filtering misses offers.
- **≤1-week early-stop:** Himalayas has no built-in date filter → apply the recency window yourself at the triage step from the card/JD date.
- **Card-pattern pre-filter:** map all matches first (cheap), then spend the expensive poll-until-clear JD read only on the deduped set.

## 4. WEBFETCH FILTERING
- **Primary validation is via logged-in CDP** (poll-until-clear), NOT WebFetch — Cloudflare blocks WebFetch/`.json` for detail pages.
- **WebFetch is only the fallback** when CDP is unavailable: fetch the JD page directly at the same cadence (≤2 concurrent / ~2s gap).
- **Rule: read the real JD, never the slug/title alone.** Fit is decided on each job's captured `description` in
  `himalayas-jobs.json` against the two-way-fit gate (eligibility / comp / YOE / no-AWS-hardreq / company-dedup / posted ≤1 week), then merged into the master doc.
