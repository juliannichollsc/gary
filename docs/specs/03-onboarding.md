# Spec 03 — Onboarding

> Screen: `pencil/gary.pen` prompt 4. Components: `components.md` §E. Builds the NotebookLM RAG.

## Scope
3-step stepper: **Subir CV → Iniciar sesión e ingestar en NotebookLM (RAG) → Mapa de roles**.
- **CvUpload** — drag-drop + browse; file chip (name/size), replace/remove.
- **NotebookLMLoginBanner** — explicit callout asking the user to sign in to NotebookLM before ingest starts.
- **IngestProgress** — progress bar + mono status log ("Inicia sesión en NotebookLM…", "Creando notebook…",
  "Indexando CV…", "Mapeando roles…"). Ingest is done by the terminal CLI via the `notebooklm-ai-plugin`
  skill — the UI reflects progress, it does not call an LLM API.
- **RoleMap** — cards per detected role variant (frontend / fullstack / backend) with stack chips; editable.

## The point (NotebookLM RAG)
This stage **creates the candidate context**: the CV + later Q&A are consolidated and optimized into a
NotebookLM notebook so agents always query one optimal, deduped, never-re-asked context. No static per-user
files, no hardcoding.

## Acceptance criteria
- Uploading a CV, confirming the NotebookLM login state, and running ingest produces a NotebookLM notebook
  and a role map (functional stub OK for a first pass, but wired to `notebooklm-ai-plugin`). Continue is
  disabled until each step is valid.
- **The current step PERSISTS across restarts.** `OnboardingState.step` is saved (LS + Rust settings); if
  the user closes the program mid-wizard, reopening resumes at the saved step — not step 1. (Sidebar
  `resume` still jumps to the role map; the saved step drives only the normal fresh-open path.)
- **Candidate data goes to NotebookLM, not local files** (business-rules §2): onboarding only ingests the
  CV + answers into the RAG; it never seats PII into `config/profile.yml` or other templates.
- Matches prompt 4 both themes; AA; keyboard-operable stepper.
