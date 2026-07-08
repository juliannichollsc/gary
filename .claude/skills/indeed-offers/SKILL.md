---
name: indeed-offers
description: Indeed Colombia (co.indeed.com) as a source node in GARY's application network — source listings via anonymous WebFetch (page-1 only; Indeed is aggressively anti-bot), triage with the two-way-fit gate, and hand survivors to the orchestrator to OPEN for the user's manual apply. Use when sourcing or applying to Indeed offers. HONEST limit: auto-fill is NOT feasible here — open-and-hand-off only.
metadata:
  author: Julián Nicholls (@jnichollsc)
---

# Indeed Colombia — source node

> Candidate-agnostic. Canonical rules: `docs/operating-rules.md`; per-board runbook:
> `docs/career-ops-map.md` §4.

Indeed CO (https://co.indeed.com) is one website node in GARY's application network. Canonical
candidate facts, hard rules, and the two-way-fit gate live in **`gary-job-search`** +
**`docs/operating-rules.md`** + the **NotebookLM RAG** — this skill does NOT duplicate them; it
documents only what is Indeed-specific. **Bottom line up front:** Indeed is **open-and-hand-off, not
auto-fill**. Source page-1 results anonymously, triage, open survivors for the user to apply.

## What it is
Indeed CO is the Colombian Indeed portal (Spanish, `hl=es_CO`). Huge volume of local + remote LATAM
roles; aggregates both Indeed-native postings and scraped employer/ATS jobs.

## Anti-bot / BLOCKS + mitigation (be honest — Indeed is one of the most aggressive)
- **Page-1 WebFetch is the ONLY reliable read path.** Page 1 of a search IS anonymously readable via
  WebFetch (the server-side fetcher gets HTML with job cards). Use that.
- **Pagination forces a sign-in wall.** `start=10` (page 2) 307-redirects to
  `secure.indeed.com/auth?...&branding=page-two-signin`. So anonymous sourcing is **page-1-only**; you
  cannot deep-paginate without a login, and login automation trips bot detection. Mitigation: get
  breadth by rotating `q=` and `l=`, NOT by paginating (see PAGINATION).
- **Headless / Playwright / CDP trips CAPTCHA + Cloudflare fast** (*"verifica que eres humano"*).
  **Do NOT drive Indeed over CDP** — unlike LinkedIn there is no working auto-apply path. WebFetch
  (server fetcher) is the safe read tool; the ONE debug Chrome (`:9333`, from
  `config/profile.yml → job_search.automation_browser`) is for the user's own manual apply only. The
  user's personal browser is OFF-LIMITS.
- **429 / rate-limit + faceted-filter empties.** Avoid the `sc=0kf:attr(...)` faceted-filter params —
  they over-restrict and return zero results (e.g. the remote `DSQF7` facet emptied a valid search).
  Filter on the card text instead. Space calls if responses start coming back blocked/empty.
- **Captcha + Submit are ALWAYS the user** (hard rule 6) — and on Indeed essentially the whole apply
  is the user's.
- **Already-applied / closed-expired.** Confirm the JD still shows an apply control via WebFetch on
  the clean `viewjob` URL before queuing; drop dead/expired postings.
- **No usable public jobs API** (Publisher / Job-Sync APIs are deprecated / partner-gated). WebFetch
  on the search HTML is the sourcing method.

## Regional domains + session (why the login check matches by base domain)
Indeed serves **per-country domains that change with the URL**: `co.indeed.com` = Colombia (Spanish,
`hl=es_CO`), `www.indeed.com` = US/global, `mx.indeed.com`/`es.indeed.com`/… = other locales. Same jobs
engine, different market + language. **Auth is shared** — you log in once at `secure.indeed.com` and the
session cookie is valid across all `*.indeed.com` regional domains. So: (1) the Conexiones login check
(`engines/check-login.mjs`) matches the open tab by **registrable domain** (`indeed.com`), not exact host,
so a `co.indeed.com` tab satisfies the `www.indeed.com` connection and vice-versa — one login covers all;
(2) pick the **source domain by the user's target market** (LATAM-remote → `co.indeed.com`; US/global-remote
→ `www.indeed.com`), and search BOTH for breadth (below). Don't treat a regional domain as "not logged in"
just because the connection URL names a different one.

## SCOPE — REMOTE / worldwide, NOT Colombia-only (corrected by the user 2026-06-24)
**Do NOT geo-limit to Colombia.** The candidate takes a job from ANY country as long as it meets the
*mandatorios*: **remote** (or on-site only in the candidate's city, per `config/profile.yml`), **comp
≥ the floor in `config/profile.yml`** (a USD/month minimum, in any currency), **hireable remotely
from the candidate's country**, Senior, and the candidate meets ≥80% of their reqs. The company's
location is irrelevant — only "can it be worked remotely from the candidate's country" matters.
Reject only **region-LOCKED** roles that exclude the candidate's country (US-only / "must be based in
X" / E-Verify / US-work-authorization / EU-only). So search REMOTE broadly, across domains — not just
`co.indeed.com` with `l=Colombia`.

## Source / filter — URL params (page-1 only)
Search BOTH the Colombian portal and the global one for remote roles:
- `https://co.indeed.com/jobs?` (Spanish, LATAM-leaning) AND `https://www.indeed.com/jobs?`
  (global/US remote).
- **`l=Anywhere` on `www.indeed.com` is the widest, region-AVOIDING sweep (user-confirmed 2026-07-06).**
  `https://www.indeed.com/jobs?q=<q>&l=Anywhere&fromage=7` drops the geo filter entirely and returns the
  broadest set (US/global + remote), instead of biasing to one country. Use it as the primary breadth pass,
  then triage each JD for "workable remotely from the candidate's country / no region-lock" (§ the gate).
  Strip tracking params from the example URL (`from=searchOnDesktopSerp`, `vjk=…` are just SERP tracking).
- **`l=Remote` / `l=Remoto`** for the explicitly-remote cut (worldwide-remote roles workable from the
  candidate's country). Also rotate `l=` (empty, breadth) and specific hubs (`l=United States`,
  `l=Latin America`). Then confirm "open to remote from the candidate's country / no region-lock" on the
  JD. Don't restrict to `l=Colombia` — `l=Anywhere` (global domain) is the anti-region default.
- `q=` query, plus-joined. Good: `react+developer`, `frontend`, `full+stack`, `angular`,
  `react+native`, `node`, `next.js`.
- `fromage=` days since posted — use **`fromage=7`** (or 3) to honor the ≤1-week rule.
- `sort=date` (newest first; default is relevance) | `radius=` km (irrelevant for remote).
- `start=` pagination — **AVOID**: `start>=10` hits the page-2 sign-in wall (see PAGINATION).
- **Avoid the `sc=0kf:attr(...)`** faceted-filter params — they over-restrict and return zero results.
  Filter on the card text instead.
- Card title links carry `jk=` (job key), often wrapped as `/rc/clk?jk=<hex>&...`. The clean
  single-posting URL is **`https://co.indeed.com/viewjob?jk=<jk>`** — capture the `jk` and rebuild
  this canonical form for the apply queue (drop the `clk` tracking wrapper).

## PAGINATION — page-1 only; breadth via rotation, ≤1-week early-stop
- **Traverse the set by ROTATING queries, not by paging.** `start>=10` = the page-2 sign-in wall, so
  source **page 1 per query** and get coverage by rotating `q=` (react / frontend / full+stack /
  angular / react+native / node / next.js) and `l=` (**Anywhere** on www — widest / Remote / Remoto /
  empty / hubs) across both portals.
- **Early-stop at ≤1 week:** set `fromage=7` and, with `sort=date`, stop reading a query's cards once
  they fall outside the week window.
- **Card pre-filter** before spending detail-page WebFetch: from each card read `{title, company,
  location, remote?, salary, jk}` and drop obvious fails (on-site non-home-city, junior,
  wrong-stack) before fetching the JD.

## WEBFETCH FILTERING — validate the real JD, never the card alone
WebFetch each search URL, extract `{title, company, location, remote?, salary, jk}` from cards, then
WebFetch **`viewjob?jk=<jk>`** for survivors to read the full JD (eligibility, region-lock, YOE,
English level, AWS requirement, comp) and the apply mechanism. The card/title is a pre-filter only —
the fit and eligibility decision is made against the real JD text.

## AUTOMATION / apply mechanism — classify per card (NONE are auto-fillable)
1. **Indeed Apply / "Postúlate rápidamente"** (Quick Apply, in-platform): common on Indeed CO.
   Submits via the candidate's saved Indeed profile + resume, behind Indeed login + anti-bot. Like a
   GetOnBoard *Postular*: effectively one-click, and that click = SUBMIT = **the user's click** (hard
   rule 6). The agent cannot auto-fill it (login/captcha-gated) → open, hand off.
2. **"Postúlate en el sitio web de la empresa"** (Apply on company website, external ATS): redirects
   to Greenhouse/Ashby/Workable/Lever/JazzHR/employer site. The destination may be auto-fillable —
   but Indeed gates the outbound redirect behind interaction / anti-bot, so the safe path is: read
   the JD, find the real company/ATS URL, and prefer applying via that ATS directly, **or via
   LinkedIn if the same role exists there** (LinkedIn is the truly auto-fillable channel). Do NOT
   drive the apply through Indeed.
3. **Manual / anti-bot:** anything that needs Indeed login or throws a captcha → manual.

There is **no Indeed path the filler can complete to Submit-ready**. Indeed's role in the network is
**discovery, not auto-apply**. AUTO-FILL feasibility via Indeed itself = **NONE**: no CDP, no
auto-fill, no Submit automation. For survivors, `Start-Process <viewjob-url>` in the user's debug
Chrome for manual apply; OR (better) **re-route** the role to a higher-leverage node — if the same
posting exists on LinkedIn (Easy Apply / external ATS) or its ATS is anonymous
(Ashby/Greenhouse/Workable), apply THERE where the filler (`config/apply-fieldmap.json` engine)
works. Treat Indeed as a **lead-gen feed** that increases coverage of found offers, not of
auto-filled ones — it feeds the nodes that do the auto-apply.

## Triage — two-way-fit gate (apply only if BOTH hold)
Run the gate from `docs/operating-rules.md` / `gary-job-search`. Indeed-specific gotchas:
- Lots of **on-site / presencial** Colombia roles (*"Lugar de trabajo: Empleo presencial"*) and
  **Junior** roles — both fail (remote-pref / Senior). WebFetch `viewjob` to confirm modality +
  seniority; on-site is OK only if it is the candidate's city (`config/profile.yml`).
- **Salary** is shown in COP/month (e.g. `$3.000.000`), sometimes ranges or `/hora`. Convert to the
  comp-floor currency (USD, current rate) before the floor test in `config/profile.yml`; null /
  *"a convenir"* = unknown → keep, confirm early. Do not reject on COP figures without converting.
- **Filter the noise:** .NET/Java/SAP/Salesforce/QA-only/Outsystems titles, AWS-hard-req
  (Serverless/Lambda) → reject (gap skill from the NotebookLM RAG). C1/C2-mandatory English → reject
  (below level per RAG). 10+ yrs → reject. Company already in the applications tracker → skip (one app
  per company).
- The candidate's fit and gap skills come from the **NotebookLM RAG / `cv-data.md`** (React/Node/
  NestJS/Angular/Next/RN full-stack & frontend, Senior, eligible from the candidate's country).

## How the orchestrator uses the queue
1. This node writes survivors to **`output/gmail-harvest/indeed-queue.md`** (table: Company | Title |
   Location/Remote | Comp | viewjob URL | apply-type [indeed-apply / external-ATS] | fit note).
2. The orchestrator (`/job-network`) **prefers to re-route** external-ATS / also-on-LinkedIn roles to
   the auto-fillable nodes (source-linkedin, free-ATS); only the Indeed-Apply-only survivors go to
   **`job-apply-prep`** to `Start-Process` the `viewjob` URL for the user's manual apply.
3. Sourcing is anonymous WebFetch → it **PARALLELIZES** with other API/WebFetch nodes (getonbrd,
   himalayas, free boards). It is **NOT** a CDP node — never run it over the debug Chrome.
4. After the user confirms they applied, flip the tracker row Evaluated → Applied (never before).

## Cross-references (don't duplicate here)
- Candidate facts, skills+YOE, EEO, standard answers → **NotebookLM RAG** (`config/profile.yml` for
  the DATA).
- Hard rules, per-offer workflow, network architecture, CDP reliability, WebFetch-reads-listings →
  **`docs/operating-rules.md`** / **`gary-job-search`**.
- Two-way-fit gate + standing goal → **`docs/operating-rules.md`**.
- Field-answer engine (only relevant if a role is re-routed to an auto-fillable ATS) →
  **`easyapply-autofill`** / `config/apply-fieldmap.json`.
