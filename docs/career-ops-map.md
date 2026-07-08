# career-ops → GARY map — the full apply runbook

> **What this is.** A total, actionable port of the `career-ops` prototype into GARY, written as a
> **runbook the terminal LLM executes without ambiguity**. Every board's exact step-by-step, the
> apply-to-Submit flow, the browser rules, the Himalayas rate-limit rule, and the
> ask-on-untracked→continue loop live here.
>
> **Independence.** GARY is **100% self-contained**. Nothing here references a `career-ops` directory
> at runtime — career-ops is only the *design source*. All paths below are **relative to the GARY repo
> root** (engines in `engines/`, data in `data/`, config in `config/`, skills in `.claude/skills/`).
> If you ever see an absolute `...\search-job\career-ops\...` path in a skill, it is a porting bug —
> treat it as GARY-relative and flag it.
>
> **Layering (don't duplicate rules).** The candidate-agnostic *methodology* lives in
> [`operating-rules.md`](operating-rules.md); this map is the **per-board execution detail** that
> operating-rules §4 points to. Candidate *facts* live in the **NotebookLM RAG** (CV + accumulated
> Q&A) with `config/profile.yml` + `cv-data.md` + `config/apply-fieldmap.json` as derived caches.
> Never hardcode a person into the flow.

---

## 0. career-ops → GARY translation table (read once)

the career-ops prototype was candidate-specific and used a two-browser setup; GARY generalizes it. When you read a
legacy board skill (`chrome-autoapply`, `easyapply-autofill`, `*-offers`, `jnichollsc-job-search`),
mentally apply this map:

| career-ops (prototype) | GARY (this repo) |
|---|---|
| `output/*.mjs` engines | `engines/*.mjs` (run with **CWD = repo root**) |
| `output/apply-fieldmap.json` | `config/apply-fieldmap.json` |
| `output/apply-pending-fields.json` | `output/apply-pending-fields.json` (runtime scratch, gitignored) |
| `output/gmail-harvest/…` (seen/survivors/queues) | `output/gmail-harvest/…` (same, gitignored) |
| `cv-data.md` + `config/profile.yml` = source of truth | **NotebookLM RAG = source of truth**; `cv-data.md`/`profile.yml` are derived caches |
| skill `jnichollsc-job-search` (candidate + rules hub) | skill `gary-job-search` + `docs/operating-rules.md` (candidate-agnostic) |
| Personal **Brave :9222** (source reads) + dedicated **Chrome :9333** (apply) | **ONE debug Chrome :9333** for *everything* (port/profile are DATA in `profile.yml → job_search.automation_browser`) |
| `ASK_JULIAN` policy | `ASK_USER` policy (ask the current user, then `learn()`) |
| `data/applications.md` (upstream 9-col TSV tracker + `reports/`) | `data/offers-master.md` (the one scored map) + `data/orchestrator-state.md`; **no reports/, no TSV pipeline** |
| Auto-submit was the prototype's stated wish | **Never auto-submit** — the harness blocks unsupervised outbound submission; fill to Submit and STOP (see §6) |

**Candidate-specific residue to ignore at runtime:** the legacy skills still say "Julián", "Medellín",
"AWS=0", "B2", "Brave", `+57`, etc. Those are *examples of the methodology*, not GARY data. The real
answers come from the NotebookLM RAG + `config/apply-fieldmap.json` (which GARY ships as a
`{{PLACEHOLDER}}` template).

---

## 1. Which agent / skill to use in each phase (avoid reprocessing)

The four agents in `.claude/agents/` and the skills in `.claude/skills/` map 1:1 to the flow. Use the
**right one per phase** — don't hand-drive what an engine does, don't spawn an LLM agent for a
deterministic fill.

| Phase | Agent | Skill(s) | Engine(s) | Output |
|---|---|---|---|---|
| Orchestrate / resume campaign | `job-orchestrator` | `gary-job-search` | — | reads/updates `data/orchestrator-state.md` |
| Source a board | (orchestrator dispatches) | `source-linkedin` · `source-gmail` · `source-getonbrd` · `source-himalayas` · legacy `*-offers` (indeed/computrabajo/tecla/vanhack/xpertdirect) · `website-analyzer` for a NEW site | `linkedin-scan.mjs` · `gmail-harvest.mjs` · `getonbrd-matches.mjs` · `himalayas-matches.mjs` · `scan-boards.mjs` · `scrape-matches.mjs` | raw offer URLs + JD |
| Triage (hard-rule gate) | `job-triage` | `gary-job-search` | (WebFetch, no CDP) | survivors only (never writes files, never applies) |
| Evaluate (A–G) + tailor CV | `job-evaluator` | `gary-job-search` + `chrome-autoapply` (drive rules) | `cv-builder.mjs` | report + `## Machine Summary` + tracker row + 0–5 score |
| Fill to Submit | `job-apply-prep` | `chrome-autoapply` (engine) + `easyapply-autofill` (answers) | `apply-from-linkedin.mjs` · `easyapply-batch.mjs` · `apply-assist.mjs` · `apply-fields.mjs` | offer parked at Submit, CV attached, unknowns surfaced |
| Merge / persist | `job-orchestrator` | — | — | `data/offers-master.md` (the one canonical map) + `data/orchestrator-state.md` |

**Never spawn `job-apply-prep`/an LLM agent for a routine known fill** — that burns tokens. The
deterministic script (`apply-from-linkedin.mjs`) does it at ~0 tokens; the LLM only steps in when the
script reports something NEW (ask-on-untracked, §7).

---

## 2. Session start — ASK first, never auto-run

On *start / iniciar / buscar / aplicar / continuar*, do **not** auto-run. Ask (AskUserQuestion):
1. **Which channel(s)?** one / several / all of: LinkedIn EasyApply · LinkedIn-via-Gmail · GetOnBoard ·
   Himalayas · Computrabajo/Indeed · xpertdirect/tecla/vanhack · **all**.
2. **Which execution method?** (A) orchestrator + N background agents (report token cost at the END —
   background doesn't surface live tokens) or (B) direct via the current agent (live in chat).

**Per-channel quick commands** ("revisa gmail", "revisa himalaya", "busca ofertas"): the channel is
implied → only ask the remaining undecided option; if the user already stated it, execute directly.

**Mandatory stop:** on *stop / para / detente / interrumpe*, halt immediately — stop dispatching,
`TaskStop`/kill processes, confirm nothing is running, then respond. Don't resume until told.

---

## 3. The two-way-fit gate (recap — full text in operating-rules §1)

Every offer must pass ALL of it during triage (thresholds are DATA in `profile.yml`/RAG):
- **Modality/location:** remote-worldwide · remote-LATAM-incl-candidate-country · on-site/hybrid **in
  the candidate's city** · OR explicit **visa sponsorship**. Region-locked otherwise → **delete the
  line** from the master doc (don't keep as discard).
- **Language:** Spanish or English only. Other-language JD/screening → discard. If English is B2,
  reject C1/C2-mandatory roles.
- **Profile fit:** match the real stack (RAG). Reject gap-core roles (a gap skill as the *core*
  requirement), backend-specialist over-asks (total YOE ≠ domain YOE), non-eng roles (UI/UX, PM,
  QA/SDET, pure data/ML, management-only). An "AI tools / Claude Code" mention does NOT rescue them.
- **YOE:** scan the WHOLE JD. Reject 10+ (or above the candidate's total). 8–9 = stretch → flag.
- **Comp:** floor is a negotiation guide, **not a hard filter** — note it, don't auto-drop.
- **One application per company:** check `data/offers-master.md` (and `data/orchestrator-state.md`)
  first. Applied within ~1 week and a different role surfaces → **warn the user**, don't auto-decide.
- **Closed postings:** "No longer accepting applications"/expired → discard. **Authoritative check is
  the LOGGED-IN tab** — guest WebFetch can wrongly report OPEN.
- **Already-applied signals:** GetOnBoard "Ver postulación", Xpert Direct "pitched", LinkedIn apply
  emails → skip.
- **Cooldowns:** honor per-company cooldown in `profile.yml → job_search.cooldowns`.

**Universal sourcing rule:** never filter on the title/card alone — **paginate the whole result set,
fetch each offer's real JD, validate on the description.** Prefer the logged-in CDP browser (≈0
tokens); WebFetch is the fallback. No date filter on a board → apply the **≤1-week recency** rule
yourself from the card/JD date.

---

## 4. Per-board runbook

**Each board also has a dedicated skill carrying the full 4-dimension detail (blocks/anti-bot ·
automation · pagination · WebFetch filtering) — candidate-agnostic. Load the board's skill for the
exact steps; this section is the cross-board index.**

| Board | Skill(s) | Section |
|---|---|---|
| LinkedIn EasyApply | `source-linkedin` + `chrome-autoapply` (engine) + `easyapply-autofill` (answers); methodology in `data/linkedin-playbook.md` | §4.1 |
| LinkedIn via Gmail | `source-gmail` | §4.2 |
| GetOnBoard | `source-getonbrd` + `getonbrd-offers` | §4.3 |
| Himalayas | `source-himalayas` | §4.4 |
| Computrabajo | `computrabajo-offers` | §4.5 |
| Indeed | `indeed-offers` | §4.6 |
| Tecla / VanHack / XpertDirect | `tecla-offers` · `vanhack-offers` · `xpertdirect-offers` | §4.7 |
| A new board | `website-analyzer` | §4.8 |

Recurring screening-field answers: `data/easyapply-questions.md`. Company dedup: `data/applications.md`
+ `data/offers-master.md`. Pending-offer inbox: `data/pipeline.md`.

### Concurrency model (critical)
- **CDP channels run SERIAL** on the one debug Chrome: LinkedIn EasyApply, GetOnBoard, Himalayas,
  xpertdirect, tecla, vanhack, Computrabajo apply. One tab at a time — **3 LinkedIn tabs → 429**.
- **WebFetch/API channels PARALLELIZE**: Gmail-LinkedIn triage, GetOnBoard public API, Himalayas
  WebFetch, Indeed, Computrabajo sourcing. Real parallelism is **across sources**, not multiple tabs
  of the same site.
- **Himalayas WebFetch: MAX 2 concurrent** (see §4.4).

### 4.1 LinkedIn EasyApply — the only truly auto-fillable node
- **ONE engine, offer-by-offer:** `engines/linkedin-scan.mjs` (drives logged-in Chrome:9333, never
  relaunches).
  - Full sweep: `node engines/linkedin-scan.mjs --all --tpr r604800` (past week; `--tpr r86400` = 24h).
  - Single combo: `node engines/linkedin-scan.mjs --kw "{TITLE}" --loc "{LOCATION}"` (Worldwide via
    `--geo 92000000`).
- **How it works:** ONE tab, serial. It **clicks each card so the detail pane loads the REAL JD**
  (navigating straight to `/jobs/view/{id}` does NOT render the JD) → reads it → runs a **zero-token
  keyword pre-filter** (auto-discards junior/intern, WordPress, .NET/C#, Java, Go/Rust/PHP/
  Salesforce/SAP, W2/US-only/work-auth, 10+ yrs — conservative, ambiguous SURVIVES; a JD that failed
  to load is NOT rejected, it's left unseen for next run) → next card.
- **URL filters:** Easy Apply `f_AL=true`, `f_TPR=r604800|r86400`, `sortBy=DD`, and **work-type `f_WT` from the
  candidate's MODALITY** (`easyapply-filter.json` `workType` — `1`=on-site/presencial · `2`=remote · `3`=hybrid,
  comma list; default `2`). **If presencial/hybrid-only, `locations` = the candidate's current CITY, not the remote
  regions** (derived into `easyapply-filter.json` at session start — see `operating-rules §4`). Override per run:
  `--wt 1` / `--loc "<city>"`.
- **Pagination `&start=0,25,50…`** is safe because of the **global persistent dedup**
  `output/gmail-harvest/linkedin-seen.json` (each jobId processed once, ever; incremental/resumable).
  Stop when a page yields no new ids.
- **Filter DATA:** `config/easyapply-filter.json` — `titles`, `locations`, `positive` (stack the
  candidate HAS), `reject` (patterns they don't do). RESTRICTIVE: an offer survives only if its JD
  loaded AND matched ≥1 `positive` AND hit NO `reject`.
- **Output:** survivors (company, location, JD excerpt) → `output/gmail-harvest/survivors.json` → the
  LLM applies the full §3 gate + a 0–5 score (JD already captured → **no extra WebFetch**).
- **Apply:** `node engines/apply-from-linkedin.mjs "<url>" "<cvPath>"` — clicks Easy Apply, fills
  known fields from `config/apply-fieldmap.json`, attaches the CV, advances to the Submit step and
  **STOPS** (detects already-applied → skips). See §6.
- **Per-offer fill recipe** (for extending the engine / hand-driving edge cases) lives in the
  `chrome-autoapply` skill — Easy Apply is a multi-step wizard: Contact → Resume (pick by JD language,
  or upload a tailored CV) → **Additional Questions (read every question, never answer blind:
  "years of X" → grounded `skill_years`; English C1/C2-mandatory when the candidate is below → answer
  truthfully → it disqualifies → discard, don't lie; eligibility/legal → `ASK_USER`)** → Review →
  **STOP at Submit**.

### 4.2 LinkedIn via Gmail alerts
- The alert inbox is DATA (`profile.yml → job_search.gmail_alerts_account`) — **NOT** the Claude Gmail
  connector account. Mine it via the logged-in CDP browser:
  `node engines/gmail-harvest.mjs [--days N] [--max M] [--u 0]` → extracts + dedups offer URLs
  (LinkedIn/Indeed/GetOnBoard/Computrabajo), unwraps Google redirect wrappers →
  `output/gmail-harvest/offers-{date}.json`. **Never applies.**
- **JD read = the CDP bot, NOT WebFetch (token reduction).** The Gmail-harvested LinkedIn URLs go through
  the SAME engine as the search sweep: `node engines/linkedin-scan.mjs --urls output/gmail-harvest/offers-<date>.json`
  reads each `/jobs/view/{id}` JD in the logged-in :9333 tab, runs the SAME zero-token pre-filter
  (`config/easyapply-filter.json`), dedups against `linkedin-seen.json`, and writes the SAME
  `output/gmail-harvest/survivors.json` (JD excerpt ≤1500 already captured). **The LLM then triages FROM
  that file** (§3 gate + 0–5 score) — **no WebFetch per offer**. Serial, one reused tab, gentle pacing
  (logged-in CDP → no rate-limit; stay serial to avoid detection). Drop already-applied signals ("your
  application was sent to {X}") and merge survivors into the master doc CANAL C. Expect region-locked
  US/Canada + native-mobile skew (low yield → triage hard). *(WebFetch stays only as a fallback if the
  CDP tab is unavailable.)*

### 4.3 GetOnBoard
- **Sourcing (no login) — public REST API, parallelizes:**
  - `https://www.getonbrd.com/api/v0/search/jobs?query=<q>&per_page=30&page=<n>` (`meta.total_pages`
    paginates). Queries: react, frontend, full stack, node, typescript, angular, react native, next.js.
  - Category: `https://www.getonbrd.com/api/v0/categories/programming/jobs?per_page=30&page=<n>`.
  - Company name (id→name): `https://www.getonbrd.com/api/v0/companies/<id>` (cache; ~120ms rate-limit).
  - Do NOT use `&expand=company` (HTTP 500); `/api/v0/jobs/<slug>` returns 401 → don't rely on it.
  - Key `attributes`: `seniority.data.id` (4=Senior, 5=Expert/Lead), `remote`, `remote_modality`
    (`fully_remote` vs `remote_local` = residency-restricted → **verify eligibility**), `countries`,
    `min_salary`/`max_salary` (USD/mo, often null), `published_at` (unix → age). Live apply URL =
    `links.public_url` (a 404 on it = dead → drop). Prelim-filter `seniority>=4 && remote!==false &&
    age<=8d`, then resolve company names for survivors.
- **Logged-in variant (CDP, `/myjobs`):** engine `engines/getonbrd-matches.mjs`. Filters (DATA):
  Programming · Full time · Senior+Semi-senior · salary min floor · remote. **Pagination = "Load more
  jobs" with EARLY STOP** (newest→oldest, no date filter → stop once cards pass the 1-week window;
  >5 load steps = past the week). **Card-pattern pre-filter:** the card shows the location
  (`Remote (Any location)` / `Remote (Chile)` / `(Hybrid)`) → drop region-locked/hybrid **by card
  without a JD read**; only remote-worldwide/LATAM-or-country/blank go to a CDP JD read.
- **Apply = one-click "Postular" = the user's click** (no fields to auto-fill). Login is anti-bot
  (Google AND LinkedIn OAuth resist automation) → stay logged-in, open + hand off. "Ver postulación"
  on a card = already applied → skip.

### 4.4 Himalayas — validate by WebFetch, MAX 2 bots, avoid 429/Cloudflare
- **Sourcing (CDP):** engine `engines/himalayas-matches.mjs`. Paginate `/jobs/matches?page=1..N` (read
  the max from the pagination control), map every match, then **navigate each job and scrape the full
  JD**.
- **Validate each offer with WebFetch, exactly like Gmail** — read the real JD, don't trust the slug.
- **RATE-LIMIT RULE (avoid Himalayas captcha / 429):** **at most 2 bots doing WebFetch to Himalayas at
  once.** Anti-block: **≤2 concurrent, ~2s gap** between requests; the run is **resumable/incremental**
  (save as you go). Exceeding this trips Himalayas' 429 / Cloudflare challenge.
- **Cloudflare on detail pages:** a "Just a moment…" challenge **auto-clears ~4s in the real browser →
  poll until it clears before extracting** (a short fixed wait captures the challenge page instead of
  the JD).
- The public `/jobs/api` is **NOT a workaround** (latest ~20 global only, 0 overlap with personalized
  matches, per-job `.json` blocked).
- **Apply:** Himalayas links out to the company's ATS (Ashby/Greenhouse/Workable-style) → often
  auto-fillable → fill to Submit and STOP (§6).

### 4.5 Computrabajo (Colombia / LATAM) — low-yield supplement, WebFetch source
- **Sourcing (anonymous WebFetch, parallelizes):** query is in the URL PATH, not params.
  - Keyword: `https://co.computrabajo.com/empleos-de-{keyword}` (e.g. `/empleos-de-react`).
  - Keyword+place: `https://co.computrabajo.com/trabajo-de-{keyword}-en-{place}` (…`-en-medellin`,
    …`-en-teletrabajo` for remote).
  - **PITFALL:** bare `/trabajo-de-desarrollo` matches Spanish "desarrollo" (business/HR), NOT
    software → always use a software keyword (`desarrollador-de-software`, `react`, `frontend`,
    `full-stack`, `node`, `typescript`, `react-native`…).
  - Read per-card "publicado hace Xh/Xd" age + the Remoto/Híbrido badge from the search HTML (filter
    hrefs aren't exposed to WebFetch — do precise date/remote filtering via CDP at apply time). Salary,
    when shown, is COP/month.
- **Triage is the HARSH filter:** comp floor in COP (convert; most CO dev posts are below floor →
  reject; blank ≠ below floor, confirm early), on-site only if it's the candidate's city, board skews
  .NET/Java/Python/SAP.
- **Apply = internal one-click "Aplicar"/"Postularme" = the user's click** (logged-in, stays
  on-platform). Some postings add a "preguntas de filtro" questionnaire → those are screening
  questions → `ASK_USER`. Open + hand off.

### 4.6 Indeed — discovery only, open-and-hand-off (NO auto-fill)
- **Aggressively anti-bot.** Page 1 of a search IS anonymously readable via WebFetch; **pagination
  (`start>=10`) hits a sign-in wall**; headless/CDP trips CAPTCHA + Cloudflare → **do NOT drive Indeed
  over CDP.**
- **Source page-1 only (WebFetch), get breadth by rotating `q=` and `l=`, not by paginating:**
  `https://co.indeed.com/jobs?q=<q>&l=Remote&fromage=7&sort=date` (and `www.indeed.com` for
  global/remote). Avoid `sc=0kf:attr(...)` facets (over-restrict → 0 results). Card links carry
  `jk=`; rebuild the clean URL `https://co.indeed.com/viewjob?jk=<jk>`; WebFetch it for survivors.
- **Apply:** none are auto-fillable (Indeed Apply is login/captcha-gated; external-ATS redirects are
  anti-bot gated). **Best move: re-route the role** — if the same posting exists on LinkedIn (Easy
  Apply) or its ATS is anonymous (Ashby/Greenhouse/Workable), apply THERE. Otherwise `Start-Process`
  the viewjob URL for the user to apply manually. Indeed feeds the auto-fill nodes; it doesn't fill.

### 4.7 Vetting-gated marketplaces — tecla · vanhack · xpertdirect (open-and-hand-off, 0% auto-fill)
Common shape: managed talent marketplaces where the candidate is **selected into a shortlist** via
AI-match + human recruiter screens; apply is a single **profile-backed action**, not a fillable form.
Consequences (identical for all three):
- **Auto-fill = NONE.** No per-role ATS fields. The engine's "fill to Submit" doesn't apply.
- **Apply = one profile-based click = the user's click** (hard rule 6). Open + hand off.
- **A one-time profile/setup is a hard prerequisite** — surface it once; the node yields nothing until
  done.
- **Sourcing is login-gated (no anonymous API) → CDP-serialized, lower priority** (behind the
  auto-fillable channels). GARY's contribution is finding/triaging matches only.

Board-specifics:
- **Tecla** (`app.tecla.io`, LATAM→US, USD): JS-SPA, no anonymous API. **4-stage vetting** (AI screen →
  technical assessment → recruiter interview (tests English) → reference checks). Triage
  remote-worldwide (don't geo-limit by company country; reject only region-LOCKED-excl-candidate).
  One-time: a completed candidate profile drives AI matches.
- **VanHack** (`vanhack.com`, relocation/visa-first): AI recruiter "Vanna" + recruiter validation. **Hard
  pre-apply gate: the candidate must record 3 verification videos** (English/identity) before applying
  to ANY job — unavoidable, the user's. Relocation roles are eligible **only if the posting sponsors a
  visa** (confirm per-posting; flag explicitly — it means leaving the country). Remote-only roles use
  the normal eligibility rule.
- **XpertDirect** (`xpertdirect.io`, no-CV "Profile Card"): Cognito-Bearer, no anonymous API. Surfaces
  (logged-in CDP): `/xpert/opportunities`, `/xpert/matches`, `/xpert/invites`, Boolean `/xpert/search`
  (`POST booleansearch/projx`). **Apply = one-click "Pitch"** (`POST xpert/pitch`) off the Profile
  Card — no fields, no CV upload. **A "pitched" offer = already applied → skip.** Company identity is
  hidden pre-Pitch → dedup on visible signal (title/skills/country), reconcile once identity surfaces.

### 4.8 A NEW board
Run `website-analyzer` (engine `engines/inspect-session-site.mjs`) to classify access + apply
mechanism, then add a `source-<site>` skill following the same shape (source → gate → merge). Do NOT
invent an apply path.

---

## 5. Browser / CDP automation

- **ONE dedicated debug Chrome for ALL automation** (sourcing AND filling). Port/profile are DATA in
  `profile.yml → job_search.automation_browser` (default **:9333**, isolated profile
  `%USERPROFILE%\chrome-automation-profile`). Launch: `engines/start-chrome-debug.cmd` (taskkills
  chrome, relaunches the dedicated profile with `--remote-debugging-port=9333 --remote-allow-origins=*`;
  logins persist in the isolated profile). **Browser is user-selectable in GARY Ajustes** (Chrome is
  the default/tested; Edge/Brave/Chromium allowed on the shown port) — never hardcode.
- **Never touch the user's personal browser** — read nothing, kill nothing. (career-ops' old Brave:9222
  path is dead in GARY: everything is the one debug Chrome.)
- **Engine = the `agent-browser` CLI:** connect with the FULL URL `--cdp http://127.0.0.1:9333`
  (a bare `--cdp 9333` HANGS; **never `--auto-connect`** — it could grab the personal browser). Loop:
  `open` → `snapshot -i` (`@eN` refs) → `click/fill/select/upload @eN` → **re-`snapshot -i`** (refs go
  stale after navigation). **NEVER run `agent-browser close`/`close --all`** (kills the shared session —
  to move on, just `open` the next URL). LinkedIn never idles → never wait `networkidle`; use
  `wait --load domcontentloaded` or snapshot directly. If the CLI daemon hangs (`Invalid response:
  EOF`), kill ONLY it (`Get-Process *agent-browser* | Stop-Process -Force`), wait 3s, retry — never
  kill Chrome.
- **Lifecycle = main session / user only.** Worker agents NEVER close/relaunch the browser. If CDP is
  down mid-run, retry the connect 2–3×; still down → **STOP and report** (a not-logged-in site fails
  its sweep → prompt the user to sign in, never fall back to the personal browser). **CDP HTTP up ≠ ws
  up:** after a relaunch, **poll** `curl http://127.0.0.1:9333/json/version` for
  `webSocketDebuggerUrl` (retry ~2s × up to 20) before running a script — don't fixed-sleep.
- **OAuth reality:** anonymous ATS (Ashby/Greenhouse/Workable) auto-fill well; Google OAuth is
  generally blocked in the automation browser (use email+password), LinkedIn per-site; GetOnBoard
  accepts LinkedIn/GitHub OAuth (not Google). Human steps stay: captcha + emailed code + final Submit.

---

## 6. Applying — fill to Submit, never send

- **Apply by deterministic script, not LLM agents** (an LLM doing a known fill burns tokens):
  - Single offer: `node engines/apply-from-linkedin.mjs "<url>" "<cvPath>" [--resume]` — Easy Apply +
    external ATS; fills known fields from `config/apply-fieldmap.json`, attaches the CV, advances to the
    Submit step and **STOPS**; detects already-applied → skips. `--resume` continues the **same open
    modal** after a screening answer (don't restart).
  - Batch: `node engines/easyapply-batch.mjs [N]` — fills known fields, walks to Submit, **skips
    (doesn't stop) on unknowns**, records them to `output/apply-pending-fields.json`.
  - OAuth/profile boards: `node engines/apply-assist.mjs "<url>" [google|linkedin] [account]` — opens,
    fills, STOPS before Submit.
  - Field engine: `engines/apply-fields.mjs` (`answerFor`, `fillForm`, `recordUnknowns`, `learn`).
    Precedence: a specific skill-question beats generic "years of experience"; a numeric field naming
    ≥2 databases SUMs their YOE. **Runs with CWD = repo root** (an absolute path once corrupted runs).
- **NEVER click Submit; NEVER solve a captcha.** The harness auto-mode policy blocks autonomous
  outbound submission (per-recipient human authorization) — so even with a standing wish to
  auto-submit, the **final Submit stays a human click**. Fill everything, leave each offer open at the
  Submit step. Don't re-promise auto-submit; explain the gate.
  > ⚠️ The legacy `chrome-autoapply` skill has a stray "Click Submit button" line — it is **wrong for
  > GARY** and overridden here and by `operating-rules.md §6`. Fill-to-Submit-and-STOP is authoritative.
- **CV tailoring:** `node engines/cv-builder.mjs --variant {fullstack|frontend|backend} --company
  "{Name}" --format a4` → `docs/roles/{variant}/`. Truthful, ATS-clean, traces to a mapped role + the
  base CV (never invented).
- **CV cleanup (MANDATORY):** per-offer CVs are throwaway. **After the CV is created for an ATS AND the
  application is confirmed submitted (any site) — DELETE the generated per-offer document** from BOTH
  `docs/roles/{variant}/` and `output/`. Keep only base/role templates. `cv-builder.mjs` regenerates on
  demand — nothing is lost.

---

## 7. The learning loop — ask-on-untracked → continue (never abort)

When a form presents a field / screening question **not in `config/apply-fieldmap.json`**:
1. Do **NOT** guess. If it's eligibility / legal / personal, **always** ask.
2. **ASK the user** in the terminal (surface the exact question + the offer).
3. **`learn(matchTerms, value, source)`** → writes the answer into `config/apply-fieldmap.json`
   (`learned[]`) **and mirrors it into the NotebookLM RAG** so the context converges and it's never
   re-asked.
4. **`--resume`** the same application and **CONTINUE** — do not abort the postulation.

`config/apply-fieldmap.json` policies: `FILL` (auto-fill), `FLAG` (auto-fill but flag for review, e.g.
education → closest honest option, never upgrade a degree), `ASK_USER` (screening/legal/eligibility OR
not grounded in the CV/RAG → STOP, never invent). The map converges per user; GARY ships it as a
`{{PLACEHOLDER}}` template (no real data). **Never fabricate** — a gap skill is `0`/honest-No, never a
positive number.

---

## 8. Cross-session state & the one canonical map

- **`data/offers-master.md`** — THE single scored map. Every sweep from every channel MERGES its
  survivors here (never scatter into dated/per-channel docs or leave results only in `survivors.json`).
  Per-channel summary table + sections (A=LinkedIn EasyApply, B=Manual, C=LinkedIn-via-Gmail,
  D=Himalayas, …), dedup by company, 0–5 score, status boxes `[ ]` pending · `[x]` applied/closed/skip
  · `[~]` flag (**mark on apply**). Region-locked lines deleted entirely; closed/skip stay `[x]` with a
  reason.
- **`data/orchestrator-state.md`** — durable run state (standing goal, two-way-fit gate, guardrails,
  tooling, the "Round runbook", learned rules with absolute dates, progress log). Read at session
  start; update after every triage/evaluate/apply. New learnings go into skills + the RAG + DATA —
  never only in chat.
- **Company dedup** is checked against `data/offers-master.md` (+ state). (career-ops used a separate
  `data/applications.md` TSV tracker; GARY folds that role into the master doc — see the gap note in
  the accompanying summary if a `data/applications.md` reference appears in a legacy skill.)

---

## 9. Quick reference — engines in `engines/`

| Engine | Purpose |
|---|---|
| `start-chrome-debug.cmd` | launch the debug Chrome (:9333, isolated profile) |
| `linkedin-scan.mjs` | the ONE EasyApply sourcer (offer-by-offer, dedup, survivors.json) |
| `gmail-harvest.mjs` | mine the job-alert inbox over CDP → offer URLs |
| `getonbrd-matches.mjs` | GetOnBoard `/myjobs` sourcer (early-stop + card pre-filter) |
| `himalayas-matches.mjs` | Himalayas `/jobs/matches` sourcer (≤2 concurrent, Cloudflare poll) |
| `scan-boards.mjs` / `scrape-matches.mjs` | free-board / logged-in board scrapers |
| `apply-from-linkedin.mjs` | single-offer fill → Submit (Easy Apply + external ATS) |
| `easyapply-batch.mjs` | batch fill → Submit (skip-on-unknown) |
| `apply-assist.mjs` | OAuth/profile-board apply hand-off |
| `apply-fields.mjs` | field engine (`answerFor`/`fillForm`/`learn`) |
| `cv-builder.mjs` | per-offer tailored CV (variant × company) |
| `inspect-session-site.mjs` | classify a new board (website-analyzer) |
| `learn-forms.mjs` / `read-fields.mjs` / `jd.mjs` / `linkedin-enrich.mjs` | form-map + JD helpers |
| `check-liveness.mjs` (+ `liveness-browser.mjs`, `liveness-core.mjs`) | zero-token closed/expired verifier (Playwright; rule-9 authoritative check) |
| `scan.mjs` + `providers/*.mjs` | zero-token free-board scan (Ashby/Greenhouse/Lever/Workable/Remotive/RemoteOK/Jobicy/TheMuse/…) → `data/pipeline.md` |
| `merge-tracker.mjs` · `verify-pipeline.mjs` · `normalize-statuses.mjs` · `dedup-tracker.mjs` · `analyze-patterns.mjs` | tracker pipeline over `data/applications.md` (add rows only via merge; states in `templates/states.yml`) |
| `cv-builder.mjs` (HTML) · `build-cv-latex.mjs` + `generate-latex.mjs` (LaTeX) | CV generation paths |

**Slash-command orchestrators** (optional, in `.claude/commands/`): `/job-network` (route by website),
`/job-hunt` (staged batch, ≤3 concurrent), `/job-pipeline` (streaming parallel, ≤3 in flight). GARY can
also just drive the `job-orchestrator` agent directly.

All ported from the career-ops prototype and cleaned to candidate-agnostic, GARY-relative paths.
