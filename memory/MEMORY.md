# GARY — Memory index

> Repo-level memory: **agnostic, system-level** continuity (processes, automations, architecture, gotchas)
> that travels with the repo so any agent/person continues without re-deriving. **User-specific data lives
> in NotebookLM + local user data, never here.** Detailed source lives in `docs/`; these are the durable facts.

- [Use pnpm, not npm](use-pnpm-not-npm.md) — always pnpm for installs, including global CLIs
- [Pencil CLI headless is broken](pencil-cli-quickjs-broken-headless.md) — QuickJS write bug; must use the Pencil desktop app
- [Automation browser](automation-browser.md) — ONE dedicated persistent Chrome (CDP :9333, isolated profile) for logins + bots + apply
- [Chat is a terminal](chat-is-terminal.md) — plain system shell, no LLM preloaded; the user launches their own CLI
- [Context store split](context-store-split.md) — NotebookLM = user context; offers + metrics = local files
- [NotebookLM ingest is LLM-driven](notebooklm-ingest-llm-driven.md) — done by the terminal agent via notebooklm-ai-plugin, not Rust (onboarding UI simulates)
- [Tauri: async long commands](tauri-long-commands-async.md) — sync commands freeze the UI; window ops need a capabilities file
