---
name: chat-is-terminal
description: GARY's chat is a plain system shell (no LLM preloaded); the user launches their own terminal CLI
metadata:
  type: project
---

The GARY "chat" is a **real system terminal** (PTY → OS shell opened at the project root). It **does NOT auto-spawn any LLM**. The user types `claude` / `gemini` / `opencode` to start their agent, which loads GARY's `.claude/` skills + agents + docs. Settings does **not** pick the model and does **not** store an API key (that is the CLI's own login).

**Why:** auto-spawning a specific CLI (the old default `gemini`) crashed with `os error 2` when it wasn't installed, and coupling GARY to a model contradicts the model-agnostic vision. The runtime LLM is a **terminal supervisor chosen by the user in the chat**, never called as an API by GARY.

**How to apply:** never preload a model. Boot the shell (`open_terminal`); guide the user with a banner/chips, don't launch for them. See VISION + `docs/operating-rules.md`.
