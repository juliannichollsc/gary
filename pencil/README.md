# pencil/ — GARY design files (`.pen`)

This folder holds GARY's **Pencil.dev** design files. `.pen` is a JSON-based, git-friendly
design format (the same one used in the user's `juliannichollsc/flow-pilot` repo).

## How GARY uses Pencil (headless CLI)

GARY drives the official **`@pencil.dev/cli`** (vendor skill: `pencil-design`). No GUI required.

```bash
# Generate a design straight into this folder
pencil --out pencil/<name>.pen --prompt "Design a settings panel for GARY" --export pencil/<name>.png --export-scale 2

# Iterate on an existing file
pencil --in pencil/<name>.pen --out pencil/<name>.pen --prompt "Add a dark-mode toggle"

# Interactive (agent) mode on a file — headless
pencil interactive --out pencil/<name>.pen
```

Auth once: `pencil login --email you@example.com` (or `PENCIL_CLI_KEY` for CI). Check with `pencil status`.

## MCP server (live canvas)

`.mcp.json` at the repo root registers Pencil's native stdio MCP server (`pencil` server).
It connects to a **running Pencil desktop / VS Code app** (`--app desktop`) so the agent can
manipulate the live canvas. When no Pencil app is open it simply won't connect — the headless
CLI above is the path that works without the editor.

> Path in `.mcp.json` is machine-specific (Windows global npm prefix). On another OS, point
> `command` at the matching `dist/out/mcp-server-<os>-<arch>` binary inside `@pencil.dev/cli`.

## Convention

- One `.pen` per screen/component; commit them (they're text/JSON).
- Co-locate an exported `.png` next to each `.pen` for quick visual diffing in PRs.
