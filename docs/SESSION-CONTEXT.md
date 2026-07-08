# GARY 🐾 — Session context & continuation notes

> Handoff doc so any next session can continue without re-deriving decisions. Read with `../CLAUDE.md`
> (build guide), `VISION.md` (north star), and `specs/` (staged specs). Last updated: 2026-07-04.

## ▶ START HERE — latest session (supersedes older notes below)

**Everything below the horizontal rule is historical. This block is the current state.**
Frontend is GREEN (`pnpm exec tsc --noEmit` + `pnpm build`) and Rust is GREEN (`cargo check`, deps cached).

> **CONVENTION (owner rule): ALL project knowledge/decisions live INSIDE the gary repo** (`docs/`, the
> `notebooklm/SKILL.md`, `CLAUDE.md`) — NOT in the external Claude auto-memory folder. It's an open-source
> project, so knowledge must travel with it, version-controlled. Do not stash gary facts in external memory.

### Added later this session (all green)
- **i18n / multilanguage** (`src/i18n.ts`): 5 languages **EN · ES · PT(pt-BR) · DE · 中文**, OS-language detection
  (default EN), `useT()` hook, persisted, Ajustes language picker. **"GARY" is NEVER translated.** Wired across
  Sidebar, Intro, Settings, Chat, FilterPreflight, Metrics, Offers, Onboarding (incl. ProfileForm/IngestProgress/
  banner). One tiny leftover: RoleCard stack-add placeholder still ES. Arabic = pending **RTL** pass (needs
  `document.dir` + logical CSS — a layout project, not just strings).
- **Performance ("Rendimiento") in Ajustes:** 5 levels (very_low..very_high) = **how many simultaneous
  windows/automations/bots** to NOT overload the LOCAL machine (recommendation from webview cores+RAM). It is
  SEPARATE from the mandatory per-website 429 rules (those protect account/IP). `settings.performance`.
- **Removed dead `cli`/`model`/API-key** from settings (frontend + Rust `Settings` struct) — GARY doesn't pick the
  model (chat is a plain terminal). Rust struct now: `browser`, `browserPort`, `performance` (serde defaults).
- **Onboarding stepper z-index fixed** (step dots opaque + above the line).

### ▶ NEXT — NotebookLM auto-create (Option A), user-approved, NOT started (needs fresh budget)
Goal: onboarding "Continuar" (after CV upload) REALLY creates + ingests into NotebookLM (not the current
`simulateIngest`), and Ajustes "Abrir NotebookLM" opens the created notebook. On CV replace → reuse the notebook,
delete old CV source, add the new one.
Plan:
1. **Plugin `notebooks create`** (`.claude/skills/notebooklm-ai-plugin/skills/notebooklm/scripts/`): the
   `CREATE_NOTEBOOK` RPC id (`CCqFvf`) is DEFINED in `rpc-types.ts` but **UNUSED/unimplemented**. Add a
   `createNotebook()` in `notebook-manager.ts` calling `rpc.execute(RPC.CREATE_NOTEBOOK, params, "/")` — study
   `rpc-client.ts` + `notes-manager.createNote` for the exact call/response-parse pattern; the CCqFvf payload
   must be reverse-engineered (likely `[title]` or `[null,title]`) and **verified live** (needs Google login).
   Add a `notebooks create --name <name> --json` subcommand in `main.ts` that prints the new id/url.
2. **Rust `start_ingest`** (new command): spawn the plugin via `npx -y bun scripts/main.ts …` at the plugin dir;
   run `login` (interactive first time), then `notebooks create` (or reuse saved id), then `sources add-file
   <cvPath> --notebook <id>`; stream `gary://ingest` events: `{kind:"log"}` per step, `{kind:"progress"}`,
   and `{kind:"notebook", id}` (contract already in `src/onboarding.ts`). Register in `main.rs`.
3. **CV replace:** on a new CV, if a notebookId exists → `sources list` → `sources delete` old CV source →
   `sources add-file` new. Emit the same events.
Caveats: first run opens Chrome for **Google login** (one-time, unavoidable); needs `bun` via npx; the CREATE
payload needs a live test to confirm/adjust. UI already: `notebook` ingest event → saves `notebookId`;
"Abrir NotebookLM" opens `notebooklm.google.com/notebook/<id>`.

**UPDATE (progress this session):**
- ✅ **Step 1 DONE:** `notebooks create` is now IMPLEMENTED in the plugin — `createNotebook(rpc, title)` in
  `.claude/skills/notebooklm-ai-plugin/skills/notebooklm/scripts/notebook-manager.ts` (uses `RPC.CREATE_NOTEBOOK`
  `CCqFvf`, payload `[title]` ✅ confirmed, id = **UUID at index [2]** ✅ fixed) + a `notebooks create --name <name>
  --json` subcommand in `main.ts` (loads cookies → `new RPCClient` → create → add to library → activate → prints
  `{id,url}`). See the ROOT-CAUSE FIXES block below — create + ingest are now VERIFIED working end-to-end.
- ✅ **BLOCKER RESOLVED (Step 2 prereq):** CV bytes now persist to disk. Rust **`save_cv(name, bytes)`** →
  `data/cv/base/<name>`, returns the path (`src-tauri/src/ingest.rs`). Frontend **`saveCv(file)`** in
  `onboarding.ts` reads `file.arrayBuffer()` → invokes `save_cv`; `OnboardingView.onPick` is now async and stores
  the returned `CvFile{name,size,path}`. `CvFile` gained an optional `path`. Web/degraded mode → no path → the UI
  falls back to `simulateIngest` (unchanged).
- ✅ **Step 2 DONE (deterministic wiring, cargo check + tsc GREEN):** Rust **`start_ingest(cvPath, notebookId?)`**
  (`src-tauri/src/ingest.rs`, registered in `main.rs`) spawns the plugin via `cmd /C npx -y bun main.ts` at the
  scripts dir and runs **`notebooks create --name GARY --json` (or reuse `notebookId`) →
  `sources add-file <cvPath> --notebook <id>`** (NO auto-`login` — see PERF REDESIGN), streaming `gary://ingest`
  events: `{kind:"log"}` per stdout/stderr line, `{kind:"progress"}` at each stage, `{kind:"notebook", id}` (parsed
  from the create `--json`), and `{kind:"error"}` on any failure. Returns `true` synchronously so the UI listens
  instead of simulating; runs on a blocking thread. `onboarding.ts` `runIngest` now passes `{cvPath, notebookId}`
  (was the dead `{fileName}`) and skips the backend when `file.path` is absent.
- ⏳ **Step 3 remaining (CV-replace, partial):** re-ingesting with an existing `notebookId` now **reuses** the
  notebook (no duplicate notebooks). NOT yet done: deleting the OLD CV source before adding the new one
  (`sources list --json` → `sources delete <sourceId>`). Deferred — needs the stored source id (add a
  `{kind:"source", id}` event + persist it) or a list-and-match-by-title pass. Same-notebook re-add currently just
  appends a source.
- ✅ **PERF REDESIGN (owner mandate — optimización mandatoria):** the plugin's own `login` launches a SECOND
  Chrome (its own profile, WITHOUT the user's Gmail session) and **polls every 2s for up to 5 min** (`auth.ts`)
  → overloads/crashes the machine. **Removed from the auto-ingest.** Now NotebookLM auth mirrors **Conexiones**:
  manual, one-shot, **reuses the `:9333` automation browser** (which already has Gmail logged in), **no polling,
  no second browser**. Pieces:
  - `engines/notebooklm-session.mjs` — attaches ONCE to `:9333` (`connectOverCDP`, like `check-login.mjs`),
    reads the Google cookies, prints `logged in: likely YES` + `COOKIES: <header>`; `browser.close()` only
    detaches (tab stays). 0 tokens, no new window.
  - Rust `notebooklm_status()` — cheap **file read** of the plugin cookie file (`%APPDATA%/notebooklm-ai/
    cookies.json`, checks SID + __Secure-1PSID) → the launch/enter-step connection state, no browser/network.
  - Rust `connect_notebooklm()` — one-shot: run the engine → pipe cookies to plugin `login --cookies "<hdr>"`
    (saves them without opening anything). UI races it with a 70s timeout (like `verify` in Sidebar).
  - `start_ingest` **no longer logs in**; it just checks `notebooklm_status()` and bails cleanly with a
    "Conecta NotebookLM primero" error if absent (a `notebooks create` without cookies also fails without
    opening a browser).
  - Onboarding step 2 gate `NlmConnect` (i18n `ob.nlm.*`, 5 langs): disconnected → **Conectar** (opens
    NotebookLM in `:9333`) → **Verificar sesión** (one-shot `connect_notebooklm`) → connected → THEN the
    create+ingest runs. `settings.ts`: `notebooklmStatus()` / `connectNotebooklm()`. All GREEN (tsc + cargo).
  - **Rule captured:** when something can be MANUAL and cuts system impact hugely (a human click vs. a
    background browser+poll loop), prefer manual and surface it. Same "the human clicks" ethos as Submit.
- ✅ **ROOT-CAUSE FIXES — full pipeline VERIFIED LIVE end-to-end (create + CV ingest real, this session).**
  "No lo creó" had TWO real bugs, both fixed in the plugin (TS, runs via bun):
  1. **Auth 302 (`rpc-client.ts` `init()`):** it did a single `fetch(…, redirect:'manual')` and died on the FIRST
     302. A freshly-bridged Google session authenticates via ONE redirect hop where Google refreshes the rotating
     `__Secure-1PSIDTS`. **Fix:** `init()` now uses `fetchWithCookieJar` (follows redirects, re-applies Set-Cookie)
     — also updates `this.cookieMap` with the rotated cookie for later `execute()` calls. This is why reusing the
     `:9333` Gmail session works and is robust across `1PSIDTS` rotation (only the long-lived `__Secure-1PSID`
     must stay valid; init self-heals `1PSIDTS` each call).
  2. **Wrong id extraction (`notebook-manager.ts` `createNotebook`):** the CCqFvf response is
     `[title, null, "<uuid>", …]` — the id is the **UUID at index [2]**, NOT the first string (that's the echoed
     title → old code returned "GARY"). **Fix:** extract index [2] (UUID-validated) + deep-scan fallback.
     Payload `[title]` confirmed correct. (Also reverse-engineered: **`DELETE_NOTEBOOK 'WWINqb'` payload =
     `[[id]]`**, returns `[]` on success.)
  Verified live: `notebooks create` → real UUID; `sources add-file <cv>` → "Enqueued blob bytes … for processing";
  engine grab → `login --cookies` (5.8KB header, 42 cookies) → saved. Toolchain (`npx -y bun main.ts`) runs clean.
  Cleaned up all test notebooks (DELETE_NOTEBOOK) + reset `%APPDATA%/notebooklm-ai/library.json` to empty.
  ⚠️ **Owner UI leftover:** 1 stray "GARY" notebook from a pre-fix create (real UUID unknown) may remain — delete
  it in the NotebookLM web UI. The engine (`notebooklm-session.mjs`) now **validates for real** (follows redirects,
  checks it lands on the app / `LabsTailwindUi`) so "Verificar sesión" only reports connected when the RPC will
  actually work — no more false "connected then fails". Ingest errors now bounce the UI back to the connect gate.
- ✅ **VERIFIED IN THE REAL APP (owner ran onboarding 2026-07-05):** create + CV ingest works end-to-end from
  the onboarding UI (screenshot: notebook `eedde5cd…` created, "✓ CV indexado en NotebookLM").
- ✅ **"Continuar" was stuck after ingest — FIXED.** Step-2 `canContinue` required `progress>=1 && roles.length>0`,
  but the REAL backend never emits a `roles` event (only the simulation did) → button stayed disabled. Now
  `ingestDone = progress>=1` (roles NOT required).
- ✅ **Onboarding steps REORDERED + role-mapping is the agent's job.** New order: 1 Subir CV · 2 Ingestar ·
  **3 Preguntas típicas · 4 Mapa de roles** (roles moved to LAST). The deterministic ingest does NOT detect
  roles/skills — the **LM agent** maps role families + technical skills + **soft skills (work/leadership/
  communication…)** from the CV + NotebookLM on first chat run. So step 4, when `roles` is empty (first time),
  shows ONLY an explanatory text (`ob.roles.empty.*`, 5 langs), soft-skills hidden, just Continuar. `buildContextMd`
  writes `> _Pendiente…_` TODO markers for the agent when roles/skills are empty. Rule added to `business-rules.md`
  §2. (Reverted the earlier DEFAULT_ROLES seed — empty is the intended first-time state.)
- ✅ **Dedup / recreate-on-delete — FIXED with the RIGHT existence check.** `sources list` returns `[]` for a
  DELETED notebook (exit 0) — it can't tell "empty" from "gone". So added **`notebooks exists <id> --json`**
  (plugin) = **LIST_NOTEBOOKS (`wXbhsf`, payload `[null,1]`, uuid at entry index [2]) membership by UUID**
  (titles come back empty in that list → the UUID is the identity). Rust `start_ingest` now: saved id → if
  `notebook_exists` → **reuse & update** (delete ALL sources, re-add CV; context re-added at finish) → else
  **recreate**. No saved id → create. This prevents duplicate "GARY" notebooks and recreates if the user deletes
  it on the website. Also fixed the create-id parse (`parse_notebook_id` now reads the whole pretty multi-line
  `{…}` block, not a single line — that was the "No se pudo leer el id (CCqFvf)" error). Verified live:
  create→`exists:true`; delete→`exists:false`.
- ✅ **Sidebar "Verificar" (batch) + connect auto-starts the browser.** New button next to the "Conexiones"
  title (`conns.verify` / tooltip `conns.verifyAll`, 5 langs) verifies ALL sites **one by one, silently**
  (`checkSiteLogin` attaches to `:9333`, no visible tabs) — for returning users with stored sessions. If the
  browser was closed it starts it first (`ensureBrowser` → `startBrowser`). Individual **"Conectar" now also
  starts `:9333` if it's down** (was redirecting to Settings). Batch fail → `disconnected` (→ Conectar).
- ✅ **Onboarding auto-opens `:9333`:** `connectNlm` now calls `openInBrowser(NOTEBOOKLM_URL)` which LAUNCHES the
  automation browser if it's down (or opens a tab if up) — no more "start it in Settings first".
- ✅ **`DELETE_SOURCE` was BROKEN — FIXED (this was why dedup never worked).** The plugin's `deleteSource`
  used payload `[notebookId,[sourceId],[2]]` → RPC returned `[3]` (error) and **silently no-op'd** (main.ts
  reported `{success:true}` anyway). So `start_ingest`'s delete-all "found" the sources but deleted NONE
  (owner saw 10 sources persist). **Verified correct payload live: `[[[sourceId]]]` (triple-nested) → `[]`
  success.** Fixed in `source-manager.ts`; now the step-2 delete-all AND `add_context_source` dedup actually
  work. Cleaned the owner's notebook to 1 CV + 1 `gary-context.md`. (Payload logged in `notebooklm` SKILL.md.)
- ✅ **Duplicate `gary-context.md` in the notebook — FIXED (was a real bug).** `finish()`→`add_context_source`
  APPENDED the context every time without removing the old one (owner saw 7× `gary-context.md`). Now
  `add_context_source` is IDEMPOTENT: it `sources list` → deletes any title containing `gary-context` → then
  adds. Also **onboarding always starts at step 1** now (removed `setStep(LAST)` + the `progress=1` preload), so
  **"Actualizar CV" (Ajustes→onboarding) runs the FULL flow** — step 2 deletes ALL sources + re-ingests the CV —
  instead of resuming at step 4 and just piling on another context. Net after one re-run: 1 CV + 1 context
  (self-cleans the existing dupes). CV titles = filename, context title = `gary-context.md` (confirmed live).
- ✅ **Settings "Abrir NotebookLM" bug fixed:** it opened the OS default browser (Brave) via `open_path`. Now
  `SettingsView.onOpenNotebook` opens the notebook URL in the **automation browser `:9333`** (`open_in_browser`,
  starting it first if needed) — same browser as all connections, where the session lives.
- ✅ **Context ingest (skills/roles/answers → RAG):** `onboarding.ts` `buildContextMd` + `ingestContext`; Rust
  `save_context` (→ `data/cv/base/gary-context.md`) + `add_context_source` (`sources add-file … --notebook`).
  Called at `finish()` so the notebook holds CV **+** technical/soft skills + role families + typical-question
  answers → the agent filters by modality/roles without re-asking.
- ⚠️ **Remaining live-gated:** first-time NotebookLM connect needs the user to actually **enter NotebookLM in the
  `:9333` browser** (Gmail login alone is NOT enough — must pass Google's account chooser into the app), then
  "Verificar sesión". Needs `bun` via `npx` on PATH. `cmd /C` arg-quoting keeps the notebook name space-free (`GARY`).

### Built this session (all compiling)
- **Brand:** `public/isotipo-clean.png` (watermark removed, transparent, 512px) is THE mark; `Avatar` renders it.
- **Intro splash + GSAP boot** (`src/views/IntroView.tsx`) + entry routing in `App.tsx`: Intro → Onboarding (if
  not `done`) → Chat; `prefers-reduced-motion` honored.
- **Chat = real system terminal** (`open_terminal` → OS shell at project root; NO LLM preloaded). User types
  `claude`/`gemini`/`opencode`. xterm theme re-skin fixed (deferred to rAF so it reads the new tokens).
- **Custom titlebar** (`Titlebar.tsx`, `decorations:false`) + **Tauri v2 capabilities** (`src-tauri/capabilities/
  default.json`) so min/max/close + drag work. `dragDropEnabled:false` so the onboarding CV drag-drop works.
- **Métricas** (`MetricsView.tsx` + `metrics.ts` + `data/metrics.md`): records **model + tokens per hunt**
  (⚠️ REVERSES the earlier "no model" decision in the section below — owner now wants model+tokens), plus
  jobs-by-source + history; **empty state** when no hunts (GARY starts from 0).
- **Offers map** (`OffersView.tsx`): **starts empty** (mock removed → empty state); expandable per-offer detail
  (CV file + local path + role/ATS summary); actions **Ver oferta** (URL) / **Ver PDF** (local path) /
  **Regenerar** (→ `CvGenModal` "GARY está generando tu CV…"). No more "draft answers".
- **Preflight overlay** (`FilterPreflight.tsx`) on a search chip: browser + per-site checklist → dissolves to
  reveal the live terminal.
- **Onboarding** (`OnboardingView.tsx`): **step 4 "Preguntas típicas"** (location; modality + "Todas"+condition
  e.g. sponsorship; salary+currency; phone; email; contact/exposure links; soft skills). PDF/Word only +
  validation; **Terminar → Chat**; autocomplete-from-CV event (`profile` ingest event) wired;
  `normalizeOnboarding()` deep-merges partial/old state (fixed a step-4 crash).
- **Settings** (`SettingsView.tsx`): removed CLI/model + API key (model is chosen in Chat). Now: CV/NotebookLM
  section (**Ver CV**, **Actualizar CV**, **Abrir NotebookLM** → `notebooklm.google.com/notebook/<id>`), browser
  **selector** (Chrome default/tested via `list_browsers`) + **Puerto (CDP)** label; **status polling** every 3s.
- **Sidebar:** Métricas nav (locked order Chat→Ofertas→Onboarding→Métricas→Ajustes). **Conexiones state machine:**
  Conectar → (browser running?) open the site URL in the automation browser → **Verificando…** polls
  `check_login` every 5s, **1-min timeout → back to Conectar**, or → **Conectado**.

### Rust backend cabled (`src-tauri/src/settings.rs` + `main.rs`, cargo check green)
- `Settings` gained `browser`. `start_browser(browser,port)` launches the **chosen** browser (chrome/edge/brave/
  chromium) with **career-ops flags** + **persistent dedicated profile `%USERPROFILE%\<browser>-automation-profile`**
  (Chrome reuses `chrome-automation-profile` @ **:9333** → existing logins persist). Fallback to the legacy `.cmd`
  for chrome only.
- New: `list_browsers` (installed detection), `open_in_browser(url)`, `check_login(url)` (runs
  `engines/inspect-session-site.mjs`, parses `logged in: likely YES`), `open_path(path|url)` (files via OS default,
  http(s) via default browser). `browser_status` now **probes the CDP port** (TCP) so manual close → Detenido.

### career-ops → GARY port (independent, candidate-agnostic — verified 0 career-ops paths, 0 PII)
- `docs/career-ops-map.md` = full per-board runbook (blocks/anti-bot · automation · pagination · WebFetch),
  the two-way-fit gate (§3), ask-on-untracked→continue (§7). Per-board skills carry the detail. Ported: `data/`
  (linkedin-playbook, easyapply-questions, applications, pipeline), engines (check-liveness, analytics, providers,
  scan…), `.claude/commands/`, `config/apply-fieldmap.json` (candidate-agnostic template).
- Fixed scrub over-eagerness: `output/gmail-harvest/` reverted from `engines/`; `docs/VISION.md`→`memory/VISION.md`;
  `start-brave-debug.cmd`→`engines/start-chrome-debug.cmd`; misleading "Brave" comments swept.

### Decisions LOCKED this session (do not re-litigate)
1. **Runtime terminal:** plain system shell, **no auto-spawn** of any LLM; user launches their CLI. Settings does
   NOT pick the model/API key.
2. **Automation browser = ONE dedicated persistent Chrome** (`:9333`, `%USERPROFILE%\chrome-automation-profile`),
   user-selectable (Chrome default/tested; Edge/Brave/Chromium allowed). Used for **logins + bots + automation**.
   Never touches the personal browser. Logins persist (log in once per site).
3. **Data split:** NotebookLM notebook = **USER context only** (CV + general onboarding answers + dynamic screening
   Q&A). **Offers stay LOCAL** (`data/offers-master.md`, `data/metrics.md`). `apply-fieldmap.json`/`profile.yml`/
   `cv-data.md` are derived caches mirroring the notebook.
4. **Métricas records model + tokens per hunt** (reverses the older no-model note).
5. **Decisive filter = two-way-fit gate** (available → applyable → modality/language → profile/CV fit → YOE →
   score 0–5, ≥4.0 apply). Full text in `operating-rules §1` + `career-ops-map §3`.

### Wired since (deterministic layer complete — cargo check green)
- **Connections freeze FIXED:** the old auto-poll (every 5s) stacked slow CDP checks → infinite loop/freeze.
  Redesigned to **manual verify** (`src/components/Sidebar.tsx`): Conectar → opens the site URL in the
  automation browser → button becomes **"Verificar sesión"** → one check (`check_login`, 70s client timeout) →
  Conectado / back to pending. No polling.
- **Rust `data.rs` (registered in `main.rs`):** `read_metrics` (parses `data/metrics.md`), `read_offers`
  (parses `data/offers-master.md`), `get_onboarding`/`set_onboarding` (JSON in app config dir). `OffersView`
  now loads via `read_offers` (empty until a hunt writes the file); `metrics.ts`/`onboarding.ts` already invoked
  these → now real. Login-check method = `engines/inspect-session-site.mjs` (ported from career-ops; parses
  `logged in: likely YES`).

### NEXT (LLM-agent-driven by design — runs in the chat terminal, not a Rust command)
- **Live NotebookLM ingest:** the terminal agent runs `notebooklm-ai-plugin` to create the notebook + index the
  CV + store general/dynamic Q&A. It reads the persisted onboarding context (`set_onboarding`) and should emit the
  created **notebook id** back via a `gary://ingest` `{kind:"notebook", id}` event (contract ready in
  `onboarding.ts`) → "Abrir NotebookLM" then opens the exact notebook. The UI ingest step is a faithful simulation
  until this runs.
- **Real hunts:** the agent orchestrates `engines/*.mjs` over CDP (`run_engine`) → writes `offers-master.md` +
  `metrics.md` → the UI reads them via the parsers above. (Deterministic bots + LLM orchestration, as designed.)
- **Verify end-to-end** with `pnpm tauri dev` (owner machine; MSVC present). Then iterate.
- Optional: per-website ✓/gap checklist; residual cosmetic sweeps.

---

## ▶ Done 2026-07-04 — Métricas view + owner decisions (HANDOFF TO MAIN)

**Built the Métricas React view** (components.md §F2, PROMPTS §8), wired into `src/App.tsx`
(`{view === "metrics" && <MetricsView />}`). Files (owned by the metrics agent, don't clobber):
- `data/metrics.md` — candidate-agnostic hunt log + format contract (HTML comment header, offers-master
  style). One row per hunt: `{YYYY-MM-DDThh:mm} — total={N} — real={M} — LinkedIn:a, Gmail:b, Indeed:c,
  GetOnBoard:d, Himalayas:e, Computrabajo:f`. Engines APPEND newest-last; UI shows newest-first. Invariants:
  `sum(bySource) == real`, `real <= total`. 4 illustrative rows.
- `src/metrics.ts` — bridge copying the `settings.ts` pattern (`tryInvoke<T>`); types `Source`/`Hunt`/
  `MetricsData`; `loadMetrics()` invokes Rust **`read_metrics`** (NOT built yet, spec 07) and falls back to a
  mock mirroring `metrics.md`; aggregation helpers (`totalQueries`/`totalFound`/`totalReal`/`activeSources`/
  `realBySource`).
- `src/styles/metrics.css` (token-only) + `src/views/MetricsView.tsx` — Overview cards · JobsBySourceChart
  (accessible horizontal bars, mono numbers) · QueryHistoryPanel (timestamp + reales/total, newest-first).
- `tsc --noEmit` clean.

**Owner decisions locked this session (do not re-litigate):**
1. **Sourcing recency = user-defined; DEFAULT 1 semana.** The hunt filters offers from the last week unless
   the user widens it. (Engine/Settings concern — surfaced as a note in `metrics.md`, not yet a UI control.)
2. **History order = newest first** ("de primeras el más nuevo"). Implemented.
3. **NO model column.** Métricas does **not** record or show the LLM model. Rationale: the chat is a free
   terminal — the user runs whatever model, and tracking it would interfere with the model running from the
   chat. Removed `model` from `Hunt`, the mock, `metrics.md`, and the UI. (⚠️ This **overrides** the earlier
   task brief that asked to record "modelo LLM usado en ese momento" — the new decision wins.)

**Also changed `src/views/ChatView.tsx`** (owner request, ⚠️ file also touched by a parallel agent — reconcile):
removed the "Iniciar Claude / Iniciar Gemini / Iniciar OpenCode" launcher chips (the `LAUNCH` array). The chat
is the **system terminal**; only the common task chips remain ("Buscar ofertas", "Revisa Gmail", "Continuar
hunt", "Mapa de ofertas"), sent verbatim to the PTY. Adjusted the welcome banner. Note: user reported `/claude`
"hanging" — that's expected, the start command in the bare shell is `claude` (no slash); `/…` slash commands
only work **inside** an already-running claude session.

### ▶ FOR MAIN TO DEFINE (next) — open product questions
- **(#1) Sourcing recency UI:** where does the 1-week default live/get changed? Settings? A control on the
  Offers/Métricas toolbar? A per-hunt override in the Chat? Needs a home + the `read_metrics`/engine contract.
- **(#4) QueryHistoryPanel richness:** currently timestamp + reales/total. PROMPTS §8 also mentions "fuente"
  per query — decide whether to show a top-source or per-source breakdown per hunt, and any status.
- **(#5) Métricas time filter:** should the view itself filter hunts by range (e.g. last week/month), or
  always show full history? Not built yet.
- **(#6) GSAP motion:** design-system §5 animations for Métricas (stagger cards/rows, bar sweep) are NOT yet
  applied — the view uses CSS transitions only. Wire in the Stage-6 motion pass.
- **Rust `read_metrics` contract:** confirm it returns `MetricsData` (`{ hunts: Hunt[] }`, no model) by
  parsing `data/metrics.md` "## Hunts", or adjust the bridge if the backend shape differs.

## ▶ START HERE (next session)
**Frontend build is GREEN** (verified 2026-07-02: `pnpm build` + `tsc --noEmit` pass). The **only** remaining
build blocker is the **Rust/Tauri compile**, which is **user-gated on MSVC C++ Build Tools** (`link.exe` fails
before reaching our code). So:

1. **To open the real desktop app:** install "Desktop development with C++" (MSVC Build Tools) + WebView2, then
   `pnpm tauri dev`. **To just navigate the UI now** (no native features): `pnpm dev` → http://localhost:5173
   (Tauri `invoke` calls degrade gracefully). The `pnpm build` blocker was a bad `allowBuilds` block in
   `pnpm-workspace.yaml` — **fixed**.

### ▶ Done 2026-07-02 (3 parallel build agents)
- **Build + bundle (green):** fixed `pnpm-workspace.yaml` `allowBuilds` (was placeholder strings → `pnpm build`
  aborted). `vite.config.ts` optimized: `target es2022`, esbuild minify, manualChunks split react/xterm/app
  (~127kB gzip total, now cacheable). Confirmed Node engine deps (playwright/dotenv/js-yaml/genai) are NOT in
  the webview bundle. `tsc --noEmit` strict clean.
- **Rust engine orchestrator (spec 07):** new `src-tauri/src/engines.rs` — `run_engine(name,args)` /
  `stop_engine(runId)` / `stop_all_engines`; spawns `node engines/<name>.mjs` at project root, streams
  `engine://data` + one `engine://exit`; path-traversal guard on name; non-blocking :9333 TCP probe. Refactored
  `resolve_cwd` into `engines.rs` (shared with PTY). Registered in `main.rs`. **cargo check blocked on MSVC only.**
  UI contract: `invoke('run_engine',{name:"linkedin-scan",args:[…]})`, listen `engine://data`/`engine://exit`.
- **Apply migration from career-ops (engines/):** ⚠️ **GUARDRAIL FIX** — `apply-from-linkedin.mjs` had a
  `--submit` path that clicked "Submit application"; **removed** (now always parks at Submit). Fixed hardcoded
  absolute `ROOT` (pointed at the wrong repo) → `process.cwd()`. Ported `config/apply-fieldmap.json` (answer map,
  was missing → filler would throw), `engines/apply-assist.mjs` (CDP :9333, candidate-agnostic), and
  `engines/generate-pdf.mjs` (cv-builder's import was broken/missing). Created `data/offers-master.md` +
  `data/orchestrator-state.md` skeletons. Pruned brave-era (`patch-brave-clean-exit.mjs` deleted).

### ▶ FOLLOW-UPS flagged this session (do next)
- **Candidate-agnostic violation (code):** `apply-from-linkedin.mjs` (`P` object: name/email/phone/EEO) and
  `easyapply-batch.mjs` (CV paths/phone/location) still HARDCODE the candidate. Product rule says never hardcode
  a person → source from `config/apply-fieldmap.json` / the NotebookLM RAG. Left intact to not break a working
  filler; needs a careful follow-up.
- **Release hygiene:** `config/apply-fieldmap.json` (+ existing `config/profile.yml`, `cv-data.md`) hold real
  personal answers → gitignore or ship as `*.example.json` before OSS release.
- **Cosmetic:** sourcing engines (`inspect-session-site`, `linkedin-enrich`, `open-tab`, `scrape-matches`,
  `gmail-harvest`) still say "Brave" in comments (they functionally use :9333). Comment sweep later.
- **Missing React views:** `Mapa de ofertas` is still a `Placeholder` (spec 04) and the **Apply modal (spec 05)
  does not exist** — build both; wire the offers view to `data/offers-master.md` and the engine orchestrator.

<details><summary>(historical) original Stage-2 gate — superseded by the above</summary>

1. **Verify the build.** Do `corepack enable pnpm && pnpm install` then `pnpm tauri dev`.
   The frontend degrades gracefully if the Rust commands aren't built.
</details>
2. **Pencil MCP is CONNECTED and WRITABLE (no restart needed).** With `.mcp.json` = `--app vscode` and
   `gary.pen` open in the **VS Code Pencil extension**, the MCP reads *and* writes fine — `batch_design`
   works through the live editor. **The QuickJS bug in `pencil/PROMPTS.md` was headless-CLI-only; it does
   NOT affect the VS Code-connected MCP.** So design is now done directly via MCP `batch_design`, not the
   editor chat. Restart is only needed if the MCP disconnects or `.mcp.json`'s `--app` changes.

**Stage 3 — Onboarding + NotebookLM** (`docs/specs/03-onboarding.md`) is **built** (code, unverified);
verify it in the same `pnpm tauri dev` run as Stages 1–2.

## ▶ BRAND ISOTIPO (official mark) — `gary/public/isotipo.png`
Julián delivered the **official isotipo**: a front-facing **dog/husky head** — black ears + crown, rust/brown
cheeks, **white muzzle blaze**, **amber eyes (≈ `#F5A524`, ties to the brand accent)**, black nose, transparent
bg. **This is THE brand image** for: the **Tauri desktop app icon** (`src-tauri/icons/` + `tauri.conf.json`),
the browser **favicon**, the **sidebar brand avatar**, **GARY's chat/message avatar**, the **onboarding hero**,
and the **loading mark**. It **replaces the placeholder emoji 🐾** used so far in code and in the `.pen`.
- ⚠️ The PNG has a **"DeeVid AI" watermark** (top-right) — **crop/clean it** before using as the app icon/favicon.
- **Next session actions:** (1) generate the Tauri icon set from a cleaned square PNG (`pnpm tauri icon`); (2) in
  the React app, swap the inline `Paw` SVG usages (`Avatar`, onboarding hero, loader) for the isotipo where a
  filled brand mark is wanted (keep line icons for nav); (3) in `gary.pen`, replace the emoji-paw circles with an
  **image fill** of the isotipo — Pencil images are `fill:{type:"image",url:"../public/isotipo.png"}` (url is
  relative to the `.pen` in `gary/pencil/`), or use the MCP `Generate` op. Applies to `PawCircle` nodes in
  Onboarding (`LcoWo`) and Chat sidebar (`HLl5R`) + their light copies.

## ▶ PENCIL `.pen` = SOURCE OF TRUTH, but UNSTABLE via extension (2026-07-03)
`pencil/gary.pen` is the **most up-to-date UI** (owner aligned the MVP in the VS Code Pencil extension with
Claude). It is **more current than these docs**. Because the extension connection is flaky, **mirror the
`.pen` into the docs** so implementation survives a `.pen` corruption.
- ⚠️ **MCP still could NOT connect this session** (bound to `--app desktop`; retried, failed). The earlier
  "Pencil MCP is CONNECTED and WRITABLE" note below is **STALE** — ignore it. To read/extract the `.pen` you
  MUST **restart Claude Code** with `gary.pen` open in the VS Code Pencil extension (binds `--app vscode`).
- **#1 TASK next session (once MCP reconnects):** `get_editor_state(include_schema:true)` → `batch_get`
  every top-level frame (`resolveVariables:true`) → **write each screen's structure/intent into
  `docs/components.md` + the per-view `docs/specs/`** so the design is captured outside the `.pen`. Include
  the NEW surfaces: **Intro/splash** and **Métricas** (already stubbed in `components.md §E2/§F2`, spec 00).

### App entry flow (owner, 2026-07-03 — captured; see memory `gary-app-entry-flow`)
**Intro/splash (on app open) → Onboarding (NotebookLM login → "verificando… → aceptar") → Chat.**
Returning users (onboarded) land on Chat directly. Intro navigates forward to Onboarding; a confirmed
NotebookLM sign-in routes to the Chat terminal. Wire this routing in `src/App.tsx` when building Intro.

### Doc↔decision reconciliations done 2026-07-03
- ❌ **Apply modal CANCELLED** — marked in `specs/05-apply-modal.md`, `components.md §G`, `specs/00` stage map.
  Apply prep + dynamic questions happen in the Chat (supervisor asks → `learn()` → `--resume`).
- ✅ **`--submit` RESTORED** in `engines/apply-from-linkedin.mjs` (Track C had wrongly removed it): opt-in flag,
  per-offer user authorization, LinkedIn Easy Apply only; default still parks at Submit. `--resume` continues
  the already-open modal after a chat Q&A.
- 🖼️ **Isotipo** is THE brand mark (dog-head PNG). Tauri app icons generated from `public/isotipo.png` via
  `pnpm tauri icon` (⚠️ still has the "DeeVid AI" watermark → crop + regenerate before release).
- **STILL STALE (not yet fixed):** `design-system.md §0` + `specs/01` call the brand mark "paw 🐾 crafted SVG"
  (→ align to isotipo); `design-system.md §7` lists "Segmented control (CLI picker)" though Settings no longer
  picks the runtime model; `components.md §B` describes chat bubbles (clarify: skin over the xterm terminal).

### App now COMPILES & the desktop build works (2026-07-03)
MSVC C++ Build Tools installed (winget); `cl.exe` present. `pnpm tauri dev` compiles+links clean (was only
blocked by a missing `src-tauri/icons/icon.ico` → fixed by `pnpm tauri icon`). Icon set generated;
`tauri.conf.json` bundle set to `targets:["nsis"]` + WebView2 `downloadBootstrapper`. Real React views now:
Chat, Onboarding, Settings, **Mapa de ofertas** (built 2026-07-03, wired to a mock derived from
`data/offers-master.md`; "Preparar aplicación" seeds the Chat composer, no modal). `.exe`/installer via
`pnpm tauri build` → `src-tauri/target/release/bundle/nsis/GARY_0.1.0_x64-setup.exe`.

## ▶ NEXT SESSION — EXECUTE (design rebuild, order locked 2026-07-02)
Pencil MCP is `--app vscode`. **Precondition:** `gary.pen` open in the VS Code Pencil extension + Claude
Code restarted (the MCP server binds `--app` at session start; a stale `desktop` binding fails to connect).
First call `get_editor_state(include_schema:true)`, then rebuild the 6 remaining low-fi screens **in this
order**, each: build the **dark** frame to `design-system.md` tokens via `batch_design`, verify with
`batch_get(resolveVariables:true)`, then `Copy` the frame with `theme:{mode:"light"}` for the pair. Consult
the named build-agent as art-direction persona (read its file, don't ship it). Respect product logic over
decoration (Submit-guard, real offers-master data). Do NOT chase `get_screenshot` on icon-font frames (known
blank raster; verify via `batch_get`).

| # | Screen | Dark / Light frame | Art dir | Build-agent persona |
|---|--------|--------------------|---------|---------------------|
| 1 | Ajustes (Settings) | `kvGrW` / `LRz8m` | PROMPTS §3 | ui-ux-designer + accessibility-expert |
| 2 | Mapa de ofertas | `cUT4b` / `j80VH3` | PROMPTS §5 | ui-ux-designer (real `data/offers-master.md`) |
| 3 | Sidebar (spec) | `javXE` / `Lfvsv` | PROMPTS §2 | design-system-architect (make it a reusable component) |
| 4 | Estados globales | `EAy6b` / `BAoMm` | PROMPTS §7 | ui-ux-designer + accessibility-expert |
| 5 | Loading / skeletons | `S36Dkv` / `E2tJ0` | design-system §5 | ui-ux-designer (capture GSAP motions as static states) |

> ❌ **Apply modal (old PROMPTS §6 / spec 05) is CANCELLED** (owner, 2026-07-02). No modal in UI or `.pen`.
> Everything the modal would show — the tailored-CV path GARY creates, the ATS-specific CV, and each
> **dynamic screening question** — is surfaced by the supervisor **in the CHAT**. Flow: apply engine hits an
> unknown/required question → STOPS with the questions listed → supervisor asks the user in chat → answer is
> `learn()`'d to `config/apply-fieldmap.json` + the NotebookLM RAG → engine re-runs with **`--resume`** to
> continue the already-open website. Delete/ignore `.pen` frames `GTAZo`/`zf88F`.

Then: (a) swap `PawCircle` emoji → image fill of `public/isotipo.png` (crop the "DeeVid AI" watermark first)
across all frames incl. Onboarding `LcoWo` + Chat sidebar `HLl5R`; (b) delete stray empty frame `BkYEK`
(confirm with Julián); (c) consider extracting the Sidebar as a shared component reused by Chat/Settings/Offers.

## ▶ DESIGN (gary.pen) — status & how to continue
The `.pen` is no longer a low-fi skeleton; it now carries the current visual source of truth for the React/Tauri
implementation. Current canvas status:
- ✅ **Brand direction locked**: official isotipo `public/isotipo.png` is the intro/hero/avatar/loading mark.
  The palette is warm dark-first with amber `#CE812D`, browns, black, white, and soft gray.
- ✅ **Intro / splash added, both themes** — Dark `g7DEDt`, Light `l4h5MD`. Centered isotipo above `GARY`,
  designed as the future GSAP motion target.
- ✅ **Chat rebuilt, both themes** — Dark `iojSR`, Light `CkPM3`. Chat remains terminal-first and is the
  baseline for hierarchy, density, and tone across the product.
- ✅ **Offers rebuilt, both themes** — Dark `o6xsZZ`, Light `y5gPGk`. Offers now share the same sidebar,
  warmth, hierarchy, and CTA logic as chat/settings.
- ✅ **Settings rebuilt, both themes** — Dark `b2CmT`, Light `o0fZN`. Settings no longer chooses the model;
  runtime is explained as coming from Chat. The top section now shows average token usage by workflow.
- ✅ **Onboarding rebuilt, both themes** — Dark `f2nnU`, Light `sWoKd`. Step 2 now explicitly asks the user to
  sign in to NotebookLM before ingesting their professional context.
- ✅ **Apply modal rebuilt, both themes** — Dark `Oh8k1`, Light `OCs3M`. Submit guard remains persistent.
- ✅ **Loading rebuilt, both themes** — Dark `bMz7Q`, Light `vXbht`.
- ✅ **States rebuilt, both themes** — Dark `cWdsM`, Light `oNPDI`.
- ✅ **Sidebar spec rebuilt, both themes** — Dark `i5Ina`, Light `BLfzg`.
- ✅ **Metrics screens added, both themes** — Dark `XHFOa`, Light `Uo31A`. These capture queries run, jobs
  found, active sources, and jobs-by-website comparison.
- ✅ **Sidebar order decision locked** — navigation order is now **Chat → Mapa de ofertas → Onboarding →
  Métricas → Ajustes**, with **Métricas directly below Onboarding** in every shell-like screen.
- ⚠️ **MCP screenshot caveat:** the Pencil MCP `get_screenshot` raster returns blank/white for frames that
  contain `type:"icon"` (lucide) nodes — it can't load the icon font headlessly. The frames are CORRECT
  (verify with `batch_get resolveVariables:true`) and render in the **live VS Code Pencil editor**. Emoji-only
  frames (Onboarding) screenshot fine. Don't chase this with repeated screenshots.
- ⏳ **Remaining work is implementation-side, not canvas-side**: port the updated `.pen` language into React,
  wire the real runtime and metrics data, and add GSAP motion on top of the intro/chat/onboarding/states.
- ⏳ **Polish pass (ui-ux-pro-max + GSAP + frontend-guidelines):** desktop-app feel + **loading states** are a
  priority (Loading frames + skeletons + the ingest/streaming/connection motions in design-system §5). GSAP is
  runtime motion — in the static `.pen` capture it as loading/empty/streaming *states*; wire the actual GSAP
  tweens in the React build (Stage 6, `06-states-motion.md`).
- 🧹 **Cleanup / follow-up:** old historical frame names and IDs remain referenced in earlier notes; prefer the
  IDs listed above. Consider extracting the Sidebar as a shared component reused by Chat/Settings/Offers.

## Known open items / next steps

## Task board (as of end of session)
- ✅ #1 build-agents isolated · #2 CLAUDE.md · #3 specs · #4 tokens · #5 app shell · #6 Chat/xterm
  · #9 Settings UI · #10 Settings Rust backend · #11 **Stage 3 Onboarding UI** (built, unverified).
- ⏳ #7 **Verify build** (pnpm install + tauri dev) — user-gated, not run (now covers Stages 1–3).
- ⏳ #8 **Coteja UI 1:1 vs gary.pen** — blocked on Claude Code restart to reconnect MCP (`--app vscode`).
- ⏳ #12 **Stage 3 Rust backend** — optional `get/set_onboarding` + `start_ingest` emitting `gary://ingest`
  events (drives the CLI's `notebooklm-ai-plugin`). UI degrades to a faithful simulation until then.

## The three projects (context)
- **`../agents`** — the `wshobson/agents` marketplace (88 plugins / 194 agents). **Construction help only.**
- **`../career-ops`** — the proven prototype (boards, blocks, auto-apply-to-Submit). Its knowledge is
  ported into GARY as skills + engines + `docs/operating-rules.md`.
- **`.` (gary)** — the product: an open-source **desktop** copilot for job hunting (Tauri + Rust), for
  technical and non-technical users. This is the goal.

## Decisions locked this session (do not re-litigate)
1. **Runtime LLM = a terminal-CLI SUPERVISOR, never a direct API call.** Inside the app, the chat **is a
   terminal** where the user starts their own terminal LM (Claude or similar). Deterministic bots
   (`engines/*.mjs`) do the token-free work; the LM engages **only** for: (1) unexpected errors,
   (2) dynamic unknown questions per offer, (3) ATS-tailored CV. GARY never calls an LLM API itself. Only
   terminal LMs are supported — no proprietary chat backend. Model/CLI-agnostic via `GARY_CLI`.
2. **NotebookLM = the candidate RAG.** Built from the CV + answers to dynamic questions; its job is to
   **optimize/consolidate** that into one queryable context so agents always read optimal, deduped,
   never-re-asked data. No static per-user files, no hardcoding. Via the `notebooklm-ai-plugin` skill.
3. **Marketplace agents are CONSTRUCTION-ONLY.** Copied to **`build-agents/`** (gitignored, **outside**
   `.claude/agents/` so the runtime CLI never loads them). **The product ships only the 4 expert job
   agents** (`job-orchestrator`, `job-triage`, `job-evaluator`, `job-apply-prep`) + `.claude/skills/`.
   A **release checklist** in `CLAUDE.md` deletes `build-agents/`.
4. **Design source of truth = `pencil/gary.pen`** (responsive desktop) + `design-system.md` +
   `components.md`; `pencil/PROMPTS.md` = resolved art direction per screen.

## Done this session
- **Stage 0 (wiring):** `build-agents/` populated (rust-pro, frontend-developer, ui-ux-designer,
  design-system-architect, accessibility-expert, context-manager, test-automator, typescript-pro,
  ai-engineer, prompt-engineer) + `build-agents/README.md`; gitignored. **Rewrote `CLAUDE.md`** (supervisor
  architecture, construction section, release checklist, staged plan). **Wrote `docs/specs/00…07`.**
- **Stage 1 (foundation + chat shell):**
  - `src/styles/tokens.css` — full dark/light token set from design-system §1–3 + fonts.
  - React shell: `src/main.tsx`, `src/App.tsx`, `src/theme.ts`, `src/icons.tsx` (inline SVG, incl. crafted
    Paw), `src/components/ui.tsx` (Button/Chip/StatusDot/Avatar), `src/components/Sidebar.tsx`,
    `src/views/ChatView.tsx` (embedded xterm, skinned from tokens, PTY bridge), `src/views/Placeholder.tsx`,
    `src/styles/app.css`. Updated `index.html`.
  - `package.json`: added `@types/react` + `@types/react-dom`.
  - Rust: `src-tauri/src/main.rs` `resolve_cwd()` so the CLI spawns at the **project root** (loads `.claude/`).

## Done this session — Stage 2 (Settings)
- **Settings UI:** `src/views/SettingsView.tsx` (CLI/model SegmentedControl + model select, API-key
  password field → keychain badge, browser Start/Stop + port, dirty-aware SaveBar) wired into `App.tsx`.
- **Primitives added** to `src/components/ui.tsx`: `SegmentedControl`, `Input`, `PasswordInput`, `Toggle`
  (+ `Eye`/`EyeOff` icons). CSS for all in `app.css`.
- **Settings bridge:** `src/settings.ts` — Tauri commands with a localStorage fallback (usable before the
  Rust backend exists). `ChatView` now spawns the **configured** CLI/model and shows it in the badge.
- **Rust backend:** `src-tauri/src/settings.rs` — `get/set_settings` (JSON in app config dir),
  `save/has_api_key` (OS keychain via `keyring` crate), `start/stop/browser_status` (launches
  `engines/start-chrome-debug.cmd` on the configured port). Wired in `main.rs`; `keyring = "2"` added to
  `Cargo.toml`.

## Done this session — Stage 3 (Onboarding + NotebookLM)
- **Onboarding UI:** `src/views/OnboardingView.tsx` — 3-step stepper (Subir CV → Ingestar en NotebookLM →
  Mapa de roles) with keyboard-operable steps, `CvUpload` (drag-drop + browse, file chip w/ size + remove),
  `IngestProgress` (progress bar + mono status log + retry on error, `aria-live`), editable `RoleMap`
  (removable stack chips + add-tag). Continue disabled until each step is valid. Wired into `App.tsx`
  (replaced the onboarding Placeholder).
- **Onboarding bridge:** `src/onboarding.ts` — `load/saveOnboarding` (Rust `get/set_onboarding` + LS
  fallback) and `runIngest(file, emit, signal)`: listens to `gary://ingest` events from the Rust core
  (which drives the CLI's `notebooklm-ai-plugin`); **falls back to a faithful local simulation** of the
  ingest stages when `start_ingest` isn't registered, so the screen is fully operable pre-backend. The UI
  only reflects progress — GARY never calls an LLM API here.
- **Primitives:** added `File`/`Upload`/`Plus` line icons to `src/icons.tsx`; onboarding CSS in `app.css`
  (stepper, dropzone, file chip, ingest card, role map) — all token-driven, AA, focus-visible.
- **Config:** `.mcp.json` switched `--app desktop` → `--app vscode` (needs a restart to reconnect).

## Known open items / next steps
- **VERIFY BUILD (not yet run) — covers Stage 1 AND 2:** `pnpm install` then `pnpm tauri dev`.
  `node_modules` absent; install was interrupted. `cargo` will fetch `keyring`. Needs MSVC C++ Build Tools
  on Windows. Frontend degrades gracefully if the Rust commands aren't built yet. (Task #7.)
- **Pencil MCP:** `.mcp.json` is back to **`--app desktop`** (Julián uses Pencil **desktop**). The MCP
  server process is fixed at session start, so **restart Claude Code** (with `gary.pen` open in Pencil
  desktop, `pencil login` done) to reconnect, then coteja UI 1:1. (Task #8.)
- **Next stages (specs 02→07):** Settings (keychain, CLI/model, browser control) → Onboarding (NotebookLM
  ingest) → Offers map (`data/offers-master.md`) → Apply modal (Submit guard) → states + GSAP → engine
  wiring (CDP). Build in order; each stage must run before the next.
- **Engine path fix** (CLAUDE.md known issues): run engines with CWD = project root; rename internal
  `output/<engine>.mjs` spawns to `engines/<engine>.mjs`; prune prototype extras.

## How to run
```
pnpm install
pnpm tauri dev     # opens GARY; Chat view spawns GARY_CLI (default gemini) in the PTY at project root
```
