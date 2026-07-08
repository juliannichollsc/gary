# Spec 08 — Guided Tutorial (7-step overlay over the real app)

> Objective: a short, **7-step guided tutorial** that overlays the REAL app views with a modal/dimmed
> background and floating explanatory text. Reachable from a **"? Tutorial" button in every view's header**
> (top-right). Non-technical, friendly copy. GSAP motion per `design-system.md §5`; honors reduced-motion.
> Owner: Julián Nicholls (@jnichollsc). Author frontmatter rule applies to any new authored files.

## UX summary
- The tutorial is an **overlay on top of the real app**, not separate mock screens. Each step **navigates the
  real app** to the relevant surface (a real view / onboarding sub-step / the sidebar), dims everything with a
  **scrim (modal background)**, and shows a **floating text card** explaining that surface.
- **Controls** on every step:
  - **Cancelar** — an ✕ in the card corner. Closes the tutorial and **returns to the exact view the user was in
    before opening it** (`viewBeforeTutorial`).
  - **Skipear tutorial** — a text button in the **center/bottom** of the card. Same effect as Cancelar (ends +
    restores). It exists as an explicit "skip the whole thing" affordance.
  - **Continuar** — advances to the next step. On the **last step** it is replaced by **Finalizar tutorial**,
    which ends + restores like Cancelar.
  - (Nice-to-have) a small **"Paso n de 7"** progress indicator + dots.
- The scrim has `pointer-events: all` so the underlying real view **cannot be clicked** during the tutorial
  (prevents accidental ingest/connect/etc.). Interaction happens only through the tutorial card buttons.

## The 7 steps (canonical copy = Spanish; translate to EN·PT·DE·ZH — **"GARY" is NEVER translated**)
Each step = `{ view, onbStep?, titleKey, bodyKey }`. `onbStep` forces the OnboardingView sub-step.

| # | Surface (view) | onbStep | Title (ES) | Body (ES) |
|---|----------------|---------|-----------|-----------|
| 0 | *(keep `viewBeforeTutorial` behind)* | — | **Te damos la bienvenida a GARY** | GARY es una **aplicación de escritorio** que trabaja de la mano del **agente LM que uses** para **buscar empleos alineados a tu perfil**. En 6 pasos te mostramos cómo funciona. |
| 1 | `onboarding` | 1 (Subir CV) | **Tu CV construye tu NotebookLM** | Al agregar tu CV se construye un **NotebookLM**: es como un **cuaderno** donde guardamos tu información para que el agente la use al buscar empleos. Cuando quieras puedes cargar un **nuevo CV** y hacer el proceso de **actualización**. |
| 2 | `onboarding` | 3 (Preguntas típicas) | **Preguntas típicas** | Estas son las **preguntas típicas** de las ofertas. Cualquier otra se considera **dinámica**: el agente la analizará **después de preguntarte** y la **recordará** para no volver a preguntarla. |
| 3 | `onboarding` | 4 (Mapa de roles) | **Mapa de roles** | Aquí se **almacenan tus roles** luego de que el agente hace el **mapeo** de tu perfil y las ofertas. |
| 4 | `chat` *(highlight the Sidebar → Conexiones)* | — | **Conexiones** | Aquí inicias la **conexión con los sitios** soportados por el proyecto para **filtrar ofertas**. Cualquier duda sobre **cómo se filtra** —o cuáles reglas son **mandatorias**— puedes consultarla al **agente LM**. |
| 5 | `settings` | — | **Ajustes** | Elige el **navegador** con el que GARY **levantará los procesos** de automatización y el **idioma**. **Abrir NotebookLM** te lleva a donde se guarda tu información: **inicia sesión** ahí para que recuerde tu acceso y lo use en las automatizaciones. |
| 6 | `chat` | — | **Chat** | Esto es una **terminal**: aquí **inicias sesión** con tu agente. Pídele que **filtre o busque ofertas con tu CV** desde el notebook y **empezará a buscar**. *(último paso → botón **Finalizar tutorial**)* |

## Architecture
Add a small **tutorial context** owned by `App.tsx` (it must drive `view` + the onboarding sub-step, and
remember/restore the prior view). Suggested files:
- `src/tutorial.tsx` — `TutorialProvider` + `useTutorial()` hook. State: `active`, `step` (0..6),
  `viewBeforeTutorial`. API: `start()` (records current view, `active=true`, `step=0`), `next()`, `back()`,
  `skip()`/`cancel()`/`finish()` (all → `active=false`, restore `viewBeforeTutorial`). Export
  `TUTORIAL_STEPS` (the table above as data) so the overlay and App read the same source.
- `src/components/TutorialButton.tsx` — the header button: `btn btn--ghost btn--sm` (same border style as the
  Conexiones buttons) with a **HelpCircle "?" icon** + label `t("tut.button")`. `onClick={start}`.
- `src/components/TutorialOverlay.tsx` — the scrim + floating card + controls. Rendered once at App root when
  `active`. GSAP: scrim fades in; card scales 0.96→1 + fade (design-system §5 "Modal open"); step→step =
  crossfade/slide the card; exit ~65% faster; ALL wrapped in `gsap.matchMedia()` honoring
  `prefers-reduced-motion` (reduced = instant opacity, no movement). Use `@gsap/react` `useGSAP`.
- CSS in `src/styles/app.css` (token-only, AA contrast, `focus-visible`): `.tut-scrim`, `.tut-card`,
  `.tut-card__title/__body/__controls`, `.tut-progress`, `.viewhead__tutorial` (right-aligned button).

### Wiring in `App.tsx`
- Wrap the shell in `<TutorialProvider>`; render `<TutorialOverlay/>` as a sibling of `<main>`.
- Compute the **effective view**: `active ? TUTORIAL_STEPS[step].view : view`. Pass it to `<Sidebar>` +
  the view switch. Step 0 keeps `viewBeforeTutorial` behind.
- Pass `TUTORIAL_STEPS[step].onbStep` to `<OnboardingView forceStep=… tutorial />` when the effective view is
  `onboarding` during the tutorial.

### `OnboardingView` changes (guard side effects during the tutorial)
- New optional props: `forceStep?: number`, `tutorial?: boolean`.
- When `forceStep` is set → a `useEffect` sets the internal `step` to it.
- When `tutorial` is true → **skip** the `persist({step})` effect (do NOT overwrite the user's saved step) and
  the **step-2 auto-open-browser effect** (harmless here since step 2 is never a tutorial page, but guard it
  anyway). Do NOT trigger `startIngest`. The scrim blocks interaction, so the view is display-only.

## Tutorial button placement
Add `<TutorialButton/>` to the `.viewhead` header of **every** view: `ChatView`, `OffersView`, `MetricsView`,
`SettingsView`, `OnboardingView`, and `Placeholder`. Right-align it (`margin-left:auto`, or share the row with
the existing lang picker / badge). It must be visible in all of them.

## i18n keys (add to ALL 5 dicts in `src/i18n.ts`; "GARY" never translated)
`tut.button` (localized "Tutorial" / ZH 教程), `tut.cancel`, `tut.skip`, `tut.next`, `tut.finish`,
`tut.progress` (e.g. "Paso {n} de {total}" — use a simple replace), and per step
`tut.intro.title/body`, `tut.s1.title/body` … `tut.s6.title/body`. Suggested EN:
- `tut.button`: "Tutorial" · `tut.cancel`: "Cancel" · `tut.skip`: "Skip tutorial" · `tut.next`: "Continue" ·
  `tut.finish`: "Finish tutorial" · `tut.progress`: "Step {n} of {total}".
- PT: "Pular tutorial"/"Continuar"/"Finalizar tutorial"; DE: "Tutorial überspringen"/"Weiter"/"Tutorial
  beenden"; ZH: "跳过教程"/"继续"/"完成教程". Titles/bodies: translate the ES copy above faithfully, non-technical.

## Icon
Add a `HelpCircle` (circle + "?") to `src/icons.tsx` following the existing inline-SVG pattern (the `S()` helper,
`currentColor`, 24×24 default). Use it in `TutorialButton`.

## Acceptance criteria
1. `pnpm exec tsc --noEmit` is GREEN.
2. A **"? Tutorial"** button (ghost, "?" icon, localized label) shows in the header of every view.
3. Clicking it dims the whole app (scrim) and shows the **welcome** card (step 0) with **Cancelar**, **Skipear
   tutorial**, **Continuar**.
4. **Continuar** walks steps 1→6, navigating the real app to: Onboarding·CV → Onboarding·Preguntas →
   Onboarding·Mapa de roles → Chat (Conexiones highlighted) → Ajustes → Chat. No real ingest/connect fires.
5. Step 6 shows **Finalizar tutorial**. **Cancelar / Skipear / Finalizar** all close the overlay and return to
   the **exact view the user was in before starting** the tutorial.
6. All strings exist in EN·ES·PT·DE·ZH; "GARY" never translated. Motion honors `prefers-reduced-motion`.
7. Everything token-driven (no hardcoded colors), AA contrast, keyboard-operable (Esc = cancel, focus-visible).
