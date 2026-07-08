# GARY — job-search context & data map (start here after cloning)

> **Who this is for.** Anyone who clones GARY and wants the terminal LM to run the full
> **find → validate → tailor → apply-to-Submit** flow across job boards. GARY is **candidate-agnostic**:
> nothing here names a person. Every candidate fact is DATA you provide once (or that the NotebookLM RAG
> holds); the *methodology* travels with the repo. Clone it for a different person → swap the DATA, the
> engines/skills/agents are unchanged.

## The three rules that never change
1. **Never click Submit, never solve a captcha.** The bots fill an application to the Submit step and
   STOP — the final click + any captcha are the user's.
2. **Never fabricate.** Any claim (skill, years, credential) must be grounded in the candidate's CV /
   NotebookLM RAG. A skill the candidate lacks = 0 / honest "No". Unknown / legal / eligibility → ASK
   the user, then persist the answer.
3. **Candidate context is a NotebookLM RAG, not a hardcoded file.** Built from the CV + the questions
   answered over time (ask-on-untracked → learn → never re-ask). The files below are derived caches; the
   RAG wins.

## Where everything lives (the data-seating map)

**Methodology (candidate-agnostic — read, don't edit per user):**
| File | What it is |
|---|---|
| `docs/operating-rules.md` | The full operating methodology: two-way-fit gate, sourcing, browser/CDP rules, fill-to-Submit, ask-on-untracked, cross-session memory. |
| `docs/career-ops-map.md` | The **per-board runbook**: exact steps/URLs/APIs, apply mechanisms, the Himalayas ≤2-bot/429 rule, the career-ops→GARY translation table. |
| `data/linkedin-playbook.md` | Canonical LinkedIn EasyApply methodology (the one engine, offer-by-offer, dedup, scoring). |
| `data/easyapply-questions.md` | Recurring screening-field preflight (AUTO vs ASK_USER classes). |
| `.claude/skills/` | Per-board skills + the apply engine skills (see the per-website index below). |
| `.claude/agents/` | The 4 job agents: `job-orchestrator`, `job-triage`, `job-evaluator`, `job-apply-prep`. |
| `.claude/commands/` | Optional orchestrators: `/job-network` (by website), `/job-hunt` (staged ≤3), `/job-pipeline` (streaming ≤3). |
| `engines/` | The deterministic bots (Playwright/CDP scrapers, apply-to-Submit filler, CV builder, tracker pipeline, liveness). Run with **CWD = repo root**. |

**Candidate DATA (you fill these once — ships as `{{PLACEHOLDER}}` templates, NO real PII):**
| File | What it holds | Source |
|---|---|---|
| `config/profile.yml` | Identity, target roles, comp floor + currency, location/visa, language + English level, EEO self-ID, the **automation browser** (type/port/profile), the **mapped sites** to log into, cooldowns. | onboarding, from the base CV |
| `config/easyapply-filter.json` | The LinkedIn scanner filter: `titles`, `locations`, `positive` stack signals, `reject` patterns. | derived from `target_roles` |
| `config/apply-fieldmap.json` | The machine answer map: `fields` (match→value + policy FILL/FLAG/ASK_USER), `skill_years` (0 for gaps), growing `learned[]`. | grows via ask-on-untracked |
| `cv-data.md` | Human-readable master profile cache (the RAG is the real source of truth). | derived from the base CV |

**Runtime state (candidate-agnostic scaffolding; fills as you run):**
| File | Role |
|---|---|
| `data/offers-master.md` | **THE single canonical scored map** — every channel merges survivors here (dedup by company, 0–5 score, `[ ]`/`[x]`/`[~]`). |
| `data/orchestrator-state.md` | Cross-session run state (goal, learned rules, progress log). Read at session start, update after each action. |
| `data/applications.md` | Flat applications tracker (the pipeline engines read/write it; add rows only via `engines/merge-tracker.mjs`). |
| `data/pipeline.md` | Pending-offers inbox (board scans append here). |
| `output/` | **Gitignored runtime caches** (`gmail-harvest/linkedin-seen.json`, `survivors.json`, per-company CVs, `apply-pending-fields.json`). Never commit. |
| **NotebookLM notebook** | The candidate RAG — the real source of truth for every candidate fact. Queried via the `notebooklm-ai-plugin` skill. |

## Per-website index

| Board | Skill(s) | Engine | Access | Apply mechanism | Concurrency |
|---|---|---|---|---|---|
| LinkedIn EasyApply | `source-linkedin` · `chrome-autoapply` · `easyapply-autofill` | `linkedin-scan.mjs` → `apply-from-linkedin.mjs` | logged-in CDP | Easy Apply / external ATS → **auto-fill to Submit** | CDP **serial** |
| LinkedIn via Gmail | `source-gmail` | `gmail-harvest.mjs` | logged-in CDP + WebFetch | routes to LinkedIn/ATS | WebFetch **parallel** |
| GetOnBoard | `source-getonbrd` · `getonbrd-offers` | `getonbrd-matches.mjs` | public API + logged-in CDP | one-click "Postular" (user's click) | API parallel / apply serial |
| Himalayas | `source-himalayas` | `himalayas-matches.mjs` | logged-in CDP + WebFetch | external ATS → auto-fill to Submit | **≤2 WebFetch**, Cloudflare poll |
| Computrabajo | `computrabajo-offers` | — (WebFetch) | anonymous WebFetch | internal one-click "Aplicar" (user's click) | WebFetch parallel / apply serial |
| Indeed | `indeed-offers` | — (WebFetch) | anonymous WebFetch (page-1) | open-and-hand-off / re-route | WebFetch parallel |
| Tecla / VanHack / XpertDirect | `tecla-offers` · `vanhack-offers` · `xpertdirect-offers` | — | login-gated CDP | one-click profile apply / "Pitch" (user's click), vetting gate | CDP serial |
| A new board | `website-analyzer` | `inspect-session-site.mjs` | scout | classify, then add a `source-<site>` skill | — |

Every board skill documents four dimensions: **blocks/anti-bot · automation · pagination · WebFetch
filtering**. General free-board discovery: `engines/scan.mjs` + `engines/providers/*` → `data/pipeline.md`.

## The flow (what the terminal LM runs)
1. **Session start:** ASK which channel(s) + method (background orchestrator vs direct). Never auto-run.
2. **Source** the chosen board(s) — paginate fully, read each real JD (never the title/card alone).
3. **Triage** with the two-way-fit gate (`job-triage`) → survivors.
4. **Evaluate** (A–G) + tailor the CV per role (`job-evaluator` + `cv-builder.mjs`) → 0–5 score.
5. **Apply-prep** (`job-apply-prep` + `apply-from-linkedin.mjs`) — fill to Submit and STOP; on an
   untracked field, ASK → `learn()` into `apply-fieldmap.json` + the RAG → `--resume`.
6. **Merge** every survivor into `data/offers-master.md`; update `data/orchestrator-state.md`.

## Clone / onboarding checklist (do this once per user)
1. **Provide the base CV** → ingest into a **NotebookLM notebook** (the RAG) via `notebooklm-ai-plugin`;
   derive `cv-data.md` + the role map.
2. **Fill `config/profile.yml`** placeholders (identity, comp floor + currency, location/visa, English
   level, EEO self-ID, the automation-browser port/profile, the mapped sites).
3. **Derive `config/easyapply-filter.json`** from the role map (titles / locations / positive / reject).
4. **Leave `config/apply-fieldmap.json`** as the template — it fills itself via ask-on-untracked.
5. **Launch the automation browser** (`engines/start-chrome-debug.cmd`, default port 9333, isolated
   profile) and **sign in once** to each mapped site (Gmail-alerts, LinkedIn, Indeed, GetOnBoard,
   Himalayas, Computrabajo, …). Sessions persist; a not-logged-in site fails its sweep. **Never use the
   personal browser.**
6. **Reset caches** for a fresh candidate: `output/gmail-harvest/linkedin-seen.json`,
   `data/applications.md`, `data/offers-master.md`, `data/pipeline.md`.

## Related docs
`docs/operating-rules.md` (methodology) · `docs/career-ops-map.md` (per-board runbook) ·
`memory/VISION.md` (product north star) · `CLAUDE.md` (build/runtime architecture).
