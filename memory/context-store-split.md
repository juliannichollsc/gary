---
name: context-store-split
description: NotebookLM = the user/candidate context only; offers + metrics stay in LOCAL files
metadata:
  type: project
---

Two separate stores, never mixed:

- **NotebookLM notebook = the USER/candidate context** — CV + general onboarding answers + dynamic screening Q&A. Queried by the terminal agent via the `notebooklm-ai-plugin` skill. `config/apply-fieldmap.json` / `config/profile.yml` / `cv-data.md` are **derived caches** that mirror it.
- **Offers / hunt results stay LOCAL** — `data/offers-master.md` (+ `data/metrics.md`, `data/orchestrator-state.md`). **Never** in the notebook.

**Why:** the notebook is a per-user RAG (personal, source-grounded); offers/metrics are operational data the UI renders locally. Keeping them separate makes the methodology candidate-agnostic and portable.

**How to apply:** user info → NotebookLM; job offers/metrics → local files. The GARY UI reads offers/metrics via Rust `read_offers`/`read_metrics`. See `docs/operating-rules.md §0`. Related: [[notebooklm-ingest-llm-driven]].
