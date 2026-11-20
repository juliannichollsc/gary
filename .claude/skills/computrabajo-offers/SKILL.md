---
name: computrabajo-offers
description: Computrabajo Colombia (co.computrabajo.com) as a source node in GARY's application network — source/filter offers anonymously via WebFetch (no CDP), then APPLY FULLY AUTOMATICALLY with engines/computrabajo-apply.mjs (gate on the user's role map + minimum salary + modality, answer the employer questionnaire, send) — only offers applied to ON computrabajo.com. The user's preferences must be ASKED, never assumed. Use when sourcing or applying to Computrabajo offers.
metadata:
  author: Julián Nicholls (@jnichollsc)
---

# Computrabajo Colombia — source node

> **Before changing anything for this channel** (engine, selectors, verification, defaults): follow the `connections` skill §1 change protocol — baseline + re-run `node engines/check-connections.mjs`, change only this site's own rule, keep defaults, log the incident. Verification rule for this site lives ONLY in `engines/connections.mjs`.


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

## USER PREFERENCES — ASK EVERY USER, NEVER ASSUME (mandatory)
Computrabajo's questionnaire asks things like **"¿cuál sería tu aspiración salarial?" / "¿cuánto aceptas?"**
and **modality**, and the engine gates on them. These are **each user's own preferences**: GARY is used by
many people, so the agent must **never reuse another user's answers** (not the owner's, not a previous
session's guess) and the engine has **no defaults** — it refuses to run without them. Before the first
Computrabajo run, if the user's NotebookLM RAG doesn't have them, **ASK the user** and persist the answers to
the RAG (never to repo files):
1. **Roles** to apply to (title regex built from the user's role map in `gary-context.md`) → `--roles`.
2. **Minimum monthly salary in COP** they accept → `--min-salary` (also the default "aspiración" answer;
   `--aspiracion` if they want to ask for more than their floor).
3. **Modality**: `remoto` · `remoto+ciudad` (on-site/hybrid only in their city → also ask the **city**,
   `--ciudad`) · `cualquiera` → `--modalidad`.
4. **Offers without a published salary**: apply (answer the aspiración) or skip → `--sin-salario aplicar|saltar`.
5. Any other recurring questionnaire answer (academic level, YOE per stack…) comes from the CV in the RAG;
   unknown → the engine records it and does NOT send (see below).

## AUTOMATION — FULLY AUTOMATIC apply on computrabajo.com (owner decision 2026-10-30)
**Scope: only offers applied to ON computrabajo.com.** If "Aplicar" leads to another website (external
ATS/company site) the engine skips it (`SKIP_EXTERNAL`) — out of scope, never automated.
**Exception to "never Submit":** the owner authorized Computrabajo to be sent automatically, because its
"Aplicar" is itself the send for offers without questions. The gate (role + salary + modality) is what
protects the user; an unanswered required question still blocks the send.

```
node engines/computrabajo-apply.mjs --roles "<regex>" --min-salary <COP> --modalidad <m> [--ciudad <c>] \
  [--sin-salario aplicar|saltar] [--aspiracion <COP>] [--max 10] [--pace 1.5] <search-url…>
```
Inputs are **search listing URLs** (e.g. `https://co.computrabajo.com/trabajo-de-react-en-teletrabajo`) —
the engine walks the cards. **Never apply from the standalone offer page**: its button points to
`candidato…/match/?oi=`, a route Computrabajo's own JS files as *post-apply* (sends without the gate).

### Flow + selector map (mapped live 2026-10-30)
| Step | Selector / signal | Engine action |
|---|---|---|
| listing card | `<article>` + `a[href*="/ofertas-de-trabajo/"]` ending in the 32-hex offer id | title vs `--roles` (no click if it fails) |
| detail panel | click card → `[data-offers-grid-detail-container]`: header (company · city · modality) + summary ("A convenir" or `$ X (Mensual)`) before "Descripción de la oferta" | gate: salary ≥ min (COP/month), modality (Presencial · Remoto · Presencial y remoto = hybrid), city |
| Aplicar | `[data-apply-ac][offer-detail-not-applied]` → `POST candidato…/candidate/apply/?oi=` | JSON `result:"OfferHasKQ"` ⇒ questionnaire; other success ⇒ **APPLIED**; non-computrabajo redirect/tab ⇒ SKIP_EXTERNAL |
| questionnaire | `[form-apply-kq] [div-kq]`: `<label>` + textarea `KillerQuestions[N].OpenQuestion` or radios `…ClosedQuestion` | salary/modality from flags; rest `answerFor()`; unknown ⇒ NEEDS_ANSWERS + "Volver al detalle" (not sent) |
| send | `a[data-apply-ac-kq]` "Enviar mi HdV" → `POST candidato…/candidate/kq/apply` | **APPLIED** |
| already applied | "Volver a aplicar" instead of Aplicar | ALREADY_APPLIED |

Statuses: `APPLIED` · `NEEDS_ANSWERS` (record → resolve from the RAG, `learn()`, re-run) · `SKIP_ROLE` ·
`SKIP_SALARY` · `SKIP_MODALITY` · `SKIP_EXTERNAL` · `ALREADY_APPLIED` · `CLOSED` · `BLOCK` · `ERROR`.

### MANDATORY PACING (same model as LinkedIn `source-linkedin §1`, JITTERED)
ONE process, ONE tab, serial · **4–9 s** per offer view · **8–15 s** per results page · **2.5–4.5 s** per
step + human-ish typing · **30–60 s between applications** · **≤10 applications per run** (`--max`, cap 15) ·
`--pace N` slows all (N<1 refused). **AUTO-STOP** on HTTP 429 / captcha / login wall → writes
`output/computrabajo-block.json` → no retry the same day. `output/computrabajo-seen.json` = resumable.

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
2. The orchestrator (`/job-network`) runs **`engines/computrabajo-apply.mjs`** over the software-keyword
   search URLs with THIS user's preferences (asked → RAG, see USER PREFERENCES).
3. The apply engine is CDP → **SERIALIZED** with the other CDP nodes — never concurrent.
4. Each `APPLIED` row → tracker = Applied (the engine sent it). `NEEDS_ANSWERS` → resolve from the RAG,
   re-run.

## Cross-references (do not duplicate here)
- Candidate facts, skills+YOE, EEO, standard answers, comp floor / on-site-city policy → **NotebookLM
  RAG** (`config/profile.yml` for the DATA).
- Hard rules, per-offer workflow, network architecture, CDP reliability → **`docs/operating-rules.md`**
  / **`gary-job-search`**.
- Two-way-fit gate + standing goal → **`docs/operating-rules.md`**.
- Answer engine for the questionnaire → **`easyapply-autofill`** / `engines/apply-fields.mjs`.
