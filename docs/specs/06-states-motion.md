# Spec 06 — Global states + GSAP motion

> Screen: `pencil/gary.pen` prompt 7. Components: `components.md` §H. Motion = design-system §5.

## Scope
- **States:** `EmptyState` (paw hero + action), `LoadingState` (skeleton/paw loader), `ErrorState`
  (cause + retry, never a dead end), `OfflineState` (CDP/browser down), `Toast` (success/warning/danger/info,
  slide-up, auto-dismiss, `aria-live`). Status never by color alone.
- **Motion (GSAP suite):** app boot paw draw + wordmark, chat message in, streaming 3-dot bounce, sidebar
  nav pill Flip morph, connection→connected overshoot, onboarding progress, offer row stagger + score fill,
  modal open/exit (exit ~65% faster), toast, hover paw wag. Animate `transform`/`opacity` only; 1–2 elements
  per view; everything wrapped in `gsap.matchMedia()` honoring `prefers-reduced-motion`.

## Acceptance criteria
- Each state renders per prompt 7 in both themes with a recovery path where relevant. Motion is tasteful,
  interruptible, non-blocking, and fully disabled under `prefers-reduced-motion` (instant opacity, no move).
