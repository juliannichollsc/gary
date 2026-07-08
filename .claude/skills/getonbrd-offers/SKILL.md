---
name: getonbrd-offers
description: GetOnBoard (getonbrd.com) as a source node in the user's application network — the DETAILED reference for sourcing offers via the public API (no CDP) or logged-in /myjobs (CDP), triaging them with the two-way-fit gate, and handing survivors to the orchestrator to OPEN for the user's one-click "Postular". Companion to source-getonbrd. Use when sourcing or applying to GetOnBoard offers.
metadata:
  author: "Julián Nicholls (@jnichollsc)"
---

# GetOnBoard — source node (detailed reference)

> **GARY banner.** Candidate-agnostic. Canonical rules: `docs/operating-rules.md`; per-board runbook:
> `docs/career-ops-map.md §4.3`. Candidate facts (comp floor / city / country / language / eligible
> geos) are DATA in `config/profile.yml`; skills, YOE and gaps come from the **NotebookLM RAG**. This
> skill is the **detailed reference** for the operational node **`source-getonbrd`** — it does NOT
> duplicate the hard rules or the two-way-fit gate (those live in `gary-job-search`); it documents
> what is GetOnBoard-specific.

GetOnBoard (getonbrd.com) is one website node in the user's application network. It has two source
paths — the public REST API (no login) and the logged-in `/myjobs` feed (CDP) — and a profile-based
**one-click "Postular"** apply with no fields to fill.

## The 4 dimensions (summary; each expanded below)
1. **BLOCKS/anti-bot** — OAuth login is anti-bot (Google + LinkedIn OAuth resist automation); no
   Cloudflare/captcha on content; `&expand=company`→500; `/jobs/<slug>`→401; "Ver postulación" =
   already applied; 404 on `public_url` = dead.
2. **AUTOMATION** — source via public API (no CDP) or `engines/getonbrd-matches.mjs` (`/myjobs` over
   the debug Chrome); apply is one-click "Postular" = the user's click, 0% auto-fill (open-and-hand-off).
3. **PAGINATION** — public API `meta.total_pages`; logged-in "Load more jobs" with EARLY-STOP past the
   1-week window (>5 loads = past the week).
4. **WEBFETCH/JD FILTERING** — card-pattern pre-filter (drop region-locked/hybrid by card), then read
   each survivor's real JD via CDP or WebFetch `public_url`; never decide on the card title alone.

## (1) BLOCKS / anti-bot + mitigation
- **OAuth anti-bot:** login via **Google AND LinkedIn OAuth is blocked/hard for automation.**
  Mitigation: keep the debug Chrome **already logged in**; read `/myjobs` over CDP only, **never
  trigger a login**. Sourcing via the public API needs no login at all → prefer it for breadth.
- **No Cloudflare / captcha** on GetOnBoard content (verified) — CDP JD reads are ~0-token and stable.
  Any submit-time captcha is ALWAYS the user's (hard rule).
- **API gotchas:** `&expand=company` returns **HTTP 500** (never send it). `/api/v0/jobs/<slug>`
  returns **401** (auth-only) — don't rely on the single-job detail endpoint; use list + a JD read.
- **Already-applied:** a card showing **"Ver postulación"** = already applied → skip.
- **Dead posting:** a **404** on `links.public_url` = the posting is dead → drop.

## (2) AUTOMATION — access + apply
**Public REST API (no login, parallelizes with other API/WebFetch nodes; never run CDP concurrently):**
- **Search:** `https://www.getonbrd.com/api/v0/search/jobs?query=<q>&per_page=30&page=<n>`
  (`meta.total_pages` paginates). Good queries derive from the candidate's role map (e.g. react,
  frontend, full stack, node, typescript, angular, react native, next.js).
- **Category list:** `https://www.getonbrd.com/api/v0/categories/programming/jobs?per_page=30&page=<n>`
  (also `machine-learning-ai`, `sysadmin-devops-qa` if the candidate's fit warrants — for a web
  profile, `programming` covers most).
- **Company name (id→name):** `https://www.getonbrd.com/api/v0/companies/<id>` — list items only carry
  `company.data.id`; resolve names here (cache; rate-limit ~120ms).

**Logged-in `/myjobs` (CDP, serialized with the other CDP nodes):** engine
`engines/getonbrd-matches.mjs` drives the debug Chrome (`:9333`, DATA in `profile.yml →
job_search.automation_browser`) to the "Jobs for you" feed, sets the filter chips, pages with "Load
more jobs", pre-filters by card, and reads survivor JDs over CDP.

**Filter chips before sourcing (DATA — from `profile.yml` / role map):** Category = Programming ·
Employment = Full time · Seniority = the candidate's level(s) · Salary = min at/above the comp floor
(the chip may read "Less than X", which is backwards — set it so results are **≥ floor**) · Location =
remote, eligible for the candidate's geo.

**Useful list-item `attributes`:** `title`, `seniority.data.id` (1 No-exp · 2 Junior · 3 Semi-Senior ·
**4 Senior** · 5 Expert/Lead), `remote` (bool), `remote_modality` (**`fully_remote`** = worldwide-ish
· **`remote_local`** = residency-restricted to a country → **verify eligibility**), `countries`,
`min_salary`/`max_salary` (USD/mo, often null), `published_at` (unix → age for the ≤1-week rule),
`applications_count`, `lang`. Live apply URL = **`links.public_url`** (e.g.
`https://www.getonbrd.com/jobs/<slug>`, 301s to `/jobs/<category>/<slug>`); capture it during
sourcing — a 404 = dead → drop.

For the public path: fetch search+category pages, keep `{attributes, links.public_url}`, prelim-filter
`seniority>=4 && remote!==false && age<=8d`, then resolve company names for survivors.

**Apply mechanism — "Postular" = ONE CLICK = the USER'S click:**
- Profile-based one-click "Postular": it submits using the saved profile + CV. **There are NO form
  fields to auto-fill** (nothing for the filler engine to do → 0% auto-fill, open-and-hand-off).
- That single click **submits** → per the hard rule it is the **user's click, never the agent's**. The
  agent OPENS the offer and STOPS.

## (3) PAGINATION — traverse fully, EARLY-STOP past the 1-week window
- **Public API:** page via `meta.total_pages`, stopping once `published_at` age exceeds ~8d.
- **Logged-in `/myjobs`:** no date filter, feed is newest→oldest → click **"Load more jobs"** only
  until cards drop past the 1-week window. **>5 load steps = past the week → STOP** (loading ~196 cards
  to keep ~23 is waste). Engine defaults `--max-loads 5`, stops when the oldest loaded card is older
  than `--days`.

## (4) WEBFETCH / JD FILTERING — two-way-fit gate (apply only if BOTH hold)
Run the gate from `gary-job-search` / `operating-rules.md`. **Card-pattern PRE-FILTER first:** the
card shows the location (`Remote (Any location)` / `Remote (Chile)` / `Santiago (Hybrid)`) → drop
region-locked / hybrid / on-site **by card WITHOUT a JD read**; only remote-worldwide /
remote-eligible-for-the-candidate / blank-ambiguous cards proceed. Then read each survivor's **real
JD** — logged-in via CDP (~0 tokens) or WebFetch `links.public_url` (also reveals if the posting is
still open, i.e. an Apply/Postular button is present). GetOnBoard-specific gotchas:
- `remote_local` ≠ worldwide — confirm the JD allows the candidate's country (many are residency-
  locked to Chile/Peru/etc. → eligibility fail).
- Salary is `min_salary`/`max_salary` in **USD/month**; **comp handling follows the candidate's preference
  (DATA in NotebookLM / `gary-context.md`)** — if "comp is informational" (the common case), record it, never
  reject or down-score for below-floor or null. Only hard-filter if the candidate's DATA asks for it.
- Many programming-category posts are Java/.NET/Golang/SAP/Oracle/Outsystems/blockchain or QA/SDET/
  management — filter on title + JD against the candidate's stack from the RAG.
- Gap-skill hard req (a skill the candidate has 0 YOE in) → reject. English mandated above the
  candidate's level → reject. YOE over the candidate's ceiling → reject. **Company-dedup per candidate
  preference (DATA)** — if "no dedup by company", multiple roles per company stay; only skip already *applied*.

## How the orchestrator uses the queue
1. This node writes survivors into the consolidated **`data/offers-master.md`** (GetOnBoard section:
   Company | Title | Location | Comp | Apply URL | fit note) — never a scattered per-channel file.
2. The orchestrator hands survivors to `job-apply-prep`, which OPENS each `public_url` in the debug
   Chrome and STOPS before "Postular".
3. GetOnBoard opens are a logged-in CDP action → **serialized** with the other CDP nodes (linkedin,
   gmail, himalayas), never concurrent. The user reviews each open offer and clicks Postular himself.
4. After the user confirms a Postular, flip the tracker row to Applied (never before).

## Cross-references (don't duplicate here)
- Operational node summary → **`source-getonbrd`** (this is its detailed reference).
- Candidate facts, skills+YOE, EEO, comp floor, eligible geos → `config/profile.yml` + NotebookLM RAG.
- Hard rules, per-offer workflow, network architecture, CDP reliability → `gary-job-search` +
  `docs/operating-rules.md`.
- Browser / CDP engine (agent-browser loop, daemon gotcha) → `chrome-autoapply`.
- Field-answer engine (for ATS nodes, not GetOnBoard's fieldless apply) → `easyapply-autofill`.
</content>
