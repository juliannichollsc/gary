---
name: easyapply-autofill
description: Accumulated knowledge for auto-filling the user's LinkedIn Easy Apply (and external ATS) applications — the field-answer rules, resolved-input PATTERNS, and corrections learned while driving applications to the Submit step. Answers come from config/apply-fieldmap.json + the NotebookLM RAG; the engine is candidate-agnostic. Use whenever filling a job-application form, or extending the field engine. Grows every time a new input is resolved.
metadata:
  author: "Julián Nicholls (@jnichollsc)"
---

# Easy Apply auto-fill — accumulated knowledge

> **GARY banner.** Candidate-agnostic. Canonical rules: `docs/operating-rules.md`; per-board runbook:
> `docs/career-ops-map.md §4`. Field ANSWERS are DATA (`config/apply-fieldmap.json` template +
> NotebookLM RAG); the MATCHING/fill engine is generic. Never hardcode a person's answers.

Goal: drive a LinkedIn **Easy Apply** application all the way to the **"Submit application"** step,
fully filled from the candidate's data — then **the user gives the final one-click Submit** (the
harness blocks unsupervised submission of real applications). This skill is the growing memory of
*how to answer inputs*; **every new input we resolve gets appended here + to
`config/apply-fieldmap.json`**.

## Architecture (filler is dumb, orchestrator has the autonomy)
- **Filler = fast, no autonomy** (`engines/easyapply-batch.mjs`): opens a fit-filtered Easy-Apply
  search, clicks each card, and if the role fits it clicks **Easy Apply** and fills every input it
  already knows from `config/apply-fieldmap.json` (via `engines/apply-fields.mjs`). It walks the modal
  to the Submit step. The instant it meets an **unknown input**, it STOPS and writes it to
  `output/apply-pending-fields.json`. It never reasons over the CV (keeps per-offer time low).
- **Orchestrator = autonomy** (main loop): reads the unknown, resolves it from the **NotebookLM RAG**
  (the candidate context; `cv-data.md` is a derived template cache); if it's **personal / not in the
  RAG / legal-eligibility**, it **asks the user by chat (ASK_USER)**; then `learn(matchTerms, value,
  source)` (in `apply-fields.mjs`) writes it into the fieldmap's `learned` array **and a row here**,
  and re-runs the filler with `--resume` (continues the SAME open modal — don't restart). The map
  converges → fewer stops.
- **Submit is the user's one click.** Never auto-submit.

## Portability
Field ANSWERS are candidate data (NotebookLM RAG + `config/apply-fieldmap.json`); the
MATCHING/engine logic (`apply-fields.mjs`) is generic. To run for a different candidate: re-ingest
their CV into the RAG + reset the fieldmap's `learned`/`skill_years` — the fill/learn loop is
unchanged. **Never hardcode a person's answers into the engine.**

## Field rules / data
- Canonical machine data: `config/apply-fieldmap.json` — matchers + `policy` (FILL / FLAG / ASK_USER)
  + `skill_years` + growing `learned`. It ships as a `{{PLACEHOLDER}}` template; onboarding fills the
  placeholders from the candidate's CV/RAG. Human-readable source of truth = the NotebookLM RAG.
- **`skill_years`** answers "years of X" and "experience with X" (years>0 → Yes). For a NUMERIC field
  asking about **multiple technologies of one class** (e.g. combined DB experience), SUM their YOE
  per the candidate's rule (e.g. PostgreSQL + MySQL = their sum).
- **Never fabricate.** A **gap skill** (any skill at 0 YOE in the RAG) = 0 / No — never claimed.
  Education that isn't a Bachelor's maps to the closest non-degree option on a US-scale dropdown,
  never up-leveled to a degree (**FLAG**).

## Resolved inputs log — PATTERNS (append every new case; keep person-specific values in the RAG)
These rows are the *decision pattern*, not one person's literal answers — the actual value is resolved
from `config/apply-fieldmap.json` / the NotebookLM RAG at fill time.

| Input (matched on) | Answer pattern | Source / why |
|--------------------|----------------|--------------|
| Comfortable working remotely? | Yes | profile: remote preferred (`profile.yml`) |
| Immediate joiner / notice period? | from RAG (availability) | candidate-provided; if absent → ASK_USER |
| Combined years across N technologies (numeric) | sum of their `skill_years` | candidate rule (e.g. Postgres+MySQL) |
| Highest level of education (US-scale dropdown) | closest non-degree option | RAG education — FLAG, never up-level to a degree |
| Mandatory English at a level ABOVE the candidate's | truthful **No** → **SKIP** the role | RAG language level; never lie, add to `descDisqualifies` |
| Years of a GAP skill (0 YOE in RAG) | **0 / No** | never inflate an absent skill |
| Authorized to work in {country} / sponsorship / clearance / criminal | **ASK_USER** | eligibility/legal — the user answers, never guessed |

## Fit filter (skip — don't waste a fill)
Skip: junior/entry/intern, over-senior (staff/principal/lead/manager/architect), region-locked
excluding the candidate's eligible geos, gap-skill-hard-requirement, YOE over ceiling, and **English
mandated above the candidate's level**. Sweet spot = the candidate's role map from the RAG (their
senior full-stack / frontend stack), remote + full-time.

## When extending
Add the new input as a PATTERN row above AND `learn()` it into `config/apply-fieldmap.json`. If it's a
class of question (e.g. a skill-years pattern), prefer encoding it in `apply-fields.mjs` logic over a
one-off entry. Keep the candidate's answers in the RAG / fieldmap — never in the engine code.
</content>
