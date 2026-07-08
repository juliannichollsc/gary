---
name: vanhack-offers
description: VanHack (vanhack.com) as a source node in GARY's application network — a vetting-gated, relocation-first marketplace for international developers. How to source/triage offers and why apply is NOT auto-fillable (profile-based + a hard recorded-3-video gate + AI/recruiter screen). Use when sourcing or deciding whether to apply to VanHack offers.
---

# VanHack — source node

> **Candidate-agnostic.** Canonical rules: `docs/operating-rules.md`; per-board runbook:
> `docs/career-ops-map.md §4`.

VanHack (`vanhack.com`) is one website node in GARY's application network. The canonical candidate
rules, hard rules, and the two-way-fit gate live in **`gary-job-search`** + **`docs/operating-rules.md`**;
every candidate fact (stack, YOE, gap skills, comp floor, English level, relocation policy) is DATA —
query the **NotebookLM RAG** (via `notebooklm-ai-plugin`) or read `config/profile.yml` / `cv-data.md` as
the derived cache. This skill does NOT duplicate them; it documents only what is VanHack-specific.

## What VanHack is
A **curated, vetting-gated hiring marketplace for international/senior software engineers**, built around
**relocation + visa sponsorship**. Its own framing: "the majority of our jobs sponsor work permits and
relocation; we also have remote-only positions if you'd rather stay put." An AI recruiter (**"Vanna"**)
auto-matches candidates to jobs and scores profiles; expert recruiters validate shortlists before
companies see them. So it is **not an open job board** — it is a managed talent-pool where the candidate
is *selected into* a shortlist, not where they free-apply to an ATS.

## (1) BLOCKS / anti-bot
- **Login-gated, no anonymous API.** Browsing/applying to jobs requires a signed-in candidate account
  with a completed profile; the public `/jobs` page is JS-rendered and exposes no anonymous job feed or
  public API (sparse HTML, no usable endpoint). Unlike GetOnBoard/Himalayas, **there is no anonymous
  REST API to pull offers from.**
- **HARD pre-apply video gate.** Before applying to ANY job, the candidate must record and submit
  **three short verification videos** (talking about themselves, skills, experience) = VanHack's
  English/identity check. This is an **unavoidable human step — not automatable, must be the user's.**
- **Vetting gate.** Even after applying, Vanna + expert recruiters screen and forward shortlists; a live
  English screen is higher-risk for a candidate below the level a posting demands — flag postings
  requiring above the candidate's DATA level (`config/profile.yml` → English level).
- **One-time setup prerequisite** — the 3 videos + a completed profile. Surface this ONCE; the node
  yields nothing until it is done.
- **Mitigation:** source over the logged-in **automation browser** (debug Chrome, default port `9333` —
  DATA in `config/profile.yml` → `job_search.automation_browser`), NOT anonymous WebFetch. The user's
  personal browser is OFF-LIMITS. Serialize with the other CDP nodes.

## (2) AUTOMATION — profile-based apply, hard video gate, vetting-gated → NOT auto-fillable (open-and-hand-off)
Classification: **one-click profile apply behind a hard video gate + vetting/recruiter screen.**
Concretely:
1. **Hard pre-apply gate:** the 3 verification videos above — unavoidable, the user's, **not automatable**.
2. **Apply itself is profile-based one-click** (like GetOnBoard "Postular"): it submits the saved profile
   + CV, **no ATS form fields to auto-fill** → nothing for the filler engine to do (**0% auto-fill**).
3. That click + the screen behind it = the **application**, so per the hard rules it is **the user's
   click, never the agent's.** Even the apply doesn't go straight to the company — Vanna/recruiters
   screen and forward, so there is no anonymous-ATS surface to partially fill (unlike LinkedIn
   external-ATS / JazzHR).
- **Auto-fill feasibility: NONE.** **Recommended pattern: open-and-hand-off (manual),** same family as
  getonbrd. GARY's only automatable contribution is *finding/triaging* matches; the video gate, the
  apply click, and any recruiter call are all the user's. The agent (`job-apply-prep`) OPENS each match
  in the automation browser and STOPS.

## (3) PAGINATION (inside the logged-in job list)
- Jobs are surfaced two ways: **(a) Vanna match score** (push — the more complete the profile, the more
  matches) and **(b) a filterable job list** (pull) by role, seniority (it markets "senior, 5–10 yrs"),
  and **work arrangement: relocation/visa-sponsored vs remote-only**.
- No documented URL-param search contract to drive headlessly. Treat the job list as a logged-in UI
  surface, not a queryable API. Paginate the whole logged-in list and apply the **≤1-week recency** rule
  yourself from the card date (no reliable public date filter).

## (4) WEBFETCH FILTERING
- VanHack is **login-gated → anonymous WebFetch cannot read the job feed or a real JD** (SPA + no public
  API). Sourcing is **logged-in CDP over the automation browser**, NOT WebFetch. Validate the real JD
  (location, sponsorship, comp, YOE, English requirement, open/closed) inside the signed-in session, not
  from a guest fetch.

## Triage — two-way-fit gate, with the relocation/visa nuance (apply only if BOTH hold)
Run the standard gate (`docs/operating-rules.md §1` hard rules), but VanHack inverts the usual location
default, so apply the location rule carefully:
- **Relocation-required roles:** ELIGIBLE **only if the posting sponsors a visa** — which on VanHack is
  the norm ("majority sponsor work permits + relocation"), so most relocation jobs PASS the location rule
  (relocation OK only with sponsorship; the candidate has a passport and would relocate — DATA in
  `config/profile.yml`). **Always confirm the specific posting sponsors** — don't assume; **flag it
  explicitly to the user** since it means leaving the candidate's country.
- **Remote-only roles:** apply the normal eligibility rule — must be hireable from the candidate's
  country (LATAM/Americas/Worldwide). Region-locked remote (EU-only, US E-Verify) → reject.
- **Seniority / profile fit:** VanHack skews senior (good fit); still reject roles above the candidate's
  total YOE and backend-specialist roles demanding more backend years than the candidate has (total YOE
  ≠ domain YOE) — read the profile from the NotebookLM RAG / `cv-data.md`.
- **Comp:** the comp floor in `config/profile.yml`; relocation packages are often annual +
  local-currency — convert and confirm against the floor; unknown ≠ below floor (keep, confirm early).
- **English:** the role/screen may demand more than the candidate's DATA level; the video gate itself
  tests spoken English — flag if a posting requires above that level.
- **Profile gaps:** reject roles whose CORE is a gap skill (gap skills are DATA in the RAG / `cv-data.md`).
  Company already in `data/applications.md` → skip (one app per company).

## How the orchestrator uses this node
1. Because sourcing is login-gated with no public API, VanHack is a **lower-priority, CDP-serialized
   node** (behind the auto-fillable channels — LinkedIn Easy Apply / external ATS — which hit the
   auto-apply target; VanHack contributes 0% auto-fill).
2. If sourced (logged-in CDP, serialized), merge survivors into the canonical **`data/offers-master.md`**
   (per `operating-rules.md §3`): `Company | Title | Relocation? + sponsors visa? | Remote-eligible? |
   Comp | Apply URL | fit note`, and hand to **`job-apply-prep`**, which OPENS each in the automation
   browser and STOPS.
3. **Pre-req reminder for the user, surfaced once:** they cannot apply to any VanHack job until they have
   recorded the 3 verification videos and completed their profile. Until then, VanHack yields nothing —
   prompt them to do that one-time setup before this node is worth running.
4. Every relocation offer opened → explicitly tell the user "this requires relocating to {country};
   confirm it sponsors a visa" before they apply. After the user confirms an apply, flip the tracker
   Evaluated → Applied (never before).

## Cross-references (don't duplicate here)
- Candidate facts, skills+YOE, comp floor, English level, **relocation-only-with-sponsorship policy** →
  NotebookLM RAG (`notebooklm-ai-plugin`) / `config/profile.yml` / `cv-data.md`.
- Hard rules, per-offer workflow, network architecture, CDP serialization → `gary-job-search` +
  `docs/operating-rules.md`; per-board runbook → `docs/career-ops-map.md §4.7`.
- Sibling profile-apply / vetting-gated nodes (one-click, no fields, hand-off) → `tecla-offers`,
  `xpertdirect-offers`, `getonbrd-offers`.
