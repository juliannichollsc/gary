---
name: connections
description: GARY's connections knowledge base + the MANDATORY change protocol that keeps working connections from breaking. One card per connection (Gmail, LinkedIn, Indeed, GetOnBoard, Himalayas, Computrabajo, Dice, Hireline, Glassdoor, Dover + the ATS scan) — how its login is verified and why, its engines, lock, pacing, block file, apply mode and known pitfalls — plus the shared modules and who depends on them. Use BEFORE changing any engine, verifier, connection rule or shared module, when the user reports a connection/verification problem, and when adding a new site.
metadata:
  author: "Julián Nicholls (@jnichollsc)"
---

# Connections — knowledge base + "don't break what works" protocol (by @jnichollsc)
> Candidate-agnostic. Every channel's detailed runbook stays in its own skill (`source-linkedin`, `indeed-offers`,
> `source-boards`, …); THIS skill is the cross-channel map + the rules for changing anything shared.

## 1. MANDATORY change protocol (act like a senior developer)
Every regression of 2026-11-10 (see §5) came from fixing ONE site by editing something SHARED, testing only that
site, or patching a copy that was later overwritten. So, for ANY change to an engine, verifier or shared module:
1. **Read first:** this skill + the channel's own skill. Know who else uses what you are about to touch (§3).
2. **Baseline BEFORE the change:** `node engines/check-connections.mjs` (static + live verification of all 10
   connections, 0 tokens, no navigation). Keep the output. For an engine, also note its last good log line and run
   its OFFLINE fixture when it has one (`engines/fixtures/` — e.g. LinkedIn: `source-linkedin` §3).
3. **Smallest scope:** fix the rule/engine of the site that is broken. **Never tighten or loosen a shared
   heuristic, regex, default or helper to fix one site** — add or adjust that site's own rule. If a shared module
   MUST change, list every consumer from §3 and re-test each one.
4. **Same results AFTER:** run `node engines/check-connections.mjs` again — every row must match the baseline
   unless the user logged in/out meanwhile. `node --check` every touched engine. Exercise the engine offline when
   possible (a copy pointed at a `data:` page, or `--dry-run` / `--port <closed>`), never by hammering the live site.
5. **Defaults are behavior:** changing a default (e.g. `easyApplyOnly`, a cap, a filter) changes what EVERY run
   does. Keep the previous behavior as default unless the owner asked; new behavior goes behind an opt-in.
6. **Live tests on the user's accounts:** ask first, keep them tiny (≤3 views), reuse the tab already open, and
   every ad-hoc probe script MUST `await acquireSiteLock('<site>')` (one bot per site + machine budget).
7. **One source of truth:** edit the REPO (`engines/`, `.claude/`, `docs/`), then sync the workspace. In dev the app
   runs from `~/.local/share/dev.gary.app/workspace` and `pnpm tauri dev` OVERWRITES its engines/docs/skills from
   the repo — a fix made only in the workspace (e.g. by GARY's in-app LM) is LOST on the next launch → port it to
   the repo first (`diff` repo vs workspace before restarting).
8. **Record it:** add a row to §5 (date · site · symptom · root cause · fix) and update the connection's card (§2)
   and its own skill. A rule without its "why" will be "simplified" by the next change and break again.

## 2. Connection cards
Verification = `engines/connections.mjs` (the ONLY place rules live) → `engines/check-login.mjs` (Conexiones
"Verificar sesión", run by Rust `check_login`) → regression test `engines/check-connections.mjs`. The user logs in;
GARY never logs in for them. Rule types: **yes** = selector that exists only inside a session; **no** = logged-out
markers (hidden ones count); a login/authwall/checkpoint URL is always NO; **generic** = text heuristic, only for
unmapped sites.

| Connection | Verify rule (why) | Engines | Lock | Pacing / caps | Block → no retry same day | Apply mode |
|---|---|---|---|---|---|---|
| **Gmail** `mail.google.com` | yes: account SignOutOptions link (inbox text is user content) | `gmail-harvest.mjs` (CDP tab, never the Claude Gmail MCP connector) | `google.com` | serial, one tab | — | n/a (feeds LinkedIn/Indeed/… URLs) |
| **LinkedIn** | yes: `/messaging/` or `/mynetwork/` nav, with or without the trailing slash (feed posts say "Regístrate") | `linkedin-scan.mjs` (map; Gmail `--urls` opens the e-mail's own link + Gmail referrer, never a crafted `currentJobId` URL), `easyapply-batch.mjs`, `apply-from-linkedin.mjs`, `linkedin-enrich.mjs` | `linkedin.com` | 4–9 s/offer · 8–15 s/page · 60–150 s/combo · ≤120 views · ONE process | 429 / checkpoint / "unusual activity" | Easy Apply = auto-fill to Submit (stop); with the user's explicit authorization `apply-from-linkedin.mjs --submit --answers <per-run RAG file>` sends it (STRICT fill, `RESULT` line); others mapped `apply: manual` |
| **Indeed** | yes: `/account/logout` (session shared by regional domains) | `indeed-apply.mjs` (+ anonymous WebFetch sourcing, page 1) | `indeed.com` | 4–9 s/viewjob · 2.5–4.5 s/step · 30–60 s between · ≤10/run | `output/indeed-block.json` (429, captcha, sign-in wall) | auto only Indeed Apply (to REVIEW; ask-in-the-middle → `--resume` SAME tab); company-site offers = MANUAL for the user (`indeed-manual.json`) |
| **GetOnBoard** | yes: `/webpros/logout`, no: `/webpros/login` ("Account Manager" titles fooled generic) | `getonbrd-matches.mjs` (CDP) or public API | `getonbrd.com` | serial JD 4–9 s, early-stop >1 week | — | one-click "Postular" = user's click |
| **Himalayas** | no: Log in / Sign up controls (pages render logged out) | `himalayas-matches.mjs` | `himalayas.app` | serial JD 4–9 s, Cloudflare auto-clear poll | Cloudflare not cleared | open-and-hand-off |
| **Computrabajo** | **WEAK — generic** (`www.` is a country picker; map a yes-marker on `<cc>.computrabajo.com`) | `computrabajo-apply.mjs` | `computrabajo.com` | 4–9 s/view · 30–60 s between · ≤10/run · viewport ≥1440 | 403 / block | FULLY AUTOMATIC (exception #1), conversational KQ, `--answers` per run |
| **Dice** | no: `/dashboard/login`, `/register` (hamburger hides them → hidden count) | `board-sweep.mjs --site dice / dice-recs`, `dice-apply.mjs` | `dice.com` | 8–15 s/page · 4–9 s/JD · 2.5–4.5 s/step · 30–60 s between · ≤10/run | `output/board-sweep/dice-block.json` (shared) | FULLY AUTOMATIC in-platform (exception #2); external skipped |
| **Hireline** | yes: `/auth/logout` (login modal always in DOM). Session expires → user re-logs | `board-sweep.mjs --site hireline`, `hireline-apply.mjs --phone` | `hireline.io` | same as Dice | `hireline-block.json` | FULLY AUTOMATIC (exception #3); phone per run from the RAG |
| **Glassdoor** | no: `/profile/login` Sign In link | `board-sweep.mjs --site glassdoor` (`?fromAge=7`, no `--jd`) | `glassdoor.com` | same as Dice | 403 on JD pages = hard block → JD pages never opened | map only |
| **Dover** `jobs.dover.com` | yes: `a[href="/candidate/dashboard"]` ("My dashboard" goes to `/login?app=candidate` logged out); no: Sign in / Sign up links | `dover-jobs.mjs` (own engine, same-origin JSON API from the user's tab) | `dover.com` | 8–15 s/list call · 4–9 s/JD call · ≤120 calls | `output/board-sweep/dover-block.json` (403/405/423/429, challenge) | map only (`apply: manual`) |
| **Web** (not in Conexiones) | — (open web, no session, no browser) | the user's LM (WebSearch/WebFetch) + `web-companies.mjs` (classify · link-safety · ATS list APIs) | `ats-scan` (helper only) | in-session only, ≤20 searches / ≤15 reads per run | — | DIRECT employer pages only, map only (`source-web`) |
| **ATS scan** (not in Conexiones) | — (HTTP APIs, no session) | `scan.mjs` + `providers/*`, `ats-registry.mjs` | `ats-scan` | ONE request in flight per host, 0.3–0.7 s gap, 423/429 breaker | per-host breaker | title-only, no JD (0 tokens) |

Adding a connection: card here + rule in `connections.mjs` (with `why`) + `Sidebar.tsx → INITIAL_CONNS` + its
channel skill + `website-analyzer` notes → `node engines/check-connections.mjs` must pass the static check.

## 3. Shared modules — who breaks if you touch them
| Module | Consumers (re-test ALL of them after a change) |
|---|---|
| `engines/connections.mjs` (`verifyPage`, rules) | `check-login.mjs` (every Conexiones "Verificar"), `check-connections.mjs`, `board-sweep.mjs` (Glassdoor `needsSession` pre-check), `dover-jobs.mjs` (session pre-check) |
| `engines/_site-lock.mjs` (one bot per site, tab cleanup on abort) | every browser engine + `scan.mjs` (13 engines) |
| `engines/_machine-guard.mjs` (machine budget, back-off) | via `_site-lock` → all of the above; `breathe/machinePace` in board-sweep, dice/hireline/indeed/computrabajo apply, himalayas/getonbrd, linkedin-scan |
| `engines/apply-fields.mjs` (`answerFor`, `fillForm`, `recordUnknowns`; `fillForm` ctx `{ map, strict }` is OPT-IN — only `apply-from-linkedin --answers` passes it) | `apply-from-linkedin.mjs`, `easyapply-batch.mjs`, `indeed-apply.mjs`, `computrabajo-apply.mjs` |
| `engines/field-types.mjs` (field contract: spec / coerce / validAfter) | `indeed-apply.mjs` (adopt in other apply engines WITH their own regression run) · test `node engines/field-types.test.mjs` |
| `engines/providers/_http.mjs` (per-host throttle) | `scan.mjs` + every provider + `web-companies.mjs` (Web channel, imports the providers; same `ats-scan` lock) |
| `engines/board-sweep.mjs` adapters | Dice search, Dice recs, Hireline, Glassdoor (one adapter per site — don't share selectors). Adapter opt-ins: `noJd` (Glassdoor), `dateFilter` (Glassdoor), `needsSession` (Glassdoor → exit 6 `GLASSDOOR-LOGIN-NEEDED` when logged out) — undefined for the others = unchanged |
| `output/board-sweep/<site>-jobs.json` format | board-sweep sites + `dover-jobs.mjs` (same shape → same source-boards triage) |
| `config/easyapply-filter.json` (generated) | `linkedin-scan.mjs` (titles/locations/workType/linkedinFilters), `board-sweep.mjs` keywords |
| `data/metrics.md` / `data/offers-master.md` formats | Rust `read_metrics` / `read_offers` → Metrics + Offers views (keep the row formats; refresh headers from `.example`) |

## 4. Runtime facts every change must respect
- **Workspace:** dev data + engines run from `~/.local/share/dev.gary.app/workspace` (`GARY_ROOT`); repo edits reach
  it on the next `pnpm tauri dev` launch (or a manual sync). The in-app LM may edit the workspace → port to repo.
- **One automation Chrome (:9333)** holds every session. Engines close their own tab on finish (unless they leave a
  form for the user); an aborted bot closes the tabs of its own site it opened. Never close the user's tabs.
- **Global rules** (CLAUDE.md MANDATORY): one bot / one tab / one request per site · machine budget (`node
  engines/_machine-guard.mjs` before launching) · human-like filter mapping · filters from the CV or asked.
- Locks taken before the last reboot are stale (pids get reused) — the lock code ignores them.

## 5. Incident log (never repeat these)
| Date | Site | Symptom | Root cause | Fix / rule |
|---|---|---|---|---|
| 2026-10-28 | LinkedIn | account integrity check | 0.9 s/offer + parallel workers | pacing floor, ONE process |
| 2026-11-10 | GetOnBoard | false "Conectado" | generic `account` text matched job titles | site rule (yes/no markers) |
| 2026-11-10 | Gmail | false NO | inbox e-mails contain "sign in"/"regístrate" | yes-marker (SignOutOptions) |
| 2026-11-10 | Dice / Hireline | false YES | login buttons hidden in hamburger; Hireline modal always in DOM | hidden markers count; Hireline logout yes-marker |
| 2026-11-10 | LinkedIn | "Verificar sesión" NO while logged in | GENERIC rule tightened for GetOnBoard removed LinkedIn's signals; feed shows "Regístrate" | per-connection registry `connections.mjs` + regression test; generic only for unmapped sites |
| 2026-11-10 | LinkedIn | non-Easy-Apply offers dropped | default `easyApplyOnly` flipped to true while simplifying | default restored (map ALL, flag `apply: auto/manual`); defaults = behavior (§1.5) |
| 2026-11-10 | PC | full freeze | lock-less probe scripts + Gmail and LinkedIn bots in parallel + leaked tabs, next to heavy apps | machine guard, probes must take the lock, tab cleanup |
| 2026-11-10 | Indeed | paused application reopened in a 2nd tab | no resume; header locator hit 2 elements (strict mode) | `--resume` re-attaches by target id / header `.first()` |
| 2026-11-10 | LinkedIn | searched "{ROLE} {COUNTRY}" (place typed with the role), Date posted not applied (1-month-old cards) | place typed into the query; date ticked in the All-filters dialog whose hidden duplicate inputs swallowed the click | 3 human steps: role only → region control → Date posted pill, each verified; offline fixture `engines/fixtures/linkedin-search-results.html` |
| 2026-11-10 | LinkedIn | committed engine (unchanged) mapped 1 card/page, location ignored | LinkedIn moved /jobs/search/ → conversational /jobs/search-results/: cards are `componentkey` blocks (no /jobs/view/ anchors), URL filters ignored, date "Show results" is an `<a>`, region = separate control ("Clear location" + `<a>` suggestions), applied date pill renamed "Filter by Past week" + `f_TPR` in URL | human 3-step mapping mapped on the LIVE DOM; fixture updated to the same DOM; closed check + full map `output/linkedin-jobs.json` |
| 2026-11-10 | Indeed | 7 company-site offers lost as "sin Indeed Apply (¿cerrada?)" | the external CTA text varies; "no button" was read as closed; externals were "out of scope" | closed/applied detected by page text, everything else = `MANUAL_EXTERNAL` kept for the user |
| 2026-11-10 | Indeed | apply looked frozen on a select | `selectOption` waited 30 s for a label that wasn't there; custom div dropdowns were silently skipped | bounded 5 s select → `TYPE_MISMATCH` pause; custom widgets → `UNSUPPORTED_CONTROL` pending; MANDATORY pause→ask→resume rule for every apply engine |
| 2026-11-10 | LinkedIn / Computrabajo | fixes lost | patched only in the workspace, which `tauri dev` overwrites | edit the repo, then sync (§1.7) |
| 2026-11-11 | Glassdoor | every row `posted: ""` → recency unverifiable; 2026-11-06 run blocked | cards dropped `[data-test="job-age"]`; `--jd` opened `/job-listing/` pages (403) | `?fromAge=7` server filter + `dateFilter` stamp; `noJd` (map only) — Glassdoor adapter only |
| 2026-11-13 | LinkedIn (Gmail → `--urls`) | "You're now using AI-powered job search" toast on every offer the bot read from the alert e-mails (owner flagged it as detectable) | `scanUrls` rebuilt every e-mail offer as a crafted `/jobs/search/?currentJobId={id}` URL → each one landed on the AI-powered search, 26× in a row, no referrer, no reading | open the e-mail's OWN link (`/comm/jobs/view/…`, fallback `/jobs/view/{id}/`) with Gmail as referrer + `readLikeAPerson` (scroll, "…more") before scraping; `--fail-limit` 8 → 3; old path = opt-in `--split-view`. Search sweep untouched (fixture regression identical) |
| 2026-11-11 | Glassdoor · Dover | (owner request) a logged-out run would map silently instead of asking for the user's session | no pre-check in the engines | session pre-check with the site's own Conexiones rule → `⏸ <SITE>-LOGIN-NEEDED`, exit 6; Glassdoor via adapter opt-in `needsSession`, Dover in its own engine; Dice/Hireline untouched. Verified: live YES on both + offline logged-out/in markers on a blank tab |
| 2026-11-17 | LinkedIn (Conexiones) | LinkedIn read NO while the tab was logged in (on `/notifications/`) | the nav now links `https://www.linkedin.com/mynetwork` WITHOUT the trailing slash; the rule wanted `/mynetwork/` | LinkedIn rule only: also accept `href$="linkedin.com/mynetwork"` / `…/messaging`. check-connections before/after: only LinkedIn changed (NO→YES) |
| 2026-11-17 | LinkedIn Easy Apply (`--submit`) | (caught before any send) a submit run would have typed `{{FIRST_NAME}}`, `{{TOTAL_YOE}}`… — and `{{STATE}}` into "Personal statement", total YOE into "years with Docker" | `config/apply-fieldmap.json` is a PII-free template by rule and nothing resolved its tokens; `answerFor` matches by substring; radio/select had blind fallbacks | `--answers <per-run file from the user's NotebookLM RAG>` resolves tokens in memory (template untouched; file deleted after the batch); `fillForm` opt-in `{ map, strict }`: no `{{` typed, whole-word matches, years-with-a-tool not in `skill_years` → UNKNOWN, no blind radio/select; `--submit` requires `--answers` + a token-free review step; `RESULT` status line; external applies never filled under `--submit`. Default (no ctx) unchanged — verified on a `data:` page (legacy output identical); consumers `node --check` + `field-types.test` 18/18 |
| 2026-11-18 | LinkedIn Easy Apply (`--submit`) | (owner request) forms can plant AI-detection traps — hidden honeypot fields, instructions addressed to an AI, "type the word X to prove you're human" — an unattended bot would fill/obey them and give itself away | strict fill answered every visible-or-not control and had no notion of AI-addressed text | `fillForm` strict only: hidden control/question (display/visibility/opacity/aria-hidden, zero size, off-screen, clip, ~0 font, colour≈bg) → never filled (`AI_TRAP_HIDDEN`, logged); `HUMAN_CHECK_RE` (EN+ES) → never auto-answered (`HUMAN_CHECK`) → `apply-from-linkedin` stops `RESULT NEEDS_HUMAN`, the USER answers in the open tab, then `--resume`. Default (no ctx) unchanged — legacy output byte-identical to the original on a `data:` page; consumers `node --check` + `field-types.test` 18/18 |
