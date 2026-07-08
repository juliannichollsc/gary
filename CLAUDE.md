# CLAUDE.md — GARY 🐾 (start here)

> **Claude-specific entry.** GARY is **model/CLI-agnostic**; the canonical cross-agent copy is
> [`AGENTS.md`](AGENTS.md) (loaded by Gemini CLI / opencode / Codex / any non-Claude terminal LM). The two
> are kept **identical in substance** — if you change a rule here (esp. the MANDATORY Conventions), mirror
> it in `AGENTS.md`, and vice-versa. Any LM agent that clones this repo MUST apply these rules.
>
> Instructions for the Claude Code session that **builds** GARY. **Read this first**, then
> `memory/VISION.md` (north star), `docs/design-system.md` + `docs/components.md` (the UI contract),
> `docs/README.md` (the candidate-agnostic **job-search context & data map** — where every file/board's
> data lives), `docs/operating-rules.md` (the user-agnostic methodology), `docs/career-ops-map.md` (the
> per-board runbook) and `.claude/skills/`.
> This is a **spec-driven, staged build** — the specs live in `docs/specs/`. Owner: **Julián Nicholls
> (@jnichollsc)**. License: Apache-2.0.

## What GARY is
An **open-source desktop copilot for job hunting** (Tauri + Rust) for **anyone** — technical or not —
who wants to search & apply to jobs with far less manual work. It looks like a chat, but the chat **is
an embedded terminal** running the user's chosen **terminal LM CLI** (Claude or similar). That CLI loads
GARY's `.claude/skills` + `.claude/agents` + `docs/operating-rules.md` and drives the whole hunt:
source offers across boards, validate fit by reading the real JD, tailor a CV per role, and prepare
applications — **stopping before Submit** (the final click + captcha stay the user's). All the proven
work from the prototype `proyecto26/career-ops` (boards, blocks, auto-apply-to-Submit) is absorbed as
skills + engines + operating-rules.

## Runtime architecture — the LLM is a SUPERVISOR, not a chatbot
This is the core product decision. **GARY never calls an LLM API directly.** The deterministic bots do
the token-free heavy lifting; the terminal LM is spawned in a PTY and acts as a **supervisor** that only
engages for the three *judgment* cases:
1. **Unexpected errors** during an engine run (recover / adapt / report).
2. **Dynamic unknown questions** on an offer (each ATS may add new ones → ask-on-unmapped → persist the
   answer to the NotebookLM RAG so it's never re-asked).
3. **ATS-tailored CV** generation (truthful per-role tailoring).

Token cost is minimal **by design**: paginating, scraping, dedup, and form-fill are deterministic
`engines/*.mjs`; the LM is invoked only where human-like judgment is required.

```
[React UI: sidebar + views]         [xterm chat = the terminal]
        │ Tauri invoke                        │ pty://data ▲ / write_stdin ▼
        ▼                                      ▼
[Rust core (src-tauri)]  ── spawn PTY ─▶ [terminal LM CLI: claude / gemini / opencode]  ◀ THE SUPERVISOR
   · PTY bridge (spawn_cli/write_stdin/resize_pty)      │ loads .claude/skills + .claude/agents + operating-rules
   · engine orchestrator ─▶ [Chrome debug :9333 (CDP)] ─▶ engines/*.mjs (the bots)
   · OS keychain + settings (GARY_CLI, provider key)
```
- **Model/CLI-agnostic.** Backend chosen in Settings/`.env` (`GARY_CLI`). Auth = the CLI's own login or an
  API key stored in the OS keychain and injected into the spawned PTY env. **We support only terminal LMs
  (Claude & similar); no proprietary chat backend.**
- **Local-first, human-in-the-loop on Submit.** Never click Submit, never solve a captcha.
- **Candidate context = NotebookLM RAG** (via `notebooklm-ai-plugin` skill), built from the CV + Q&A. No
  static per-user hardcoding.

## Construction (BUILD-ONLY) — how we use the marketplace agents
To build GARY we borrow expert agents from the sibling marketplace `../agents` (`wshobson/agents`). They
are **construction scaffolding and must NOT ship**. They live in **`build-agents/`** (gitignored) —
deliberately **outside `.claude/agents/`** so the runtime CLI never loads them into an end user's context.

- **Use them** while building: read the relevant file in `build-agents/` and spawn an `Agent` in that role
  (e.g. `rust-pro` for the PTY core, `frontend-developer`+`ui-ux-designer`+`design-system-architect` for the
  UI, `accessibility-expert` for WCAG, `ai-engineer`+`prompt-engineer` for the supervisor integration Julián
  authorized, `test-automator` to verify the local build).
- **The product ships only the expert job agents** in `.claude/agents/` (`job-orchestrator`, `job-triage`,
  `job-evaluator`, `job-apply-prep`) + `.claude/skills/`. See `build-agents/README.md`.

### Release checklist (before publishing / tagging)
- [ ] `rm -rf build-agents/` (build scaffolding — never shipped; already gitignored).
- [ ] Confirm `.claude/agents/` contains **only** the 4 job agents (no marketplace agents leaked in).
- [ ] No secrets committed (`.env`, `*auth*.json`, `*.key`); keys live in the OS keychain.
- [ ] `docs/specs/` acceptance criteria met for each shipped stage.

## Spec-driven, staged build
Every stage has a spec in **`docs/specs/`** with objective, components, acceptance criteria, and how to
verify locally. Build in order; don't start a stage until the previous one runs.

| Stage | Spec | Deliverable |
|-------|------|-------------|
| 0 | `docs/specs/00-overview.md` | Wiring: build-agents isolated, this CLAUDE.md, specs. **(done)** |
| 1 | `docs/specs/01-foundation-shell.md` | Tokens (dark/light) + React app shell (sidebar+router+theme) + **Chat view with embedded xterm**. Installable & runnable locally. |
| 2 | `docs/specs/02-settings.md` | Settings: CLI/model picker, API key → keychain, browser start/stop. |
| 3 | `docs/specs/03-onboarding.md` | Onboarding: CV upload → NotebookLM ingest → role map. |
| 4 | `docs/specs/04-offers-map.md` | Offers map: render `data/offers-master.md`, filters, score meter, status. |
| 5 | `docs/specs/05-apply-modal.md` | Apply/review modal with the persistent "GARY no envía" guard. |
| 6 | `docs/specs/06-states-motion.md` | Global states (empty/loading/error/offline/toast) + GSAP motion. |
| 7 | `docs/specs/07-engine-wiring.md` | Wire browser/bots: start Chrome debug, drive `engines/*.mjs` over CDP. |

## Architecture (files)
- **Shell:** Tauri (Rust). PTY bridge in `src-tauri/src/main.rs` (`spawn_cli`, `write_stdin`, `resize_pty`).
- **UI:** React in `src/` (entry `src/main.tsx`, styles `src/styles/`, `index.html`, `vite.config.ts`).
- **Brain (runtime):** `.claude/agents/` (4 job agents) + `.claude/skills/` (engine + board skills + GSAP/UI
  suite + NotebookLM).
- **Engines (the bots):** `engines/*.mjs` — Playwright/CDP scrapers, apply-to-Submit filler, CV builder.
- **Automation browser:** dedicated debug Chrome on port 9333 (`engines/start-chrome-debug.cmd`).
- **Design source of truth:** `pencil/gary.pen` (open in the Pencil editor) + `docs/design-system.md` +
  `docs/components.md`. `pencil/PROMPTS.md` holds the resolved art direction per screen.

## Prerequisites to run
1. **Node** ≥ 18 + **pnpm** ≥ 9 (`corepack enable pnpm`). **Rust** ≥ 1.96. **Use pnpm — NOT npm/yarn.**
2. **Windows:** Tauri needs **MSVC C++ Build Tools** ("Desktop development with C++"). **WebView2** runtime.

## How to run (local)
```
pnpm install
pnpm tauri dev        # opens the GARY window; the Chat view spawns GARY_CLI in the PTY
```
The CLI must start with **CWD = project root** so it loads `.claude/`. Default `GARY_CLI=gemini` (`.env`).

## Skills the runtime CLI loads (do not duplicate logic in code)
Board sources (`source-*`, `*-offers`), the apply engine (`chrome-autoapply`, `easyapply-autofill`), the
core (`gary-job-search`), `notebooklm-ai-plugin` (RAG), `agent-browser`, plus the UI/GSAP suite used at
build time. Field answers/rules are persisted to the RAG, never hardcoded.

## Known issues to fix during the build
- **Engine paths (done):** engine invocation paths were normalized to `engines/<engine>.mjs`; run
  engines with **CWD = project root**. Genuine runtime caches stay under `output/` (gitignored):
  `output/gmail-harvest/*`, `output/apply-pending-fields.json`, `output/easyapply-seen.json`, per-company
  CVs.
- **Candidate-agnostic (done):** all runtime job-search context (`.claude/skills/*`, `.claude/agents/*`,
  `.claude/commands/*`, `docs/*`, `data/*`, `config/*`, `engines/*.mjs`, `cv-data.md`) is scrubbed of PII
  and carries `{{PLACEHOLDER}}` tokens; candidate facts come from `config/profile.yml` + the NotebookLM
  RAG. See `docs/README.md` for the data-seating map.
- **Prune ported extras** in `engines/` if any prototype-only utilities remain unused.
- **NotebookLM skill:** confirm `.claude/skills/notebooklm-ai-plugin/SKILL.md` exists so the CLI loads it.
- **Pencil:** `.pen` files in `pencil/`; native MCP registered in `.mcp.json` (live only when the editor is
  open). Auth: `pencil login`.

## Conventions
- **MANDATORY — never seat the user's profile/PII into local code.** Do NOT write real candidate data
  (name, email, phone, location, comp, English level, YOE, visa, EEO, …) into any shipped/local file:
  `config/profile.yml`, `config/easyapply-filter.json`, `config/apply-fieldmap.json`, `cv-data.md`,
  `.claude/*`, `docs/*`, `data/*`, `engines/*`. These MUST stay `{{PLACEHOLDER}}` templates and remain
  candidate-agnostic. **All candidate context lives ONLY in the NotebookLM RAG** — the CV, the onboarding
  typical-question answers (location/modality/comp preference/dedup preference/region eligibility/English/EEO),
  the **role-family/hard-skills/soft-skills map built at session start**, and screening Q&A. **Locally, ONLY
  two files persist as HUNT stores: `data/offers-master.md` (offers map) + `data/metrics.md` (metrics)** — both
  candidate-agnostic, saved when a mapping finishes or the user finalizes. `data/cv/base/gary-context.md` is
  **created ONCE at CV ingestion and PERSISTS** (the structured role/skill map that gives context to the RAG +
  feeds the UI) — NOT disposable, NOT regenerated per session (token waste); per session just VALIDATE it's
  aligned with NotebookLM → create if missing, update if the CV changed or it drifted, else leave it. To
  "onboard"/"seat" a candidate,
  store facts in NotebookLM — never by editing the templates. When triage/gate needs candidate DATA, pull it
  from the RAG (or the derived cache), never hardcode it locally.
- **MANDATORY — persist the offers map after every connection.** As soon as a source node / channel
  (Gmail, LinkedIn, GetOnBoard, Himalayas, Computrabajo, …) finishes its sweep + two-way-fit triage,
  MERGE its survivors into `data/offers-master.md` and UPDATE its metrics (the "Summary by channel"
  table + Applied/Actionable totals) before moving on. Never leave results only in an agent reply,
  `survivors.json`, or a dated per-channel file. **The agnostic gates are region-lock + language + role/skill
  fit; COMP and COMPANY-dedup follow the candidate's PREFERENCE (DATA in NotebookLM / `gary-context.md`) — read
  them, don't hardcode** (common case: comp informational/never filters, dedup only by exact offer not company).
  Score 0–5, mark status boxes. The offers map + its metrics are the canonical cross-session record — keep
  them current per connection.
- **MANDATORY — the ATS method (`node engines/scan.mjs`) is TITLE-ONLY, NO WebFetch/JD (owner order).** Unlike
  every other channel, the ATS multi-provider scan **never reads the JD** — it is a **0-token** subsystem.
  `portals.yml → title_filter` (derived per-candidate from the ATS session clone) IS the triage → ATS rows carry
  **no 0–5 score** (`s/JD`), only **title + URL + location**. The ONLY gate applied is **region-lock §1,
  DETERMINISTIC over the `location` column the scan already returns** (keep remote-worldwide / LATAM-incl-country /
  Americas / bare-remote; drop US/EU/NA-only + foreign on-site) — compared **against the agnostic temp clone
  `output/ats-session/context-<date>.md`**, NEVER by querying NotebookLM or reading JDs. Survivors MERGE into
  `data/offers-master.md → ## CANAL ATS` (title+URL+location, `filt:` date, tag `_(ATS: solo título, sin WebFetch)_`);
  the user reads each JD on open. Metrics MANDATORY with **`tokens=0`** (all deterministic), counted in the `ATS`
  column. Fully candidate-agnostic. Full rule: `docs/operating-rules.md §4`.
- **MANDATORY — generate runtime docs FROM `*.example` templates; never hand-edit the templates.** The
  committed source-of-truth for each generated context doc is its `.example` sibling (candidate-agnostic,
  PII-free). `data/cv/base/gary-context.md` ← `…/gary-context.md.example` is **created ONCE at CV ingestion**
  (the **role-family / hard-skills / soft-skills map** used to score offers). **Per session the LM agent does
  NOT regenerate it — it VALIDATES alignment with the NotebookLM RAG → create if missing/empty/"Pendiente",
  update if the CV changed or it drifted, else leave it** (avoid token waste). This file
  also FEEDS the onboarding "Mapa de roles" UI via Rust `read_role_map`, so keep the parseable format —
  roles as a `Familia`/`Stack…` table or `- **Label**: stack` bullets, soft skills as `- **Label:** …`
  bullets; see `operating-rules.md §4`);
  `config/easyapply-filter.json` ← `…/easyapply-filter.json.example` (the scanner's roles+skills config —
  **same "if it exists use it, else create it" mandate**: derive `titles`/`positive`/`reject` from the
  `gary-context.md` role map; regenerate if missing/empty/`{{PLACEHOLDER}}`);
  `data/offers-master.md` ← `…/offers-master.md.example`; `data/orchestrator-state.md` ←
  `…/orchestrator-state.md.example`; `data/metrics.md` ← `…/metrics.md.example` (these three instantiate
  only when absent, else keep appending — never overwrite history). **Metrics are mandatory at the END of
  EVERY job-search session** — on both triggers: the user asking to finalizar/terminar/parar AND the hunt
  completing on its own. Append the hunt row(s) to `data/metrics.md` with ACTUAL totals (+ EXPECTED for any
  unfinished part on a stop); no search session closes without its metric row. **The `tokens` field counts
  ONLY job-search LLM tokens (source/triage/evaluate/apply) — NEVER tokens spent on project changes/
  improvements (editing docs/code/specs, maintenance chats); deterministic engines = 0.** Stamp each
  generated file: `> Generated by the LM agent at session start from
  NotebookLM (based on {file}.example) — {absolute date}.` Real candidate data lives ONLY in the generated
  `gary-context.md` (base-CV user-local area), never in an `.example`. See `docs/operating-rules.md §4`.
- **Agents/skills WE author → `metadata.author: Julián Nicholls (@jnichollsc)`** in frontmatter. Installed
  third-party skills keep their own authorship.
- **Runtime agents are user-agnostic** — never name the candidate; pull candidate facts from the NotebookLM RAG.
- **Never** hardcode a person into code. **Never** click Submit / solve a captcha. Fill to Submit and stop.
- Secrets are gitignored and stored in the OS keychain — never commit.
- **Marketplace/construction agents never ship** — they stay in `build-agents/` and are deleted at release.
