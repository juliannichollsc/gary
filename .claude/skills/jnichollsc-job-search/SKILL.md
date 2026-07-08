---
name: jnichollsc-job-search
description: DEPRECATED alias — the canonical job-search skill is `gary-job-search`. This stub only redirects; it holds no candidate data. Use gary-job-search + docs/operating-rules.md + docs/career-ops-map.md.
metadata:
  author: "Julián Nicholls (@jnichollsc)"
---

# jnichollsc-job-search — DEPRECATED (redirect)

This skill is a **legacy alias** kept only so older references resolve. It carries **no candidate
context** (GARY is candidate-agnostic; candidate facts live in the **NotebookLM RAG**).

**Use instead:**
- **`gary-job-search`** — the canonical entry-point skill.
- **`docs/operating-rules.md`** — the user-agnostic methodology (two-way-fit gate, browser/CDP rules,
  fill-to-Submit, ask-on-untracked).
- **`docs/career-ops-map.md`** — the per-board runbook (blocks/anti-bot · automation · pagination ·
  WebFetch filtering) for LinkedIn, Gmail, GetOnBoard, Himalayas, Computrabajo, Indeed, Tecla, VanHack,
  XpertDirect.
- Per-board skills: `source-linkedin` · `source-gmail` · `source-getonbrd` · `source-himalayas` ·
  `getonbrd-offers` · `indeed-offers` · `computrabajo-offers` · `tecla-offers` · `vanhack-offers` ·
  `xpertdirect-offers`. Engine/answers: `chrome-autoapply` · `easyapply-autofill`.
