# {{CANDIDATE_NAME}} — Master Profile (AI-optimized data doc) — TEMPLATE

> **Candidate-agnostic TEMPLATE.** The real source of truth is the **NotebookLM RAG** (built from the
> user's CV + accumulated Q&A). This file is a *derived, human-readable cache* — GARY ships it full of
> `{{PLACEHOLDER}}` tokens and (re)generates the values at onboarding from the base CV. Never hand-edit
> real PII into an open-source checkout. The machine-actionable answers live in
> `config/apply-fieldmap.json` (matchers + policy FILL/FLAG/ASK_USER + `skill_years`).

## Identity & contact
- **Name:** {{CANDIDATE_NAME}}
- **Headline:** {{HEADLINE}}
- **Email:** {{EMAIL}} · **Phone:** {{PHONE_E164}} (country code {{PHONE_COUNTRY_CODE}}, {{COUNTRY}})
- **Location:** {{CITY}}, {{STATE}}, {{COUNTRY}} · Postal {{POSTAL_CODE}} · Address: {{ADDRESS}}
- **Timezone:** {{TIMEZONE}}
- **LinkedIn:** {{LINKEDIN_URL}} · **GitHub:** {{GITHUB_URL}}
- **Languages:** {{NATIVE_LANGUAGE}} (Native), English ({{ENGLISH_LEVEL}})
- **EEO (self-ID, user-given):** Gender {{EEO_GENDER}} · Pronouns {{EEO_PRONOUNS}} · Ethnicity {{EEO_ETHNICITY}} · Veteran {{EEO_VETERAN}} · Disability {{EEO_DISABILITY}}
- **Education:** {{EDUCATION}} (on a fixed-scale dropdown, pick the closest HONEST option — never upgrade to a degree not held)

## Targeting & hard rules
- **Total experience:** {{TOTAL_YOE}} years ({{PROFILE_SHAPE}}). Seniority: {{SENIORITY}}. Skip junior/entry/intern and 10+ yrs roles.
- **Employment:** {{EMPLOYMENT_TYPE}}.
- **Comp:** **{{SALARY_MIN}} {{SALARY_CURRENCY}} MINIMUM** (or equivalent in any currency — convert before testing). Target {{SALARY_RANGE}}; unknown comp = keep, confirm early.
- **Location policy:**
  - **Remote: anywhere** — as long as the working language is a candidate working language (from `config/profile.yml → job_search.language`). If English level is below C1, reject roles mandating C1/C2 or a third language.
  - **Hybrid: only in {{CITY}}.**
  - **On-site: only in {{CITY}} — OR relocation if the company sponsors a visa** (visa/relocation stance in `config/profile.yml → location`).
- **Eligibility:** hireable remotely from {{COUNTRY}} (Remote-LATAM / Americas / Worldwide / remote-global). The company's country is IRRELEVANT — only "remote-workable from {{COUNTRY}}" matters. Reject only region-LOCKED roles that exclude {{COUNTRY}} (US-only / E-Verify / US-work-auth / EU-only / …).
- **Availability:** {{AVAILABILITY}}.
- **Profiles / tech / scope:** {{TARGET_ROLES}}. Stack (positive signals): {{POSITIVE_STACK}}. **Gaps (never claim, = 0 YOE):** {{GAP_SKILLS}}.
- **Differentiator:** {{DIFFERENTIATOR}}.

## Skills with grounded YOE (never inflate)
> Populate from the CV/RAG. Every skill = an integer YOE; any skill the CV does NOT support = **0**.
> This table mirrors `config/apply-fieldmap.json → skill_years`.

| Skill | Years | | Skill | Years |
|-------|-------|-|-------|-------|
| {{SKILL_1}} | {{N}} | | {{SKILL_2}} | {{N}} |
| … | … | | {{GAP_SKILL}} | **0** |

**Rule for "combined database experience (number)":** sum the YOE of the specific databases asked.

## Experience
### {{ROLE}} — {{COMPANY}} ({{DATES}}, {{MODALITY}})
- {{IMPACT_BULLET}}
- {{IMPACT_BULLET}}
- Stack: {{STACK}}
<!-- repeat per role, most recent first -->

## Certifications
- {{CERTIFICATION}}

## Proof points / talking points (for cover letters & screening)
- {{PROOF_POINT}}

## Standard application answers
- How did you hear: {{HEARD_FROM}} · Authorized to work in {country}: **ASK_USER** · Require sponsorship: **ASK_USER** · Willing to relocate: {{RELOCATION_ANSWER}} · Comfortable remote: {{REMOTE_OK}} · Immediate joiner: {{IMMEDIATE_JOINER}}.
- Interview availability: {{INTERVIEW_AVAILABILITY}}.

> The machine-actionable version of these answers lives in `config/apply-fieldmap.json` (matchers +
> policy FILL/FLAG/ASK_USER + `skill_years`). This doc is the human-readable master cache; the RAG wins.
