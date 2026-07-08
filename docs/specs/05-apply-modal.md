# Spec 05 — Apply / review modal — ❌ CANCELLED (2026-07-02)

> **This spec is CANCELLED and NOT implemented.** Owner decision: there is **no apply modal**. Everything it
> would show — the tailored-CV path GARY creates, the ATS-specific CV, and each **dynamic screening
> question** — is surfaced by the supervisor **in the Chat**. Flow: apply engine hits an unknown/required
> question → STOPS and lists it → supervisor asks the user in chat → answer is `learn()`'d to
> `config/apply-fieldmap.json` + the NotebookLM RAG → engine re-runs with **`--resume`** on the already-open
> site. The **Submit-guard notice** ("GARY no envía — el click final es tuyo") moves to the offers/chat
> apply-initiation surface (already present on the Offers map view). LinkedIn Easy Apply is the one node that
> can auto-send, and only via the explicit opt-in `--submit` flag (per-offer user authorization).
>
> The original spec is kept below for history only.

---

> Screen: `pencil/gary.pen` prompt 6. Components: `components.md` §G. The Submit guardrail lives here.

## Scope
- **ApplyModal** — `elev-3` modal + scrim (40–60%), scales from trigger. Header = company/role.
- **SubmitGuardBanner** — **persistent, high-contrast**: "GARY NO envía — el click final es tuyo." Always
  visible at the top. This is a hard product + a11y rule.
- **CvAttachment** — tailored CV filename + variant badge + Ver/Regenerar.
- **DraftAnswers** — screening Q + editable draft answer (textarea), source-cited from NotebookLM.
- **ApplyActions** — "Abrir en navegador y llenar hasta Submit" (primary) · "Cerrar". **No Submit button
  exists anywhere in the modal.**

## Acceptance criteria
- Modal opens from an offer row, shows the tailored CV + draft answers, and the guard banner is always
  visible. The primary action fills the external form to the Submit step via the engines and stops. There
  is **no** Submit/Enviar control. Esc closes; focus trapped; both themes; AA.
