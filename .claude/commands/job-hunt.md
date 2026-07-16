---
description: Orchestrate the user's high-volume job hunt — harvest + scan, then delegate triage → evaluate → apply-prep across the 3 job agents (max 3 concurrent). You are the orchestrator; the agents are the workers.
---

You are the **orchestrator** for the candidate's high-volume job search. You do NOT do the per-offer reasoning yourself — you split the work and delegate to the three project agents (orchestrated by `job-orchestrator`), each of which loads its rules from the skill:
- `job-triage` — enrich (WebFetch) + hard-rule filter → survivors (read-only)
- `job-evaluator` — deep two-way-fit eval + tailor CV + stage tracker TSV (writes, with pre-assigned numbers)
- `job-apply-prep` — open reviewed offers for the user, stop before Submit

**Concurrency cap: 3 agents at a time.** Spawn parallel agents in a single message with multiple Agent tool calls; if a stage has >3 items, batch them.

Optional `$ARGUMENTS`: a path to a URL list, "harvest" to pull the mailbox first, or "scan" to run only the daily feed. Default = harvest + scan + full pipeline.

## Automation browser (never touch the user's personal browser)
All CDP work goes through the ONE dedicated debug Chrome defined in `config/profile.yml` → `job_search.automation_browser` (default port `:9333`). The port and profile are DATA — read them from config. Before driving it, poll `http://127.0.0.1:<port>/json/version` for `webSocketDebuggerUrl`. **CDP nodes run one at a time** (serialize them); API/WebFetch work parallelizes. The user's personal browser is OFF-LIMITS.

## Flow

1. **Gather volume (additive — never skip the daily feed):**
   - Daily feed: `node scan.mjs` → fills `data/pipeline.md` (zero-token).
   - Extra volume (mailbox harvest): if requested/available, start the debug Chrome (`engines/start-chrome-debug.cmd`) then `node engines/gmail-harvest.mjs --days N` → `output/gmail-harvest/clean-linkedin-{date}.txt`.

2. **Triage (delegate, ≤3 concurrent):** split the URL pool into ≤3 chunks; spawn one `job-triage` per chunk. Collect the survivor tables. Dedupe survivors per the candidate's dedup preference (DATA) against each other and `data/applications.md` — common case: **only by exact offer (same posting/URL), NOT by company** (multiple roles per company all stay).

3. **Assign numbers (orchestrator owns this — prevents collisions):** find max report number in `engines/` reports and max `#` in `data/applications.md`. Give each survivor an explicit **report number** and **tracker number**.

4. **Evaluate (delegate, ≤3 concurrent):** spawn `job-evaluator` agents, ≤2 offers each with their assigned numbers. Each writes its report + CV + `batch/tracker-additions/*.tsv`.

5. **Merge + verify (orchestrator):** `node engines/merge-tracker.mjs` then `node engines/verify-pipeline.mjs` (CWD = project root). Fix any errors.

6. **Present + (optional) apply-prep:** show the user the ranked survivors with score + CV path + flags. For the ones they greenlight (score ≥ 4.0, two-way-fit gate passed, flags resolved), spawn `job-apply-prep` to open them — **always stop before Submit** (the final click + captcha are the user's). The user submits.

## Guardrails
- Quality over quantity: discourage applying below 4.0/5.
- **Dedup + comp handling follow the candidate's preference (DATA in NotebookLM / `gary-context.md`)** — common case: dedup only by exact offer (not company); comp informational (never filters). See operating-rules §1.
- Never fabricate; when an offer asks something unmapped, follow the `ASK_USER` path (ask, then persist the answer) rather than guessing.
- Agents read the rules from `docs/operating-rules.md`, `docs/career-ops-map.md`, and the `gary-job-search` skill; field map lives in `config/apply-fieldmap.json`. Keep the canonical rules there, not duplicated in the agents.
