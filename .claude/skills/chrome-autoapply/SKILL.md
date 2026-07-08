---
name: chrome-autoapply
description: Drive the user's logged-in automation Chrome (the debug browser in config/profile.yml → job_search.automation_browser, default :9333) with the agent-browser CLI to traverse job boards and AUTO-FILL applications to the Submit step — robustly, offer-by-offer, exhausting each LinkedIn filter before the next. This is the ENGINE (how to drive the browser); field answers live in easyapply-autofill; candidate rules in gary-job-search + docs/operating-rules.md. NEVER clicks Submit.
metadata:
  author: "Julián Nicholls (@jnichollsc)"
---

# chrome-autoapply — agent-browser engine for the user's job applications

> **GARY banner.** Candidate-agnostic. Canonical rules: `docs/operating-rules.md`; per-board
> runbook: `docs/career-ops-map.md §4`. All person-specific facts are DATA — comp floor / city /
> country / language / accounts live in `config/profile.yml`; skills, YOE and gaps come from the
> **NotebookLM RAG** (`cv-data.md` is a derived template cache). Never hardcode a person here.

This skill is the **robust, scalable engine layer**: how to drive the user's logged-in **debug
Chrome** (port/profile are DATA in `config/profile.yml → job_search.automation_browser`, default
`:9333`) with `agent-browser` (accessibility-tree snapshots + `@eN` refs, no brittle CSS). It is
intentionally separate from:
- **`easyapply-autofill`** — WHAT to answer (field map, learned inputs). Read it for values.
- **`gary-job-search`** + **`docs/operating-rules.md`** — WHO the candidate is, the hard rules, the
  two-way-fit gate. Candidate facts come from the NotebookLM RAG, never from this file.
- **`data/offers-master.md`** — the consolidated scored map + run state.

## Golden rules (non-negotiable)
1. **Fill 100% to the Submit button, then STOP — do NOT click Submit.** The harness blocks
   autonomous outbound submission; the final Submit + any captcha are the user's. (See
   `operating-rules.md §6` and `career-ops-map.md §6`.)
2. **Never fabricate / never claim a gap skill / never auto-solve a captcha.** An unmapped, personal,
   eligibility or legal field → leave it, flag **ASK_USER** (resolve from the NotebookLM RAG; if not
   there, ask the user, then `learn()`). Gap skills (any skill at 0 YOE in the RAG, e.g. cloud the
   candidate has no experience in) are **never inflated** — answer 0/No truthfully. Captcha/anti-bot →
   STOP for the user.
3. **Browser = the ONE debug Chrome (`:9333` DATA) only, and NEVER close/relaunch it mid-run.** Never
   `--auto-connect` (could grab the user's PERSONAL browser, e.g. a personal Brave on another port —
   that browser is OFF-LIMITS, read nothing/kill nothing). **CRITICAL: do NOT run `agent-browser
   close` / `close --all`** — that closes the shared logged-in debug Chrome and kills the whole
   session (this crashed prior runs). Do NOT run `start-chrome-debug.cmd` or `taskkill chrome`
   mid-run either. To finish an offer, just `open` the next URL in the same session (navigation reuses
   the tab). Only the main session / user manages the browser lifecycle. If a connect fails, retry
   2–3× with a short wait; if still down, STOP and report — never relaunch.

## Connect (the form that works)
```bash
npx agent-browser --cdp http://127.0.0.1:9333 <cmd>   # :9333 (DATA — profile.yml automation_browser)
```
- Use the **full URL** `http://127.0.0.1:9333` — the bare `--cdp 9333` HANGS.
- Prereq: the debug Chrome is up + logged into the job accounts. **Reset is a MAIN-SESSION / user-only
  action, never done by a worker agent mid-run:** `engines/start-chrome-debug.cmd` (kills chrome.exe,
  relaunches the dedicated isolated profile; LinkedIn/Gmail/GetOnBoard logins PERSIST; the personal
  browser is untouched). Verify: `curl http://127.0.0.1:9333/json/version` (a NEW ws GUID = it
  actually restarted; **CDP HTTP up ≠ ws up** — poll for `webSocketDebuggerUrl` before running). A
  worker agent that finds CDP down must STOP and report, not relaunch.

## The core loop (re-snapshot after EVERY page change — refs go stale)
```bash
npx agent-browser --cdp http://127.0.0.1:9333 open "<url>"
npx agent-browser --cdp http://127.0.0.1:9333 snapshot -i        # interactive elements + @eN refs
npx agent-browser --cdp http://127.0.0.1:9333 click @e3          # act on a ref
npx agent-browser --cdp http://127.0.0.1:9333 snapshot -i        # ALWAYS re-snapshot before the next ref
```
Other verbs: `fill @e "txt"`, `type`, `select @e "value"`, `check/uncheck @e`, `upload @e <file>`,
`press Enter`, `get url|title|text @e|value @e`, `scroll down 800`, `scrollintoview @e`.

**LinkedIn load gotcha:** never wait `networkidle` (LinkedIn never idles → timeout). Use a short fixed
settle: after `open`, just `snapshot -i` directly, or `wait --load domcontentloaded`. If `open` times
out, the page usually still loaded — verify with `get url`.

---

## The 4 dimensions (LinkedIn Easy Apply, this engine's primary board)

### (1) BLOCKS / anti-bot + mitigation
- **Captcha / "verify you're human" at login or submit** → STOP, hand to the user (hard rule 2). Never
  auto-solve.
- **LinkedIn auth challenge / checkpoint** → the debug Chrome must already be logged in; if it bounces
  to a checkpoint, STOP and prompt the user to sign in — never trigger an automated login flow.
- **429 / rate throttling** on rapid card traversal → the scanner already spaces its clicks; on a
  throttle, back off and resume (the sweep is resumable via the persistent dedup file).
- **Already-applied** → the card/offer shows "Applied" (or an Easy Apply button is absent). The apply
  script detects this and **skips** — do not re-open.
- **Closed / expired** → offer renders only chrome/nav, no JD, no Easy Apply → drop.
- **`agent-browser` daemon hang** (`Invalid response: EOF … daemon may be busy/unresponsive`, Chrome
  ws still up) → kill ONLY the daemon: `powershell "Get-Process *agent-browser* | Stop-Process
  -Force"` (NOT chrome), wait 3s, retry — it respawns. Never kill/close Chrome.

### (2) AUTOMATION — SCANNER-FIRST, then the deterministic apply script
**Canonical Easy Apply methodology lives in `data/linkedin-playbook.md`; do not diverge.**
Token-efficient hybrid: one deterministic engine does navigation+scraping+filtering at ZERO LLM
tokens; the LLM only reasons over the few survivors. Do NOT hand-drive snapshot-by-snapshot.

**SCAN (0 tokens) — ONE engine `engines/linkedin-scan.mjs`:**
```bash
node engines/linkedin-scan.mjs --all --tpr r604800          # FULL SWEEP: every title × location, one tab
node engines/linkedin-scan.mjs --kw "{TITLE}" --loc "{LOCATION}" --tpr r604800   # single combo (Worldwide: --geo 92000000)
```
URL filters: Easy Apply `f_AL=true`, `f_TPR=r604800` (week) / `r86400` (24h), `sortBy=DD`, and **work-type
`f_WT` — DATA, NOT a constant: it comes from the MODALITY the candidate answered in the onboarding preguntas
típicas** (`easyapply-filter.json` `workType`, default `2`=remote): `1`=on-site/presencial · `2`=remote ·
`3`=hybrid (comma list ok). **Titles/locations/workType are ALL DATA** — target titles from the candidate's role
map (NotebookLM RAG / `config/apply-fieldmap.json`); **locations follow the same modality answer** — remote →
eligible geos (city/country first + Worldwide `--geo 92000000`); **presencial/hybrid-only → the candidate's
current CITY only**, never the remote regions (operating-rules §4/§1). Use TEXT locations, never invented geoIds.

**TRIAGE survivors (LLM, few):** read `output/gmail-harvest/survivors.json`. Apply the full two-way
fit gate from `gary-job-search` / `operating-rules.md` (eligibility / comp floor from `profile.yml` /
YOE / gap-skill-hard-req / English level vs the JD / company-dedup) to each survivor. The FULL JD is
already captured, so **no per-offer WebFetch**. Keep fit ≥4.0.

**APPLY keepers — MANDATORY = the deterministic SCRIPT, not LLM agents:**
```bash
node engines/apply-from-linkedin.mjs "<url>" "<cvPath>"
```
It connects to `:9333`, clicks "Easy Apply", fills known fields from `config/apply-fieldmap.json`,
attaches the CV, advances to the Submit step and **STOPS** (detects already-applied → skips). The LLM
only steps in when the script reports something NEW (unmapped / personal / eligibility question) →
**ASK_USER** → `learn()` → re-run with `--resume`. Final Submit is the user's click.

### (3) PAGINATION — traverse the whole set, early-stop past the window
`linkedin-scan.mjs` **paginates** (`&start=` across pages) across every title × location combo,
maintaining a **global persistent dedup** (`output/gmail-harvest/linkedin-seen.json` — each offer
once, ever). It clicks each card to scrape its FULL JD in-session (the detail pane — navigating
directly to `/jobs/view/{id}` does NOT render the JD). **Card-pattern PRE-FILTER** (0 tokens)
auto-discards obvious non-fits before any LLM sees them (junior/intern, wrong stack, work-auth /
region-locked, 10+ yrs). **Early-stop:** with `--tpr r604800` LinkedIn already caps at ≤1 week; stop a
combo when its pages are exhausted. A fresh session just re-runs the sweep — dedup skips everything
already seen and continues.

### (4) WEBFETCH FILTERING — never title/card alone
Fit is judged on the **real JD**, never the card title. In this engine the JD is captured in-session
by the scanner (logged-in CDP detail pane), so triage reads `survivors.json` — **do not** re-WebFetch
what CDP already has. For boards where the JD is NOT captured in-session (external ATS off a LinkedIn
redirect), WebFetch the real posting before deciding. Reject on the JD, not the slug: gap-skill hard
req, English above the candidate's level when mandatory, YOE ceiling, region lock.

---

## Per-offer fill — LinkedIn Easy Apply RECIPE (reference for extending the script)
The Easy Apply modal is a multi-step wizard (`{n}/{N} pages`). The deterministic script walks it; this
recipe is for EXTENDING the script, not for hand-driving routine fills.

**Selector format gotcha:** in `snapshot -i`, refs come AFTER the label: `- button "Next" [ref=e3]`.
Grep the LABEL, not the ref: `snapshot -i | grep -E 'button "(Next|Back|Review|Submit
application|Upload resume)"'`. (`@eN [button …` patterns match NOTHING.)

1. **Open + start:** `open "<offer url>"` → `snapshot -i | grep "Easy Apply"` → `click @e<that ref>`.
2. **Each step — find the footer button by label** (`Next` early steps → `Review` → final `Submit
   application`). After each `click`, settle ~2s and re-`snapshot` (refs go stale).
3. **Contact step (1/N):** email / phone-country-code / mobile are PRE-FILLED from the profile (these
   are the candidate's DATA — never typed literally here). Just `Next`.
4. **Resume step:** existing CVs appear as `button "PDF {english-cv}.pdf …" [ref]` and `button "PDF
   {spanish-cv}.pdf …" [ref]`, each with a nested `radio [checked=…]`. **Pick by the JD's language** —
   the English CV for English roles, the Spanish CV for Spanish roles. (Or upload a tailored CV:
   `button "Upload resume"` → `upload @e<ref> <path>`; tailor via `node engines/cv-builder.mjs
   --variant {fullstack|frontend|backend} --company "{Name}" --format a4`.) Then `Next`.
5. **⚠️ Additional Questions step — READ every question, NEVER answer blind:** the question TEXT is NOT
   in `snapshot -i` (only the bare textbox/radio refs). Read it with `snapshot | grep -E
   "StaticText|\?|pages"` (filter out `skip to|notification`). Then:
   - **"Years of X" textboxes** → `fill @e<ref> "<grounded value from config/apply-fieldmap.json
     skill_years>"`. Correct any low pre-fill (LinkedIn sometimes pre-fills a wrong low number) up to
     the RAG value. **Gap skills = 0** (never inflate). Never fabricate.
   - **English level radios:** answer from the candidate's level in the RAG. If the JD/question makes a
     level MANDATORY that is ABOVE the candidate's level, the truthful answer disqualifies → **do NOT
     lie, STOP and DISCARD** the offer (this gate is often ONLY here, not in the JD).
   - **Eligibility / legal / visa / relocation / unknown** → leave blank, STOP, flag **ASK_USER**
     (never guess).
   - Radios: `click @e<Yes|No ref>` (from `snapshot -i | grep 'radio "(Yes|No)"'`).
6. **Final step ({N}/{N}, "Review your application"):** `button "Submit application" [ref]` is present.
   **STOP HERE — do NOT click Submit** (hard rule 1; the user's click). Report the offer Submit-ready
   with the CV attached + every answer given.

## Other nodes (open-and-hand-off; the apply click is the user's)
GetOnBoard `Postular`, XpertDirect `Pitch`, Tecla/VanHack (vetting gates) = one-click profile apply →
agent-browser OPENS the offer for the user; it does not click the apply. Indeed/Computrabajo =
anti-bot, open-and-hand-off. See `docs/career-ops-map.md §4` for each board's exact runbook.

## Output of a run
Submit-ready queue: per offer → company, role, url, tailored CV path, any flagged field. Hand to the
user for the one-click Submit/Postular/Pitch. Update the tracker only AFTER the user confirms he
submitted (Evaluated → Applied).
</content>
</invoke>
