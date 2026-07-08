---
name: pencil-cli-quickjs-broken-headless
description: Pencil CLI headless writes are broken on this machine — must use the Pencil desktop app
metadata:
  type: project
---

On Julián's Windows machine (2026-06-29), the **Pencil CLI (`@pencil.dev/cli` 0.2.7) cannot write `.pen` files headlessly.** Every write goes through the `batch_design` MCP tool, which executes operations in an embedded **QuickJS** engine that fails to initialize:
`failed to initialize QuickJS: TypeError: e.entries(...)[...] is not a function` → `Error: Lifetime not alive`.

This breaks ALL headless paths: `pencil --out --prompt` (one-shot agent), `pencil interactive --out` (headless shell), and the standalone `pencil` MCP server. Reads (`get_editor_state`, `get_variables`, `snapshot_layout`) work; only writes fail. Reinstalling 0.2.7 didn't help. Older versions don't run on Node 20.16 (0.2.3 → `ERR_REQUIRE_ESM`).

**Connecting to the VS Code extension does NOT fix it.** The Pencil VS Code extension (`highagency.pencildev`) registers a named pipe `\\.\pipe\pencil-visual_studio_code`, and `pencil interactive --app visual_studio_code --in <file.pen>` connects + reads fine with a `.pen` open in VS Code. BUT writes still fail: `batch_design` returns `"OK"` yet applies NOTHING (even a deliberately invalid operations snippet returns OK — the QuickJS operations evaluator silently no-ops). The standalone `set_variables` tool errors `No handler found for method 'set-variables'`. Net: on this machine **the only Pencil write tool (`batch_design`) is dead in every mode** — headless, and over the live VS Code app. Reads (`get_editor_state`, `get_variables`, `batch_get`, schema) all work.

**Likely-working route NOT yet confirmed:** the Pencil editor's OWN in-canvas AI chat inside the VS Code webview (runs in a different runtime than the broken CLI `.exe`). User must type prompts there directly. Ready-to-paste prompts for all 7 GARY screens live in `pencil/PROMPTS.md`. If that chat ALSO fails with the QuickJS error, it's a confirmed build bug to report to Pencil.

**How to apply:** Don't retry CLI/MCP `batch_design` writes here — confirmed dead. Design system + component inventory are done (`docs/design-system.md`, `docs/components.md`). To produce `.pen` mockups, either (a) use the Pencil extension's in-editor AI chat with `pencil/PROMPTS.md`, or (b) report/await a CLI fix. App name for `--app` is `visual_studio_code` (not `desktop`). See [[use-pnpm-not-npm]] for installs.
