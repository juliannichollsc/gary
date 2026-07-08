# Spec 07 — Engine / bots wiring (CDP)

> Wire the deterministic bots. Methodology: `docs/operating-rules.md`. Skills: `chrome-autoapply`,
> `source-*`, `*-offers`, `easyapply-autofill`, `gary-job-search`, `agent-browser`.

## Scope
- **Start browser:** a Settings/Chat action runs `engines/start-chrome-debug.cmd` → dedicated debug Chrome
  on `:9333`, isolated profile (never the user's personal browser).
- **Drive engines over CDP:** the terminal CLI (supervisor) drives `engines/*.mjs` to source per board
  (paginate → read real JD → two-way-fit gate → dedup into `data/offers-master.md`) and to apply
  (deterministic fill to the Submit step, attach CV, stop).
- **Fix engine paths** (see CLAUDE.md known issues): run with CWD = project root; rename internal
  `output/<engine>.mjs` spawns to `engines/<engine>.mjs`; prune prototype/brave-era utilities.
- **Supervisor escalation:** on an engine error, an unmapped dynamic question, or a CV-tailoring need, the
  LM engages, resolves, persists the answer to the NotebookLM RAG, and resumes — minimal tokens.

## Acceptance criteria
- "Start browser" launches Chrome:9333; a board sweep populates `data/offers-master.md` with JD-validated
  survivors (dedup by company); apply-prep fills a real external form to the Submit step and **stops**.
- A not-logged-in site fails its sweep and prompts the user to connect it (never falls back to the personal
  browser). Never clicks Submit; never solves a captcha. Stop is immediate on request.
