---
name: source-getonbrd
description: GetOnBoard source node for GARY — source via the public REST API (no login) or the logged-in /myjobs feed over CDP, paginate the whole set with early-stop, card-pattern pre-filter region-locked/hybrid, read each survivor's real JD, then hand survivors to the orchestrator. Apply = one-click "Postular" = the user's click. Use when sourcing GetOnBoard. Detailed reference: getonbrd-offers.
metadata:
  author: "Julián Nicholls (@jnichollsc)"
---

# GetOnBoard source node (GARY)

> **GARY banner.** Candidate-agnostic. Canonical rules: `docs/operating-rules.md`; per-board runbook:
> `docs/career-ops-map.md §4.3`. Candidate facts (comp floor / city / country / language / eligible
> geos) are DATA in `config/profile.yml`; skills, YOE and gaps come from the **NotebookLM RAG**. The
> detailed board reference is the sibling skill **`getonbrd-offers`**; this node is the operational
> summary. Do NOT duplicate the hard rules / two-way-fit gate — they live in `gary-job-search`.

GetOnBoard (getonbrd.com) is one website node. It has two source paths: the **public REST API**
(no login, parallelizes with other API/WebFetch nodes) and the **logged-in `/myjobs` feed** (CDP on
the one debug Chrome, serialized with the other CDP nodes). Apply is a profile-based **one-click
"Postular"** — no form fields to auto-fill, and the click submits, so it is the user's.

## The 4 dimensions

### (1) BLOCKS / anti-bot + mitigation
- **OAuth anti-bot:** GetOnBoard login via **Google AND LinkedIn OAuth resist automation** (Google
  generally blocked; LinkedIn per-site). Mitigation: the debug Chrome must **already be logged in** —
  read `/myjobs` over CDP only, **never trigger a login flow**. If not logged in → STOP, hand to the
  user to sign in. Public-API sourcing needs no login at all, so prefer it when you only need breadth.
- **No Cloudflare / captcha wall** on GetOnBoard content (verified) — JD reads over CDP are ~0-token
  and reliable. A captcha, if one ever appears at submit, is ALWAYS the user's (hard rule).
- **`&expand=company` → HTTP 500** — never send it; resolve company names separately (see below).
- **`/api/v0/jobs/<slug>` → 401** (auth-only) — don't rely on the single-job detail endpoint; use the
  list endpoints + a JD read instead.
- **Already-applied:** a card showing **"Ver postulación"** = already applied → skip it.
- **Dead posting:** a **404** on `links.public_url` = the posting is gone → drop it.

### (2) AUTOMATION — source engine + one-click apply (open-and-hand-off, 0% auto-fill)
- **Logged-in engine:** `engines/getonbrd-matches.mjs` — drives the debug Chrome (`:9333`, DATA) to
  the `/myjobs` "Jobs for you" feed, sets the filter chips, pages with **"Load more jobs"**, applies
  the card pre-filter, and reads each survivor's JD over CDP. `--max-loads` / `--days` control the
  early-stop (see Pagination).
- **Public-API sourcer:** fetch the search + category list pages (no CDP), keep `{attributes,
  links.public_url}`, prelim-filter `seniority>=4 && remote!==false && age<=8d`, then resolve company
  names for survivors. Parallelizes with other WebFetch/API nodes; **never run CDP nodes
  concurrently.**
- **Filter chips (DATA, from `profile.yml` / role map):** Category = Programming · Employment = Full
  time · Seniority = the candidate's level(s) (e.g. Senior + Semi Senior) · **Salary chip = per the
  candidate's comp preference (DATA)** — if comp is informational (the common case), leave it OPEN so
  below-floor postings aren't excluded at the source · Location = remote, eligible for the candidate's geo.
- **Apply = one-click "Postular" = the USER'S click.** It submits using the saved profile + CV —
  **there are NO fields to auto-fill** (nothing for the filler engine to do). The agent OPENS the
  offer and STOPS; the user clicks Postular. This node contributes OPENS, not auto-filled
  applications.

### (3) PAGINATION — traverse the whole set, EARLY-STOP past the 1-week window
GetOnBoard has **no date filter** and the feed runs **newest→oldest**, so click **"Load more jobs"**
only until the loaded cards drop past the 1-week window — **>5 load steps means you've gone past the
week → STOP** (loading ~196 cards to keep ~23 is waste). Engine defaults: `--max-loads 5` and it stops
once the oldest loaded card is older than `--days`. For the public API, page via `meta.total_pages`
but stop once `published_at` age exceeds ~8d.

### (4) WEBFETCH / JD FILTERING — never title/card alone
- **Card-pattern PRE-FILTER (no JD read):** the card itself shows the location — `Remote (Any
  location)`, `Remote (Chile)`, `Santiago (Hybrid)`, etc. **Drop region-locked / hybrid / on-site by
  card pattern WITHOUT reading the JD**; only **remote-worldwide / remote-eligible-for-the-candidate /
  blank-ambiguous** cards proceed. This cuts ~23 cards to ~5 JD reads.
- **Then read EACH survivor's real JD** — logged-in via CDP (`getonbrd-matches.mjs`, ~0 tokens) or, on
  the public path, **WebFetch `links.public_url`** (which also reveals if the posting is still open).
  Validate on the JD, never the card title: location eligibility + sponsorship (`remote_local` ≠
  worldwide — confirm the candidate's country is allowed), language, stack fit, no gap-skill hard req,
  English within the candidate's level, YOE within ceiling. **Comp + company-dedup per the candidate's
  preference (DATA in NotebookLM / `gary-context.md`)** — common case: comp informational (record only),
  no dedup by company (multiple roles per company stay; only skip an offer already *applied to*).

## Key API fields (list item `attributes`)
`title`, `seniority.data.id` (1 No-exp · 2 Junior · 3 Semi-Senior · **4 Senior** · 5 Expert/Lead),
`remote` (bool), `remote_modality` (**`fully_remote`** = worldwide-ish · **`remote_local`** =
residency-restricted → verify eligibility), `countries`, `min_salary`/`max_salary` (USD/mo, often
null), `published_at` (unix → age for the ≤1-week rule), `applications_count`, `lang`. Live apply URL
= **`links.public_url`** (301s to `/jobs/<category>/<slug>`; a 404 = dead → drop). Endpoints:
- Search: `https://www.getonbrd.com/api/v0/search/jobs?query=<q>&per_page=30&page=<n>`
- Category: `https://www.getonbrd.com/api/v0/categories/programming/jobs?per_page=30&page=<n>`
- Company (id→name): `https://www.getonbrd.com/api/v0/companies/<id>` (cache; ~120ms rate-limit).

## How the orchestrator uses the queue
1. This node writes survivors into the consolidated **`data/offers-master.md`** (GetOnBoard section:
   Company | Title | Location | Comp | Apply URL | fit note) — never a scattered per-channel file.
2. The orchestrator hands survivors to `job-apply-prep`, which OPENS each `public_url` in the debug
   Chrome and STOPS before "Postular".
3. GetOnBoard opens are a logged-in CDP action → **serialized** with the other CDP nodes (linkedin,
   gmail, himalayas), never concurrent. The user reviews each open offer and clicks Postular himself.
4. After the user confirms a Postular, flip the tracker row to Applied (never before).

## Cross-references (don't duplicate here)
- Detailed board reference (fields, gotchas, apply flow) → **`getonbrd-offers`**.
- Hard rules, two-way-fit gate, per-offer workflow → `gary-job-search` + `docs/operating-rules.md`.
- Browser / CDP engine (agent-browser loop, daemon gotcha) → `chrome-autoapply`.
- Candidate facts / comp floor / eligible geos → `config/profile.yml` + the NotebookLM RAG.
</content>
