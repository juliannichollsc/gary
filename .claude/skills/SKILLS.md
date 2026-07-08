# GARY — Skills manifest

> Policy: **install only well-known, safe skills.** Trusted provenance only — the user's own curated
> repo, the user's family/org, or official vendor skills. No blind installs.

## Installed — from the user's trusted repo `juliannichollsc/emi-fullstack-challenge/.claude/skills`
Only the GARY-relevant, project-agnostic ones (animation + generic UI) — the EMI-task-app-specific and
Vercel/stack-specific ones were NOT kept (see "Removed" below):
- **GSAP suite (user explicitly requested):** gsap-core · gsap-frameworks · gsap-performance · gsap-plugins · gsap-react · gsap-scrolltrigger · gsap-timeline · gsap-utils
- **Design/UI (generic):** ui-ux-pro-max (requested) · frontend-design · web-design-guidelines
- **Utility:** find-skills (discover/install more skills)

## Installed — from the user's family org `proyecto26`
- **notebooklm-ai-plugin** — NotebookLM as RAG (source-grounded answers over the user's docs). Powers GARY's candidate context.

## Authored for GARY (by Julián Nicholls / @jnichollsc)
- **gary-job-search** (core engine) · **source-linkedin** · **source-gmail** · **source-getonbrd** · **source-himalayas** · **website-analyzer**
  (thin skills → load the methodology from `docs/operating-rules.md`; candidate facts from the NotebookLM RAG.)

## Installed — Rust/Tauri stack (GARY is a Tauri v2 + Rust app) — vetted 2026-06-30
Source-audited before install (pure markdown, **no scripts/executables**, no malicious instructions); real
dirs in `.claude/skills` (**not** symlinks — the `skills` CLI's default `.agents/skills` + symlink layout was
flattened to match GARY's convention). Tracked in `skills-lock.json` with content hashes.
- **rust-best-practices** — `apollographql/skills` (MIT, Apollo GraphQL; `allowed-tools` restricted to cargo/rustc/rustfmt/clippy). Idiomatic Rust: ownership, error handling, testing (9 reference chapters).
- **tauri-v2** — `nodnarbnitram/claude-code-extensions`. Tauri v2 commands/IPC (invoke/emit/channels), capabilities/permissions, `tauri.conf.json` — directly GARY's `src-tauri` stack + PTY bridge.
- **rust-async-patterns** — `wshobson/agents` (37K★). Tokio tasks/channels/streams/error-handling — for the PTY bidirectional streaming bridge.

## Installed — official vendor (Pencil.dev)
- **pencil-design** — official skill shipped inside `@pencil.dev/cli` (`SKILL.md` at the package root, copied to `.claude/skills/pencil-design/`). Headless design→`.pen` via the CLI (`pencil --out pencil/<x>.pen --prompt ...`). Same Pencil variant as the user's `juliannichollsc/flow-pilot` repo (`.pen`, **not** OpenPencil's `.fig`). Refresh the copied `SKILL.md` after each `npm i -g @pencil.dev/cli` upgrade.

## MCP servers (config, not a cloned skill)
- **pencil** (`.mcp.json`) — Pencil.dev native stdio MCP server bundled in `@pencil.dev/cli` (`dist/out/mcp-server-<os>-<arch>`), launched with `--app desktop`. Connects to a **running Pencil desktop / VS Code app** for live-canvas editing. Headless work goes through the `pencil` CLI / `pencil-design` skill instead — no app needed. The `command` path in `.mcp.json` is machine-specific (Windows global npm prefix).

## Removed
**Untrusted source → replaced by the user's own:**
- ~~greensock/gsap-skills~~ → user's `gsap-*` suite. · ~~nextlevelbuilder/ui-ux-pro-max-skill~~ → user's `ui-ux-pro-max`.

**EMI-task-app / Vercel / wrong-stack (not GARY) → deleted 2026-06-28:**
- ~~architecture-guard~~ (enforces the EMI app's architecture) · ~~axios-specialist~~ (EMI HTTP; GARY uses Tauri IPC + Playwright) · ~~state-management~~ (EMI Context/useReducer) · ~~asset-fetcher~~ (web `public/brand/`) · ~~playwright-e2e~~ (EMI E2E; GARY's engines use Playwright directly) · ~~emi-tailwind-design-system~~ (EMI brand) · ~~vercel-react-best-practices~~ (Vercel deploy; GARY is desktop) · ~~jest-best-practices~~ (test-framework TBD).
