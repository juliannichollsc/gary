---
name: computrabajo-offers
description: Computrabajo Colombia (co.computrabajo.com) as a source node in GARY's application network — source/filter offers anonymously via WebFetch (no CDP), triage them hard with the two-way-fit gate (most postings are local on-site and below the comp floor), and hand the rare survivors to the orchestrator to OPEN for the user's logged-in one-click Aplicar. Use when sourcing or applying to Computrabajo offers.
metadata:
  author: Julián Nicholls (@jnichollsc)
---

# Computrabajo Colombia — source node

> Candidate-agnostic. Canonical rules: `docs/operating-rules.md`; per-board runbook:
> `docs/career-ops-map.md` §4.

Computrabajo is one website node in GARY's application network. Canonical candidate rules, hard
rules, and the two-way-fit gate live in **`gary-job-search`** + **`docs/operating-rules.md`** + the
**NotebookLM RAG** (candidate facts) — this skill does NOT duplicate them; it only documents what is
Computrabajo-specific. CAUTION: this is a **low-yield node** — see triage below.

## What it is
Computrabajo is the largest general job board in LatAm / Colombia (co.computrabajo.com). It is a
mass-market, mostly local-Colombian board dominated by on-site administrative, commercial,
industrial, and staffing-agency roles. Software/dev postings exist (a few hundred "desarrollador de
software" at any time) but are a small slice and skew on-site, .NET/Java/Python, and well below the
candidate's comp floor. Treat it as a long-tail supplement to LinkedIn/GetOnBoard/Himalayas, NOT a
primary feed.

## Access — anonymous browsing (no login to SOURCE)
Browsing and reading listings needs NO login, so sourcing uses WebFetch only — no CDP browser — and
parallelizes with the other API/WebFetch nodes (never run CDP nodes concurrently). Apply DOES
require a logged-in Computrabajo account (see AUTOMATION below). There is no public API; scrape the
HTML search pages with WebFetch.

## Search / filter — path-based URLs (verified 2026-06-24)
Computrabajo encodes the query in the URL PATH, not query params. Confirmed patterns:
- **Keyword:** `https://co.computrabajo.com/empleos-de-{keyword}` — e.g. `/empleos-de-react`
  (returned 62 React offers), `/empleos-de-desarrollador-de-software`.
- **Keyword + location:** `https://co.computrabajo.com/trabajo-de-{keyword}-en-{place}` — e.g.
  `...-de-desarrollador-de-software-en-antioquia`, `...-en-bogota-dc`, `...-en-{the candidate's city}`,
  **`...-en-teletrabajo` (remote)**.
- **PITFALL:** the bare `/trabajo-de-desarrollo` URL matches the Spanish word *desarrollo*
  (business/HR/product development), NOT software — it returns mechanical engineers, SDRs, HR
  *desarrollo humano*, etc. **ALWAYS search a software-specific keyword:** `desarrollador-de-software`,
  `react`, `angular`, `frontend`, `full-stack`/`fullstack`, `node`, `javascript`, `typescript`,
  `react-native`, `next-js`, `desarrollador-web`.
- **On-page filters** (apply at runtime): date — *Hoy / Últimos 3 días / ÚLTIMA SEMANA / Últimos 15 días /
  Último mes*; work type — *REMOTO / Híbrido / Presencial*; experience — *Sin experiencia … Más de 10 años*;
  salary tiers; contract type; department/city. The filter hrefs are **not** exposed to WebFetch
  text-extraction (see PAGINATION).
- Salary, when shown, is COP/month (e.g. `$3.500.000`). Many cards show no salary.

## Anti-bot / BLOCKS + mitigation
- **Sourcing is unauthenticated → essentially unblocked.** Search-page HTML renders server-side, so
  WebFetch reads cards without triggering bot walls. This is the safe read path.
- **Login-required-to-apply.** The Aplicar action needs a logged-in Computrabajo session in the ONE
  debug Chrome (`:9333`, from `config/profile.yml → job_search.automation_browser`). If the session
  is not logged in, **hand off for the user to log in** — do NOT trigger an automated
  registration/login (that trips bot detection). The user's personal browser is OFF-LIMITS.
- **Captcha** (if any at submit/registration) is ALWAYS the **user** (never the agent) — hard rule 6.
- **Already-applied / closed-expired.** WebFetch the detail page before queuing to confirm an
  **Aplicar** button is present; if it is missing (already applied / posting pulled), drop the row.
- **429 / rate-limit.** Space WebFetch calls if a burst starts returning empty/blocked HTML; back off
  and retry rather than hammering.

## AUTOMATION — INTERNAL one-click Aplicar; OPEN-and-hand-off (LOW auto-fill)
- Computrabajo apply is an **internal one-click profile apply**: the button reads **APLICAR**
  (sometimes *Postularme* / *Inscribirme*). It submits using the candidate's Computrabajo profile/CV
  and stays on-platform (tracked under *Mis Aplicaciones*) — it does NOT redirect to an external ATS.
- It therefore behaves like a GetOnBoard *Postular*: **NO on-site form fields** to auto-fill in the
  common case → nothing for the filler engine (`config/apply-fieldmap.json`) to do. That single
  Aplicar click **SUBMITS** → per hard rule 6 it is the **user's click, never the agent's**. The
  agent OPENS the offer and **STOPS** (fill-to-Submit-and-STOP; here there is nothing even to fill).
- **Variant — screening questionnaire.** Some postings show a multi-step internal questionnaire
  (*preguntas de filtro*) before submit; those are eligibility/legal/role-specific screening
  questions → **ASK_USER** (persist the answer to the NotebookLM RAG so it is never re-asked). The
  filler never guesses them.
- **CDP path is serialized.** The apply OPEN is a logged-in CDP action on the one debug Chrome →
  serialized with the other CDP nodes (linkedin/gmail/getonbrd/himalayas), never concurrent.
- **Net:** AUTO-FILL = NONE in practice (profile-one-click has no fields; the variant is ASK_USER).
  This node contributes **OPENS for the user's click**, not auto-filled applications — it does NOT
  move the auto-apply margin. Run it as a light supplemental sweep, not a primary batch.

## PAGINATION — traverse the set, early-stop at 1 week, pre-filter cards
- Paginate the keyword/location search pages until either the result set is exhausted or the
  per-card age crosses the **≤1-week** recency rule (`publicado hace Xh/Xd`) — stop early once cards
  fall outside the week window.
- The runtime date/remote **filter hrefs are not exposed to WebFetch** text-extraction. When precise
  date/remote filtering is needed, either click those filters via CDP at apply-time, or just read
  the per-card `publicado hace Xh/Xd` age and the **Remoto/Híbrido** badge from the search HTML and
  pre-filter the cards yourself before spending any WebFetch on detail pages.
- Because survivor volume is low (comp-floor + on-site realities), a shallow sweep of the
  software-keyword + `teletrabajo` URLs at 1-week recency is usually enough — no need to deep-paginate
  the whole board.

## WEBFETCH FILTERING — read the real JD, never the card alone
WebFetch the **offer detail page** (not the card/title) before queuing to read the JD, city,
modality, YOE, AWS requirement, English level, and comp — and to confirm the posting is still open
(Aplicar present). Card title + badge are a pre-filter only; the fit decision is made against the
real JD text.

## Triage — two-way-fit gate (Computrabajo is the HARSH-filter node)
Run the gate from `docs/operating-rules.md` / `gary-job-search`. Computrabajo-specific realities —
most postings fail here, so filter aggressively before spending any apply effort:
- **COMP — follow the candidate's comp preference (DATA in NotebookLM / `gary-context.md`).** Salaries are
  COP/month; convert for the NOTES. Whether comp filters is a candidate preference — if the candidate's
  preference is "comp is informational" (the common case), do NOT drop or down-score for below-floor/blank.
  Only hard-filter comp if the candidate's DATA explicitly asks for it.
- **LOCATION (the killer here).** Most are on-site / hybrid in a specific Colombian city. On-site
  or hybrid is accepted **ONLY in the candidate's city** (`config/profile.yml`); everything else must
  be fully remote (*Remoto / teletrabajo*). So: keep `...-en-teletrabajo` / Remoto results, and
  on-site/hybrid results ONLY if the city matches the candidate's city — drop other-city on-site
  outright.
- **STACK FIT.** Board skews .NET/C#, Java/Spring, Python, SAP, analista/arquitecto. The candidate's
  fit and the gap skills come from the **NotebookLM RAG / `cv-data.md`**. Filter on title + WebFetch
  the detail.
- **STANDARD REJECTS** (same as every node, per `docs/operating-rules.md`): AWS hard-req → reject
  (gap skill); C1/C2-mandatory English → reject (candidate is below that level per RAG);
  10+ yrs or 5+ yrs-backend-specialist → reject; junior/intern/aprendiz/practicante → reject (Senior
  only). **Company-dedup follows the candidate's preference (DATA)** — if "no dedup by company" (the
  common case), multiple roles per company all stay; only skip an offer already *applied to* (same posting).

## How the orchestrator uses the queue
1. This node WebFetch-sources software-keyword/remote URLs, reads per-card age + modality + salary,
   triages hard, and writes survivors to **`output/gmail-harvest/computrabajo-queue.md`**
   (table: Company | Title | City | Modality | Comp COP | Age | Apply URL | fit note).
2. The orchestrator (`/job-network`) hands the queue to **`job-apply-prep`**, which OPENS each offer
   in the user's logged-in debug Chrome and STOPS before Aplicar (or before any screening questions,
   which it surfaces as **ASK_USER**).
3. Apply opens are **SERIALIZED** with the other CDP nodes — never concurrent. The user reviews each
   open offer and clicks Aplicar themselves.
4. After the user confirms an apply, flip the tracker row to Applied (never before). One app per
   company.

## Cross-references (do not duplicate here)
- Candidate facts, skills+YOE, EEO, standard answers, comp floor / on-site-city policy → **NotebookLM
  RAG** (`config/profile.yml` for the DATA).
- Hard rules, per-offer workflow, network architecture, CDP reliability → **`docs/operating-rules.md`**
  / **`gary-job-search`**.
- Two-way-fit gate + standing goal → **`docs/operating-rules.md`**.
- One-click-apply sibling pattern (no fields, the user's click) → **`getonbrd-offers`**.
