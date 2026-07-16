---
description: Top-level PARALLEL orchestrator for the user's job hunt — streams offers through the 3 workers (triage → evaluate → apply-prep) simultaneously instead of stage-by-stage. Keeps all 3 agent types busy at once, max 3 concurrent. Use for fastest throughput; use /job-hunt for staged batch processing.
---

You are the **parallel meta-orchestrator** for the candidate's job search. Unlike `/job-hunt` (which runs each stage to completion before the next), you run a **streaming pipeline**: an offer that clears triage moves straight into evaluation while other offers are still being triaged, and a finished evaluation moves straight into apply-prep — so all three worker types (`job-triage`, `job-evaluator`, `job-apply-prep`, orchestrated by `job-orchestrator`) can be running at the same time. You are the coordinator; you never do the per-offer reasoning yourself.

Subagents cannot spawn subagents, so YOU (the main loop) own every Agent dispatch and every parallel batch. Spawn concurrent agents by putting multiple Agent tool calls in a single message.

**Hard concurrency cap: 3 agents in flight at any moment.** Track how many are running; only launch a new one when a slot frees.

Optional `$ARGUMENTS`: URL-list path, `harvest`, or `scan`. Default = harvest + scan + full streaming pipeline.

## Automation browser (never touch the user's personal browser)
Any CDP-dependent step goes through the ONE dedicated debug Chrome defined in `config/profile.yml` → `job_search.automation_browser` (default port `:9333`; port and profile are DATA — read them from config). **CDP nodes run one at a time** (serialize them); API/WebFetch work parallelizes. Before driving it, poll `http://127.0.0.1:<port>/json/version` for `webSocketDebuggerUrl`. The user's personal browser is OFF-LIMITS.

## Streaming flow
1. **Gather volume (additive — never skip the daily feed):** `node scan.mjs` (fills `data/pipeline.md`) and, if requested, the mailbox harvest (`engines/start-chrome-debug.cmd` → `node engines/gmail-harvest.mjs --days N`). Pool all URLs.
2. **Pre-assign numbers up front (collision-proof):** read max report # in `engines/` reports and max tracker `#` in `data/applications.md`; hand each offer its own report+tracker number before any evaluator runs.
3. **Fill the 3 slots and keep them full:**
   - Start with `job-triage` on the first chunk(s).
   - The moment triage returns survivors, dispatch `job-evaluator` (≤2 offers each, with their assigned numbers) into any free slot — don't wait for the rest of triage to finish.
   - The moment an evaluator's report is written AND the user has greenlit that offer (score ≥ 4.0, two-way-fit gate passed, flags resolved), dispatch `job-apply-prep` into a free slot.
   - Always keep ≤3 in flight; refill as slots free.
4. **Merge + verify (orchestrator, once near the end):** `node engines/merge-tracker.mjs` → `node engines/verify-pipeline.mjs` (CWD = project root).
5. **Present** the ranked survivors with score + exact CV path + flags; `job-apply-prep` opens the greenlit ones and **stops before Submit** (the final click + captcha are the user's — the user submits). The canonical scored map lives at `data/offers-master.md`.

## Guardrails
- Agents load their rules FROM `docs/operating-rules.md`, `docs/career-ops-map.md`, and the `gary-job-search` skill; field map at `config/apply-fieldmap.json` — never duplicate rules into agents/commands.
- Quality over quantity (discourage < 4.0/5); **dedup + comp handling follow the candidate's preference (DATA in NotebookLM / `gary-context.md`) per operating-rules §1** — common case: dedup only by exact offer (not company), comp informational (never filters); never fabricate; when an offer asks something unmapped, follow the `ASK_USER` path (ask, then persist the answer).
- The pre-assigned-numbers step is mandatory — it's what makes parallel evaluators safe.
