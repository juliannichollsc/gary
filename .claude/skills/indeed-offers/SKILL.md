---
name: indeed-offers
description: Indeed Colombia (co.indeed.com) as a source node in GARY's application network — source listings via anonymous WebFetch (page-1 only; Indeed is aggressively anti-bot), triage with the two-way-fit gate, then AUTO-FILL Indeed Apply ("Postúlate rápidamente") survivors to the review step with engines/indeed-apply.mjs over the logged-in automation Chrome (never sends). "Postularse en el sitio de la empresa" (external) postings are NOT auto-applied — they are kept as MANUAL for the user to apply by hand. Use when sourcing or applying to Indeed offers.
metadata:
  author: Julián Nicholls (@jnichollsc)
---

# Indeed Colombia — source node

> **Before changing anything for this channel** (engine, selectors, verification, defaults): follow the `connections` skill §1 change protocol — baseline + re-run `node engines/check-connections.mjs`, change only this site's own rule, keep defaults, log the incident. Verification rule for this site lives ONLY in `engines/connections.mjs`.


> Candidate-agnostic. Canonical rules: `docs/operating-rules.md`; per-board runbook:
> `docs/career-ops-map.md` §4.

Indeed CO (https://co.indeed.com) is one website node in GARY's application network. Canonical
candidate facts, hard rules, and the two-way-fit gate live in **`gary-job-search`** +
**`docs/operating-rules.md`** + the **NotebookLM RAG** — this skill does NOT duplicate them; it
documents only what is Indeed-specific. **Bottom line up front:** source page-1 results anonymously
(WebFetch), triage, then **auto-fill Indeed Apply survivors to the review step** with
`node engines/indeed-apply.mjs <jk…>` — the final "Enviar tu postulación" is the user's click.

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
- **Scraping Indeed over CDP trips CAPTCHA + Cloudflare fast** (*"verifica que eres humano"*) → never
  source/paginate over CDP; WebFetch is the read tool. The ONE debug Chrome (`:9333`, from
  `config/profile.yml → job_search.automation_browser`) is used ONLY by the paced apply engine
  (`engines/indeed-apply.mjs`, see AUTOMATION). The user's personal browser is OFF-LIMITS.
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
  wrong-stack) before fetching the JD. **A card WITHOUT the "Postúlate rápidamente" badge applies on the company site** → it is
  NOT auto-applied but is KEPT as **manual** (`apply: manual`, the user applies by hand) straight from the card —
  no viewjob load for it (fewer requests = less block risk). Only badge cards go to `indeed-apply.mjs`.

## WEBFETCH FILTERING — validate the real JD, never the card alone
WebFetch each search URL, extract `{title, company, location, remote?, salary, jk}` from cards, then
WebFetch **`viewjob?jk=<jk>`** for survivors to read the full JD (eligibility, region-lock, YOE,
English level, AWS requirement, comp) and the apply mechanism. The card/title is a pre-filter only —
the fit and eligibility decision is made against the real JD text.

## AUTOMATION / apply mechanism — Indeed Apply auto-fills to REVIEW (mapped live 2026-10-30)
**AUTO-APPLY only "Postúlate rápidamente" / "Postularse ahora" on Indeed (Indeed Apply, applied ON indeed.com).**
An offer that redirects to the company site ("Postularse en el sitio de la empresa" — or, generally, a live viewjob
with NO Indeed Apply button that isn't closed/already-applied) → **`MANUAL_EXTERNAL`**: kept for the USER to apply by
hand, written to `output/indeed-manual.json` and merged into the offers map as `apply: manual`. The bot never
follows the external link, never fills a company form (owner order 2026-11-10; 7 external offers were lost that day
as "sin Indeed Apply" because the company-site CTA text varies).

`node engines/indeed-apply.mjs [--max 10] [--pace 1.5] <jk | viewjob-url> […]` on the logged-in :9333
session — same model as LinkedIn Easy Apply (`easyapply-batch.mjs`): fills to the **review** step and
STOPS; "Enviar tu postulación" = **the user's click** (hard rule 6). One JSON line per offer, `status`:
`READY` (review reached → user sends) · `NEEDS_ANSWERS` (application PAUSED on its tab — see "Ask in the
middle → resume" below) · `NEEDS_RESUME` · `MANUAL_EXTERNAL` (company site → the user applies) · `CLOSED` · `ALREADY_APPLIED` · `ALREADY_SENT` ·
`VALIDATION`/`STUCK` (supervisor inspects the tab) · `BLOCK` (run stopped — see pacing).

### Ask in the middle → resume on the SAME tab (MANDATORY, owner order 2026-11-10 — every user, their own RAG)
The application is completed by **GARY's supervisor LM + the bot + the user's RAG**, never left for the user to
fill by hand and never restarted in a new tab:
1. **Map** — the engine fills what it knows and, on the first step with unknown required questions, **PAUSES**:
   the tab stays open on that step, `output/indeed-pending.json` gets `{ jk: { company, title, step, targetId,
   questions: [{ name: "q_<hash>", label, type, options }] } }` (questions only, no answers) and it prints
   `⏸ INDEED-NEEDS-ANSWERS <jk> …`.
2. **Create the answers** — the LM reads `indeed-pending.json` and answers EACH question for THIS user, **humanized
   (plain, first person, no exaggeration) and in the exact shape the field `accepts`** (`easyapply-autofill` → "Answer
   style + field contract"); `TYPE_MISMATCH` / `INVALID_AFTER_FILL` entries carry the `why` → fix the shape, not the facts:
   - facts (residence, years per skill, frameworks used, visa/work authorization, profile URLs) → **NotebookLM RAG**
     (`gary-context.md` cache); count years from the CV dates, never round up;
   - open questions ("Describe how you use AI tools…", "a security issue you fixed…") → **compose truthfully from
     the CV/RAG** (2–5 sentences, first person, the JD's language; only real experience — a gap is stated as a gap,
     e.g. "No production BigQuery yet; I have …");
   - choice questions → pick EXACTLY one of the listed `options` (copy its text);
   - anything the RAG doesn't have (street address, postal code, a yes/no only the user knows, salary) →
     **ASK the user** in ONE AskUserQuestion round per application, then persist durable answers to the RAG
     (never to committed files);
   - an eligibility answer that disqualifies (e.g. must live in the US) → don't lie: tell the user and leave it paused.
   Write them to **`output/indeed-answers.json`**: `{ "<jk>": [{ "name": "q_<hash>", "value": "…" }] }` (match by
   `name`; `label` or `re` also accepted).
3. **Implement / resume** — `node engines/indeed-apply.mjs --resume` (all paused jks, or list them): the engine
   **re-attaches to the SAME tab** (CDP target id, else the job header), fills the answers with human typing,
   presses Continuar and walks on to **review → READY** (never sends — "Enviar tu postulación" stays the user's
   click). A later step with new questions pauses again → repeat 2–3. If the tab was closed it reopens the offer
   ONCE (Indeed keeps the draft). Re-running a paused jk without `--resume` also re-uses its tab.
4. The per-run answers file is **deleted by the engine after the run** (PII never stays on disk);
   `indeed-pending.json` drops each jk once it reaches READY / a final status.

### Flow + selector map (smartapply.indeed.com/beta/indeedapply/form/<module>/…)
| Step | Selector / signal | Engine action |
|---|---|---|
| viewjob | `a[data-testid="viewjob-indeed-apply"]` → `href` to smartapply | absent ⇒ CLOSED / ALREADY_APPLIED (said by the page) else MANUAL_EXTERNAL / legacy NO_INDEED_APPLY |
| `contact-info-module` | label-based inputs (usually prefilled from the Indeed profile) | generic `fillForm` |
| `resume-selection-module` | `input[name="resume-selection"]` radio cards (CV Indeed vs uploaded file) | keep the checked one; none ⇒ NEEDS_RESUME |
| `questions-module/questions/N` | wrapper `[data-testid="input-q_<hash>"]`, question = `…-label`, required ⇔ `…-label-asterisk`; controls `:is(input,select,textarea)[name="q_<hash>"]` (the `<fieldset>` also carries the name) | `answerFor(question)`; radios by `label[for]` text |
| `review-module` | visible "Enviar tu postulación" | **STOP — READY** |
| header | `[data-testid="ia-JobHeader-headerContainer"]` = "<title> <company> - <location>" | company for the pending queue |

### Anti-bot traps (respect them)
- **Honeypot buttons:** hidden `button[data-testid^="hp-continue-button-"]` — clicking them flags a bot.
  Only click a **visible** button whose TEXT is Continuar/Continue/Revisar tu postulación.
- **Randomized testid:** on the questions step the real Continuar's `data-testid` is a random hash —
  never select it by testid.
- **Invisible reCAPTCHA Enterprise** rides on every step (`g-recaptcha-response`) — normal. Only a
  VISIBLE challenge frame (`recaptcha …bframe` / Cloudflare) means CAPTCHA → stop, hand off.
- **MANDATORY PACING (account guard — same model as LinkedIn `source-linkedin §1`, JITTERED, never
  batched):** ONE tab, SERIAL · **4–9 s** on each viewjob · **2.5–4.5 s** per form step + human-ish typing ·
  **30–60 s between applications** · **≤10 applications per run** (`--max`, hard cap 15) · `--pace N`
  slows everything (N<1 refused). **NEVER run two `indeed-apply` processes at once.**
- **AUTO-STOP:** HTTP 429, a VISIBLE captcha/Cloudflare challenge ("Just a moment… / Additional
  Verification Required"), or the sign-in wall (`secure.indeed.com/auth`) → run stops, progress saved,
  `output/indeed-block.json` written → the engine **refuses to run again the same day**. Tell the user to
  clear the check in Chrome:9333 and resume another day. `output/indeed-seen.json` makes runs resumable
  (final outcomes are never reprocessed).

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
2. The orchestrator (`/job-network`) sends **Indeed-Apply survivors** to **`job-apply-prep`**, which runs
   `node engines/indeed-apply.mjs <jk…>`, resolves every `⏸ INDEED-NEEDS-ANSWERS` pause with the
   "Ask in the middle → resume" loop above (RAG → compose → ask the user → `--resume`, same tab) and reports
   each `READY` tab to the user to send. External ("sitio de la empresa") survivors are NOT dropped: they go to
   the offers map as `apply: manual` (from the card or `output/indeed-manual.json`) for the user to apply by hand.
3. Sourcing is anonymous WebFetch → it **PARALLELIZES** with other API/WebFetch nodes (getonbrd,
   himalayas, free boards). The apply engine IS CDP → it runs **serialized** with the other CDP nodes.
4. After the user confirms they applied, flip the tracker row Evaluated → Applied (never before).

## Cross-references (don't duplicate here)
- Candidate facts, skills+YOE, EEO, standard answers → **NotebookLM RAG** (`config/profile.yml` for
  the DATA).
- Hard rules, per-offer workflow, network architecture, CDP reliability, WebFetch-reads-listings →
  **`docs/operating-rules.md`** / **`gary-job-search`**.
- Two-way-fit gate + standing goal → **`docs/operating-rules.md`**.
- Field-answer engine (employer questions in `indeed-apply.mjs`) →
  **`easyapply-autofill`** / `config/apply-fieldmap.json`.
