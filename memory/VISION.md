# GARY 🐾 — Vision & Project Context

> The north star for GARY. Read alongside `CLAUDE.md` (build task list), `docs/operating-rules.md`
> (job-search methodology, user-agnostic) and `.claude/skills/SKILLS.md`. Author: Julián Nicholls
> (@jnichollsc). License: MIT.

## Visión (resumen, en las palabras del dueño)
Un **tipo chat que en realidad es una aplicación de escritorio** hecha con **Rust**, que **muestra la
terminal** por debajo, **conectándose con un agente LM de terminal — Claude o Google (Gemini) o el que
sea**. La app **pide inicio de sesión en los websites** de empleo y deja **automatizados TODOS los
procesos** que ya logramos en este desarrollo (buscar, filtrar, evaluar, tailorear CV y aplicar hasta el
paso de enviar). El usuario solo escribe en el chat; el click final de enviar sigue siendo suyo.

## 1. What GARY is
An **open-source desktop copilot for job hunting**. It looks like a chat (ChatGPT/Claude-style) but is a
native **Tauri + Rust** desktop app. The chat **is an embedded terminal** (PTY) running the user's chosen
**AI coding CLI** (Gemini / Claude / OpenCode / Codex — any terminal LM agent). That CLI loads GARY's
skills + agents + methodology and drives the whole job hunt. GARY removes the terminal *friction* without
removing the terminal *power* — everything the CLI can do, GARY does behind a friendly chat.

**Design pillars**
- **Chat = terminal.** The user types; responses stream back as the conversation. Under the hood it's the
  real interactive CLI (via a Rust PTY bridge), so streaming, permissions, and interactive prompts all work.
- **Model/CLI-agnostic.** The backend LM is chosen in settings/`.env` (`GARY_CLI`). Not tied to any vendor.
- **Local-first.** GARY runs on the user's machine because the value is local: it drives the user's
  logged-in browser and reads/writes local files. (A hosted SaaS can't touch those.)
- **Human-in-the-loop on submit.** GARY fills everything to the Submit step; the final click + any captcha
  stay the user's (this is also a hard platform guardrail — do not try to auto-submit).
- **Candidate context = a NotebookLM RAG**, built from the user's CV + the questions answered over time
  (ask-on-unmapped), queried and written back via the `notebooklm-ai-plugin`. No static per-user hardcoding.

## 2. The core experience (target UX)
- **Chat view** — the main surface. Type a goal ("revisa gmail", "busca ofertas", "prepara las top 5") →
  GARY runs it and streams progress + results.
- **Sidebar** — navigation (Chat · Offers map · Onboarding · Settings) + a **Connections** panel showing,
  per mapped site (Gmail, LinkedIn, Indeed, GetOnBoard, Himalayas, Computrabajo…), whether the user is
  **logged in** (connected ✓ / disconnected ✗ / checking) with a "Connect" action that opens the
  automation browser to log in once. Dark + light theme toggle. Mascot 🐾 present.
- **Settings** — pick the LM CLI/model, store an API key in the OS keychain (or use the CLI's own login),
  start/stop the automation browser (Chrome debug), port.
- **Onboarding** — deliver a base CV → GARY ingests it into a NotebookLM notebook (the RAG context) →
  maps role families/variants → derives the scanner filter.
- **Offers map** — a visual render of `data/offers-master.md`: per channel, score 0–5, status
  (pending / applied / flag), filters, and a "prepare application" action.
- **Apply/review** — surfaces the tailored CV + draft answers with a clear "GARY does NOT send — the final
  click is yours".

## 3. Auth model (two things to log into)
1. **The LM agent** — the chosen CLI's own login (Claude subscription / Google login / OpenCode) OR an API
   key entered in GARY and stored in the OS keychain, injected into the spawned PTY process. Default backend
   is Gemini (free tier), matching `.env`.
2. **The job sites** — one-time login **in the automation browser** (not the user's personal browser) for
   each mapped site. Sessions persist in the isolated profile. A not-logged-in site fails its sweep → GARY
   prompts the user to connect it (never falls back to the personal browser).

## 4. Everything already achieved (that GARY must absorb)
All of this was built & proven in the prototype (`proyecto26/career-ops`) and is ported into GARY. Methodology
lives in `docs/operating-rules.md`; the runnable bots in `engines/`.
- **Sourcing per board, JD-level.** Every board: paginate fully → read each offer's real JD → validate by
  description (never title/card alone). Nodes:
  - **LinkedIn Easy Apply** — one engine, offer-by-offer (click card → read JD → filter), global dedup; the
    only truly auto-fillable node.
  - **Gmail job alerts** — harvest the alert inbox over CDP, dedup jobIds, triage by JD.
  - **Himalayas** — paginate all match pages + scrape each JD via CDP; **Cloudflare "Just a moment…"
    auto-clears ~4s → poll until clear**; the public API is not a workaround.
  - **GetOnBoard** — filters (Programming · Full time · Senior+Semi · salary min · remote) + "Load more"
    with **early-stop past the 1-week window** + **card-pattern pre-filter** (drop region-locked/hybrid
    without a JD read) → read survivors' JDs. Apply = one-click "Postular" (the user's click).
  - Plus Computrabajo/Indeed and the vetting-gated marketplaces (Tecla/VanHack/Xpert) as open-and-hand-off.
- **The two-way-fit gate (hard rules).** Modality (remote-worldwide / LATAM-incl-country / user's city /
  visa sponsorship — else drop, incl. region-locked) · language (only the user's) · profile fit (real stack;
  reject gap-core like AWS/GCP/K8s/Django, backend-specialist over-asks, non-eng roles) · YOE (scan the whole
  JD; reject above the user's total, e.g. 10+) · one-application-per-company · closed-posting discard.
- **CV tailoring per role.** Pick the offer's mapped variant → tailor truthfully (no fabrication) → the
  per-offer CV is throwaway (deleted after the application is confirmed, any site).
- **Apply-to-Submit.** Deterministic fill of Easy Apply / external ATS from the context (~0 tokens), attach
  CV, advance to Submit and STOP. Unmapped/personal/eligibility field → ask the user → store in the notebook →
  resume. Never Submit, never solve a captcha.
- **The single canonical map** `data/offers-master.md` — every channel merges its survivors here (dedup by
  company, per-channel sections, score, status boxes). Mark on apply.
- **Orchestration** — persistent cross-session state (`data/orchestrator-state.md`); triage → evaluate →
  apply-prep workers; CDP nodes serial, WebFetch/API nodes parallel; immediate stop on request.
- **Learning loop** — every new answer/rule is persisted (to the NotebookLM RAG + skills/context), so the
  system converges per user and is never re-asked.
- **Browser automation** — a dedicated debug Chrome (port 9333, isolated profile) drives everything over CDP;
  the user's personal browser is off-limits. `agent-browser` CLI preferred; Playwright `.mjs` as fallback.

## 5. Independence & portability
GARY is a **standalone product**, not a fork wrapper. The methodology + engines + skills are candidate-agnostic;
everything person-specific is the NotebookLM context (born from the CV + Q&A). To run for anyone: deliver a base
CV → GARY builds the context + role map → log into the sites → run. Swap the CV/user, the engine is unchanged.

## 6. Why it exists (product + portfolio)
Help people search & apply to jobs *better* (read the real JD, fit-score, tailor the CV) with far less manual
work — and stand as an open-source reference: a polished Rust/Tauri desktop app, model-agnostic, with a real
agentic engine behind a friendly chat. Lead publicly with the safe, broadly-useful core (evaluate fit · scan
public boards · tailor CV · track pipeline); keep logged-in auto-apply as an advanced local feature.

## 7. Status & next
See `CLAUDE.md` for the ordered base-maquetación task list and known issues. High level: scaffold + engines +
skills + agents + methodology are in place; next is making the chat shell run, the settings/onboarding UI, the
connections sidebar, and wiring the browser/bots — then design the whole UI with Pencil (see the design brief).
