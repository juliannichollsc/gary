---
name: notebooklm-ingest-llm-driven
description: The real NotebookLM ingest is done by the terminal agent via notebooklm-ai-plugin, not a deterministic Rust command
metadata:
  type: project
---

Creating the user's NotebookLM notebook (auth → create notebook → upload the CV as a source → store Q&A) is **LLM + plugin-driven**: the terminal agent runs the `notebooklm-ai-plugin` skill (`.claude/skills/notebooklm-ai-plugin`, TS scripts: `main.ts`, `notebook-manager.ts`, `source-manager.ts`, `auth.ts`). It is **NOT** a pure deterministic Rust command (it needs Google login + NotebookLM automation).

The onboarding UI's "Ingestar en NotebookLM" step is a **faithful SIMULATION** (`simulateIngest` in `src/onboarding.ts`) — it does **not** create a real notebook — until a `start_ingest` backend is wired to run the plugin and stream `gary://ingest` events, including a `{kind:"notebook", id}` event so "Abrir NotebookLM" opens the exact notebook (URL: `https://notebooklm.google.com/notebook/<id>`).

**Why:** users were confused that no real notebook appeared after onboarding — because none is created yet (simulated).

**How to apply:** to actually create/verify the notebook today, run the agent in the GARY chat and ask it to ingest the CV via the plugin. To make the UI do it, wire `start_ingest`. Related: [[context-store-split]].
