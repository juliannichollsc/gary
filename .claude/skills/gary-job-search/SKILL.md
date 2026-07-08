---
name: gary-job-search
description: GARY's core job-search engine — source offers across boards, validate fit by reading the real JD, tailor an ATS CV per role, and prepare human-quality applications, stopping before submit. Use whenever the user wants to find jobs, scan boards, evaluate fit, tailor a CV, or continue the hunt. A GARY skill created by Julián Nicholls (@jnichollsc).
metadata:
  author: "Julián Nicholls (@jnichollsc)"
  origin: "GARY — ported & generalized from proyecto26/career-ops"
---

# GARY job-search engine (by @jnichollsc)

The full, user-agnostic methodology lives in **`docs/operating-rules.md`** — load it. The **per-board execution runbook** (exact steps, URLs/APIs, apply mechanisms, Himalayas ≤2-bot/429 rule, ask-on-untracked→continue) lives in **`docs/career-ops-map.md`** — load it too. This skill is the entry point; it does NOT restate the rules.

## Candidate context = NotebookLM RAG (not a static file)
The user's context is a **NotebookLM notebook** built from their **CV + the questions answered over time** (ask-on-unmapped). Query the notebook (via the `notebooklm-ai-plugin` skill) for any candidate fact — stack, YOE, gaps, comp, language, eligibility, EEO, screening answers. **When a fact is missing: ask the user, then store the answer back into the notebook** so the RAG converges and it's never re-asked. Never fabricate.

## Flow (see operating-rules.md for detail)
0. **ATS provider scan (0 tokens, ISOLATED)** — "buscar ofertas" ALSO triggers `node engines/scan.mjs` → `data/pipeline.md`: the mature 16-provider zero-token scanner (Ashby/Greenhouse/Lever/Workday/…), reading `portals.yml` (derived agnostically from an **ATS-only per-session NotebookLM clone**, decoupled from the connections' `gary-context.md`). Runs ALONGSIDE the connections below — never replaces or touches them. Its jobs are recorded under the `ATS` column in `data/metrics.md`. Full rule: `operating-rules.md §4`.
1. **Source** per board (LinkedIn/Gmail/GetOnBoard/Himalayas/…) — paginate fully, read each JD, validate by description (not title).
2. **Triage** with the two-way-fit gate (modality/language/profile/YOE/one-per-company/closed).
3. **Evaluate** A–G + tailor the CV to the mapped role variant.
4. **Apply-prep** — fill to the Submit step; **the final click + captcha stay the user's**.
5. **Merge** survivors into `data/offers-master.md` (the one canonical map).

## Onboarding (CV → roles → per-offer CV)
User delivers a base CV → build the NotebookLM context + map role families (variants) → derive the scanner filter → tailor per offer from the role variant. Log into each mapped site in the automation browser once.
