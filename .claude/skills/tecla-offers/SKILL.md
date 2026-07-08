---
name: tecla-offers
description: Tecla (app.tecla.io) as a source node in GARY's application network — a LATAM→US remote tech-talent marketplace (USD-paid) where applying is profile-based + AI-matched behind a 4-stage vetting/English gate. How to source/triage REMOTE-worldwide roles and why apply is NOT auto-fillable (open-and-hand-off, the user's click). Use when sourcing or deciding whether to apply to Tecla offers.
---

# Tecla — source node

> **Candidate-agnostic.** Canonical rules: `docs/operating-rules.md`; per-board runbook:
> `docs/career-ops-map.md §4`.

Tecla (`app.tecla.io` / `tecla.io`) is one website node in GARY's application network. The canonical
candidate rules, hard rules (two-way-fit gate), the per-offer workflow, and CDP/network architecture
live in **`gary-job-search`** + **`docs/operating-rules.md`**; every candidate fact (stack, YOE, gap
skills, comp floor, English level, EEO, standard answers) is DATA — query the **NotebookLM RAG** (via
`notebooklm-ai-plugin`) or read `config/profile.yml` / `cv-data.md` as the derived cache. This skill
does NOT duplicate them — only what is Tecla-specific.

## What Tecla is
A **LATAM→US remote/nearshore tech-talent marketplace** ("Hire the best tech & AI talent across the US
and LATAM"). It connects vetted Latin-American engineers (50k+ across 18+ countries) to **remote roles,
mostly at US companies**, paid **in USD**. Candidate-free (no fees to join or get hired). Three lines:
nearshore staff augmentation, AI recruiting, executive search. It is **AI-match driven** ("create a
profile and let opportunities come to you"), not an open free-apply ATS board. This is a **vetting-gated
marketplace**: the candidate is *selected into* a shortlist, not free-applying to a form.

## (1) BLOCKS / anti-bot
- **Login-gated, no anonymous API.** The job board lives at **`app.tecla.io/jobs`**, a **JS-rendered
  SPA**; the public HTML exposes no anonymous job feed and probed API paths (`/api/jobs`, etc.) return
  empty/404. **There is NO anonymous REST API to pull offers from** (unlike getonbrd/himalayas). To see
  jobs you must be a signed-in candidate with a completed profile.
- **Vetting gate (4 stages).** The pipeline is gated by **AI screening → technical assessment →
  recruiter interview (tests English fluency) → reference checks.** The recruiter/English screen is an
  unavoidable human step and is higher-risk for a candidate below the English level a posting demands —
  flag any posting requiring above the candidate's DATA level (`config/profile.yml` → English level).
- **One-time completed-profile prerequisite.** Tecla yields nothing until the user has a completed
  candidate profile (signup + CV + profile fields) — completeness drives AI matches. Surface this
  prerequisite ONCE, then treat it as done.
- **Mitigation:** since sourcing is login-gated, source over the logged-in **automation browser** (debug
  Chrome, default port `9333` — DATA in `config/profile.yml` → `job_search.automation_browser`), NOT
  anonymous WebFetch. The user's personal browser is OFF-LIMITS. Serialize with the other CDP nodes.

## (2) AUTOMATION — profile-based one-click apply, vetting-gated → NOT auto-fillable (open-and-hand-off)
Classification: **one-click profile apply behind a multi-stage vetting + English gate** (same family as
getonbrd "Postular" / VanHack — NOT an anonymous ATS form). Concretely:
1. **Apply = profile-based one-click / expression of interest** — it submits the saved Tecla profile +
   CV, **no per-role ATS form fields to auto-fill** → nothing for the filler engine to do (**0% auto-fill**).
2. **4-stage vetting shapes the outcome** (AI screen → technical assessment → recruiter/English
   interview → reference checks) — the recruiter/English screen is an unavoidable human step.
3. That click + the screen behind it = the **application** → per the hard rules it is **the user's
   click, never the agent's.** Recruiters/AI forward shortlists to companies, so there is **no
   anonymous-ATS surface to partially fill** (unlike LinkedIn external-ATS / JazzHR).
- **Auto-fill feasibility: NONE.** **Recommended pattern: open-and-hand-off (manual).** GARY's only
  automatable contribution is *finding/triaging* matches; profile setup, the apply click, the
  English/recruiter screen, and assessments are all the user's. The agent (`job-apply-prep`) OPENS each
  match in the automation browser and STOPS.

## (3) PAGINATION (inside the logged-in job list)
- Jobs surface two ways: **(a) AI match push** — the more complete the profile, the more matches; and
  **(b) a filterable job list (pull)** by role, seniority, and **work arrangement (remote)**. A **"Salary
  Wizard"** exposes USD comp data.
- **No documented URL-param search contract** to drive headlessly. Treat `/jobs` as a logged-in UI
  surface, not a queryable endpoint. Filter in-app for **remote + senior + the candidate's stack**,
  paginate the whole logged-in list, and apply the **≤1-week recency** rule yourself from the card date
  (Tecla has no reliable public date filter).

## (4) WEBFETCH FILTERING
- Tecla is **login-gated → anonymous WebFetch cannot read the job feed or a real JD** (SPA + no public
  API). Sourcing is **logged-in CDP over the automation browser**, NOT WebFetch. Do not rely on a guest
  WebFetch to validate an offer — open the real JD inside the signed-in session and validate location,
  comp, YOE, English requirement, and open/closed status there.

## Triage — two-way-fit gate, REMOTE-WORLDWIDE scope
Run the standard gate (`docs/operating-rules.md §1` hard rules), but **do NOT geo-limit by the company's
country.** Tecla's whole purpose is connecting LATAM talent to remote roles (often US companies), so the
company being US/elsewhere is **irrelevant** — only "remote-workable from the candidate's country"
matters. Apply to ANY-country remote role meeting the mandatories:
- **Remote** (Tecla roles generally are) AND **hireable remotely from the candidate's country**. Reject
  ONLY **region-LOCKED** roles that explicitly **exclude the candidate's country** (e.g. "US-only /
  E-Verify / US work authorization", "EU-residents only"). A US company hiring remote-LATAM/
  Americas/worldwide = PASS.
- **Comp:** ≥ the comp floor in `config/profile.yml` (Tecla pays USD — use the Salary Wizard / posting
  band; convert annual → monthly). Unknown ≠ below floor (keep, confirm early).
- **Seniority / profile fit:** Tecla skews senior (good fit). Reject roles above the candidate's total
  YOE and **backend-specialist** roles demanding more backend years than the candidate has (total YOE ≠
  domain YOE) — read the profile from the NotebookLM RAG / `cv-data.md`.
- **Req-fit** against the candidate's real stack (RAG / `cv-data.md`). Reject roles whose CORE is a gap
  skill (gap skills are DATA in the RAG / `cv-data.md`).
- **English:** the recruiter interview tests spoken English — flag any posting demanding a level above
  the candidate's DATA level (`config/profile.yml`). Company already in `data/applications.md` → skip
  (one app per company).

## How the orchestrator uses this node
1. **Lower-priority, CDP-serialized + setup-dependent node.** No public API + login-gated + zero
   auto-fill → it sits behind the auto-fillable channels (LinkedIn Easy Apply / external ATS) that carry
   the auto-apply target; Tecla contributes **0% auto-fill** (open-and-hand-off only).
2. **One-time setup reminder (surface once):** Tecla yields nothing until the user has a **completed
   candidate profile** (signup + CV + profile fields). Prompt them to finish it before this node is
   worth running.
3. **Sourcing (logged-in CDP, serialized):** filter `/jobs` to **remote + senior + the candidate's
   stack**, triage with the gate above (no geo-limit), and merge survivors into the canonical
   **`data/offers-master.md`** (per `operating-rules.md §3`): `Company | Title | Remote-eligible? (PASS
   unless region-locked-excl-candidate) | Comp USD/mo | Apply URL | fit note`.
4. Hand survivors to **`job-apply-prep`**, which **OPENS** each match in the automation browser and
   **STOPS** (the user's profile-apply click + any English/recruiter screen). After the user confirms an
   apply, flip the tracker row Evaluated → Applied (never before).

## Cross-references (don't duplicate here)
- Candidate facts, skills+YOE, gap skills, comp floor, English level, EEO, standard answers → NotebookLM
  RAG (`notebooklm-ai-plugin`) / `config/profile.yml` / `cv-data.md`.
- Hard rules, per-offer workflow, network architecture, CDP serialization → `gary-job-search` +
  `docs/operating-rules.md`; per-board runbook → `docs/career-ops-map.md §4.7`.
- Sibling profile-apply / vetting-gated nodes (one-click, no fields, hand-off) → `vanhack-offers`,
  `xpertdirect-offers`, `getonbrd-offers`.
