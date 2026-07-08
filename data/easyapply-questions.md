<!--
  easyapply-questions.md — recurring Easy Apply / ATS screening-field preflight.
  Candidate-AGNOSTIC: this lists the CLASSES of question and the AUTO-vs-ASK policy; the actual answers
  are DATA in config/apply-fieldmap.json + the NotebookLM RAG (never hardcoded here). Ported &
  generalized from career-ops. Cross-refs: skill easyapply-autofill, config/apply-fieldmap.json,
  docs/career-ops-map.md §7 (ask-on-untracked → learn → continue).
-->

# Easy Apply / ATS screening fields — preflight (candidate-agnostic)

**Rule:** fill only REQUIRED fields (marked `*` on the form); omit optionals. Values resolve from
`config/apply-fieldmap.json` (matchers + `policy` FILL/FLAG/ASK_USER + `skill_years` + growing
`learned`) and the NotebookLM RAG. **Never fabricate** — a skill the candidate lacks = 0 / honest No.

## AUTO (known — filled automatically from the field map / RAG)
| Field class | Source / policy |
|---|---|
| Name / email / phone (+ country code) | `apply-fieldmap.json` FILL (from CV) |
| Address / city / state / postal / country | FILL (from profile) |
| LinkedIn / GitHub / portfolio URL | FILL |
| Resume / CV | attach the role-matched tailored variant (`engines/cv-builder.mjs`) |
| Skill set / stack | FILL (positive stack from the RAG) |
| Languages / English level | FILL (CEFR level from the RAG) |
| EEO self-ID (gender / pronouns / ethnicity / veteran / disability) | FILL (`profile.yml → job_search.eeo_self_id`) |
| Education | **FLAG** — pick the closest honest option in a fixed dropdown; NEVER upgrade to a degree not held |
| Salary expectation | FILL (band/floor + currency from `profile.yml → compensation`; match the form's period/currency) |
| Years per skill ("years of X") | FILL from `apply-fieldmap.json → skill_years` (grounded; gap skills = 0, never inflate) |
| Immediate availability / notice period | FILL/FLAG (from profile) |
| Stable learned screening answers (remote-ok, US-companies, startup exp, etc.) | FILL (from `learned[]`, grown over time) |

## ASK_USER (not grounded in the CV/RAG — ask by chat, then `learn()`)
- Work authorization in {country} / requires sponsorship / visa — **eligibility/legal, always ask.**
- Security clearance / background check / drug-test consent / criminal — **legal, always ask.**
- Years with a specific tech not in `skill_years` — ask, then add to `skill_years`.
- Willing to relocate — personal call (typically "only with visa sponsorship"); flag/ask.
- Version/recency requirements (e.g. "framework X 17+ used recently?") — per offer, ask.
- Mandatory C1/C2 English when the candidate is below → answer truthfully → it disqualifies → discard
  the offer (do NOT lie).
- Open company questions ("why are you interested…", cover letter) — ask/draft in the candidate's voice.

## How the system uses this file
1. The filler fills AUTO fields (required `*` only).
2. A required ASK_USER field appears unmapped → **STOP, surface it, the user answers in the terminal →
   `learn(matchTerms, value, source)` → `--resume`** (continues the SAME application). The answer is
   appended to `config/apply-fieldmap.json → learned[]` and mirrored into the NotebookLM RAG so it is
   never re-asked. This is the ask-on-untracked loop (career-ops-map §7) — **continue the postulation,
   don't abort.**
