# Spec 00 — Overview & principles (spec-driven build)

> The index for GARY's staged, spec-driven build. Read with `../VISION.md`, `../design-system.md`,
> `../components.md`, `../operating-rules.md` and `../../CLAUDE.md`. Each stage below has its own spec.

## Product in one paragraph
GARY is an open-source **desktop** copilot for job hunting (Tauri + Rust). **Inside the app, the chat IS a
terminal**: the user starts their own terminal LM CLI (Claude or similar) there. That CLI is the **brain**
and acts as a **supervisor** — the deterministic bots (`engines/*.mjs`) do the token-free work (paginate,
scrape, dedup, fill forms to the Submit step), and the LM engages only for the three judgment cases:
**(1) unexpected errors, (2) dynamic unknown questions per offer, (3) ATS-tailored CV**. GARY **never**
calls an LLM API directly and **never** clicks Submit.

## Design anchors in the current `.pen`
- **Intro / splash:** a centered launch screen with the official isotipo above the `GARY` wordmark. This is
   the visual intro image and the base target for the later GSAP animation pass.
- **Chat:** the terminal-first main surface remains the clearest articulation of the product and should be the
   baseline for hierarchy, warmth, density, and contrast across the rest of the system.
- **Metrics:** a dedicated metrics surface complements the offers map with queries run, jobs found, active
   sources, and jobs-by-website comparisons.

## App entry & routing flow (first run)
The `.pen` is the up-to-date source of truth for the UI. The entry path is:
**Intro/splash → Onboarding → Chat.**
1. **Intro/splash** on app open (isotipo + wordmark) → navigates forward to Onboarding.
2. **Onboarding** — the user **signs in to NotebookLM** (the candidate RAG); a "verificando… → aceptar"
   confirmation completes onboarding.
3. On confirmed NotebookLM login → **route to Chat** (the terminal main surface).
Returning users (onboarding already complete) land on Chat directly. See `docs/components.md §E2` (Intro)
and `§E` (Onboarding).

## The NotebookLM RAG (candidate context)
The candidate context is **not** static files — it's a **NotebookLM RAG** built from the user's CV +
the answers to dynamic questions gathered over time. Its job is to **optimize and consolidate** that info
into one queryable context so agents always read optimal, deduped, never-re-asked data. Flow:
`CV + Q&A → NotebookLM (via notebooklm-ai-plugin) → agents query it → new fact learned → written back`.

## Non-negotiable principles (apply to every stage)
1. **Chat = terminal.** No proprietary chat UI; the terminal LM CLI is the brain. Model/CLI-agnostic.
2. **LLM = supervisor, minimal tokens.** Deterministic engines first; LM only for judgment cases.
3. **Human-in-the-loop on Submit.** Fill to Submit and stop; never solve a captcha. A persistent notice
   "GARY no envía — el click final es tuyo" appears on every apply surface.
4. **Candidate-agnostic + model-agnostic.** Never hardcode a person or a vendor. Candidate facts come from
   the NotebookLM RAG; the LM comes from `GARY_CLI`.
5. **Design fidelity.** Follow `design-system.md` tokens (no raw hex), `components.md` contracts, and the
   `pencil/gary.pen` mockups. Dark default, light first-class peer. WCAG AA. Focus always visible. Status
   never by color alone.
6. **Construction agents never ship.** Build with `build-agents/` (gitignored); product ships only the 4
   job agents + skills. Run the release checklist in `CLAUDE.md`.

## Stage map
| Stage | Spec | Deliverable |
|-------|------|-------------|
| 0 | this file | Wiring: build-agents isolated, CLAUDE.md, specs. |
| 1 | `01-foundation-shell.md` | Tokens + React app shell + Chat view w/ embedded xterm. Runs locally. |
| 2 | `02-settings.md` | Settings (chat runtime summary, token usage, API key→keychain, browser control). |
| 3 | `03-onboarding.md` | Onboarding (CV upload → NotebookLM login/ingest → role map). |
| 4 | `04-offers-map.md` | Offers map from `data/offers-master.md`. |
| 5 | ~~`05-apply-modal.md`~~ | **CANCELLED** (2026-07-02) — no apply modal; apply prep + dynamic questions happen in the **Chat** (supervisor asks → learn() → `--resume`). Submit-guard notice lives on the offers/chat apply-initiation surface. |
| 6 | `06-states-motion.md` | Global states + GSAP motion. |
| 7 | `07-engine-wiring.md` | Browser/bots over CDP. |
| 8 | (new, `.pen` MVP) | **Intro/splash** view on app open → routes to Onboarding (see entry flow above). `components.md §E2`. |
| 9 | (new, `.pen` MVP) | **Métricas** view — queries run, jobs found, active sources, jobs-by-website. `components.md §F2`. |

## Definition of done (per stage)
- Matches the stage spec's acceptance criteria and the relevant `pencil/gary.pen` screen.
- Builds and runs via `pnpm tauri dev` with no console errors.
- Dark + light both correct; keyboard + focus ring work; AA contrast holds.
- No candidate/vendor hardcoding; no secrets committed.
