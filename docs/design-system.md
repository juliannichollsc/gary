# GARY 🐾 — Design System

> The single source of truth for GARY's visual language. **Candidate-agnostic, model-agnostic.**
> Brand voice: *"tu copiloto que caza empleos"* — close & friendly, but professional and trustworthy.
> Authored for GARY by Julián Nicholls (@jnichollsc). Built with `ui-ux-pro-max` rules + the GSAP suite.
> Targets a **desktop window** (Tauri + React). Dark is the default theme; light is a first-class peer.

---

## 0. Brand foundations

| Aspect | Decision | Why |
|--------|----------|-----|
| **Name / mark** | GARY + the official dog/husky face isotipo | A copilot that *hunts* jobs — the frontal canine mark is distinctive, trustworthy, and immediately ties the product to the companion metaphor. |
| **Personality** | Calm competence. Friendly, never cute-to-a-fault. Speaks plainly, shows its work, never oversells. | It handles a stressful task (job hunting). Trust > flash. |
| **Tone in UI copy** | Spanish or English, short, encouraging, honest about limits ("GARY no envía; el click final es tuyo"). | Matches the operating rules (§2, §6) and reduces user anxiety. |
| **Style family** | **Warm dark-first product UI** — flat surfaces, soft elevation, one amber accent, generous whitespace, and richer brown neutrals inspired by the isotipo. | Reads professional without looking generic; the warmth comes from the mark, palette, and restrained motion. |
| **Mascot usage** | The isotipo appears as: the app avatar in the sidebar, GARY's chat message avatar, the onboarding hero, and a subtle loading mark. Used **with restraint** — never as a structural/nav icon (those are line icons). | `no-emoji-icons`: emoji are not used for controls; the isotipo is the brand asset and should be rendered from the official image/SVG source, not replaced with the 🐾 glyph in product UI. |

---

## 1. Color tokens

Colors are **semantic tokens**, never raw hex in components (`color-semantic`). Each token has a dark
and light value, designed **as a pair** (`dark-mode-pairing`). All foreground/background pairs below meet
**WCAG AA (4.5:1 body, 3:1 large/UI)** — verified per pair.

### 1.1 Accent — "Amber eye" (the brand color)

A warm amber drawn from the isotipo's eyes. It is the ONLY vivid accent; everything else comes from
deep black, rust-brown, white, and soft gray values derived from the mark. One accent keeps the UI calm
and the CTA unmistakable (`primary-action`).

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `--accent`          | `#CE812D` | `#CE812D` | Primary CTA, active nav, focus glow source, brand highlight |
| `--accent-hover`    | `#DEA152` | `#B3623D` | Hover on primary surfaces |
| `--accent-pressed`  | `#B86D1B` | `#9A532D` | Active/pressed |
| `--accent-soft`     | `rgba(206,129,45,0.18)` | `rgba(206,129,45,0.14)` | Tinted backgrounds (active nav pill, selected row) |
| `--accent-on`       | `#140D09` | `#FFFFFF` | Text/icon **on** an accent fill |

> Why amber and not blue: every dev tool is blue. Amber is warm + distinctive, reads "companion" not
> "enterprise", and ties directly to the eyes of the isotipo. The surrounding browns keep dark mode from
> feeling sterile while preserving AA contrast.

### 1.2 Neutrals — Warm brand ramp (surfaces & text)

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `--bg`              | `#120D0C` | `#F3F3F3` | App canvas |
| `--surface`         | `#1B1412` | `#FFFFFF` | Cards, panels, sidebar |
| `--surface-2`       | `#241A17` | `#F5ECE6` | Raised: chat input, modal, popover |
| `--surface-3`       | `#31211B` | `#EAD7CB` | Hover surface, code blocks |
| `--border`          | `#4A2C20` | `#D6BEB3` | Hairline dividers, card borders |
| `--border-strong`   | `#6A3B28` | `#C26942` | Input borders, focus-adjacent |
| `--text`            | `#F3F3F3` | `#1B1412` | Primary text (≥ 4.5:1 on bg/surface) |
| `--text-secondary`  | `#D6C5BD` | `#5D463D` | Secondary/labels (≥ 3:1) |
| `--text-muted`      | `#A0A09F` | `#786A63` | Hints, timestamps, disabled-adjacent |
| `--text-on-accent`  | `#140D09` | `#FFFFFF` | mirror of `--accent-on` |

### 1.3 Semantic status (functional color — always paired with an icon/text, `color-not-only`)

| Token | Dark | Light | Meaning |
|-------|------|-------|---------|
| `--success` / `-soft` | `#79C27A` / `rgba(121,194,122,.16)` | `#2F7D4B` / `rgba(47,125,75,.10)` | Connected ✓, applied `[x]`, success toast |
| `--warning` / `-soft` | `#CE812D` / `rgba(206,129,45,.16)` | `#CE812D` / `rgba(206,129,45,.10)` | Flag `[~]`, "verificando…", stretch fit |
| `--danger`  / `-soft` | `#E17E67` / `rgba(225,126,103,.16)` | `#B3623D` / `rgba(179,98,61,.10)` | Disconnected ✗, error, destructive |
| `--info`    / `-soft` | `#D7B08A` / `rgba(215,176,138,.16)` | `#8F634F` / `rgba(143,99,79,.10)` | Neutral info, streaming indicator |

### 1.4 Score scale (Mapa de ofertas, 0–5 two-way-fit)

A perceptual ramp danger→amber→success. Always shown as a number **and** color **and** filled-dot meter
(`color-not-only`, `pattern-texture`): `0–1.9` danger · `2–2.9` warning · `3–3.9` info · `4–5` success.
`4.0` is the apply threshold (operating-rules §6) — render ≥4.0 with a subtle accent ring.

### 1.5 Connection / login status (Sidebar "Conexiones")

`conectado ✓` → `--success` dot + label · `desconectado ✗` → `--danger` · `verificando…` → `--warning`
with a pulsing dot. Status is **never color-only**: dot + glyph (check / x / spinner) + text label.

---

## 2. Typography

Pairing chosen for a friendly-but-precise product (`font-pairing`, `weight-hierarchy`). All three are
variable Google fonts (`font-loading: swap`).

| Role | Font | Notes |
|------|------|-------|
| **UI / headings / body** | **Inter** (or system fallback) | Neutral, highly legible at small sizes, great for dense desktop UI. |
| **Brand wordmark / hero** | **Plus Jakarta Sans** (600/700) | Slightly rounder, warmer — used only for "GARY" wordmark and big empty-state headings. |
| **Mono (terminal, code, JD snippets, scores)** | **JetBrains Mono** | The chat is a terminal underneath; mono ties the two worlds. Also `number-tabular` for scores/comp. |

### Type scale (desktop, base 16px, `font-scale`, line-height `line-height` 1.5)

| Token | Size / line-height | Weight | Use |
|-------|--------------------|--------|-----|
| `display` | 32 / 40 | 700 (Jakarta) | Onboarding/empty-state hero |
| `h1` | 24 / 32 | 700 | Screen titles |
| `h2` | 20 / 28 | 600 | Section headers |
| `h3` | 16 / 24 | 600 | Card titles, group labels |
| `body` | 14 / 21 | 400 | Default UI/body text (desktop-dense; 16 reserved for chat messages) |
| `chat`  | 15 / 24 | 400 | Chat message text (comfortable reading) |
| `label` | 13 / 18 | 500 | Buttons, nav, form labels, chips |
| `caption` | 12 / 16 | 400 | Timestamps, helper text, meta |
| `mono` | 13 / 20 | 400 | Terminal, code blocks, scores, comp |

Body text never below 12px. Long-form (JD, chat) wraps rather than truncates (`truncation-strategy`);
single-line meta truncates with ellipsis + tooltip.

---

## 3. Spacing, radius, shadow, layout

### 3.1 Spacing — 4/8 rhythm (`spacing-scale`)
`space-1`=4 · `2`=8 · `3`=12 · `4`=16 · `5`=20 · `6`=24 · `8`=32 · `10`=40 · `12`=48 · `16`=64.
Section rhythm tiers: 16 / 24 / 32 / 48. Component inner padding default 12–16; card 16–20; modal 24.

### 3.2 Radius
`radius-sm`=6 (chips, inputs, small buttons) · `md`=10 (cards, buttons) · `lg`=14 (panels, modals) ·
`xl`=20 (hero/empty cards) · `full`=9999 (avatars, status dots, the accent nav pill, paw badge).
Consistent rounding = the "friendly" feel without skeuomorphism.

### 3.3 Elevation / shadow (consistent scale, `elevation-consistent`)
Dark mode leans on **borders + subtle bg lift** more than shadow (shadows read weak on dark). Light mode
uses soft shadows.

| Token | Dark | Light |
|-------|------|-------|
| `elev-0` | flat, `--border` hairline | flat, `--border` hairline |
| `elev-1` (card) | `--surface` + 1px border | `0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)` |
| `elev-2` (popover/dropdown) | `--surface-2` + border + `0 8px 24px rgba(0,0,0,.4)` | `0 4px 12px rgba(16,24,40,.10)` |
| `elev-3` (modal) | `--surface-2` + `0 16px 48px rgba(0,0,0,.55)` | `0 16px 48px rgba(16,24,40,.18)` |
| `focus-ring` | `0 0 0 3px var(--accent-soft)` + 1px `--accent` border | same |
| `scrim` (modal backdrop) | `rgba(2,6,12,.62)` | `rgba(16,24,40,.45)` | (40–60% per `scrim-and-modal-legibility`) |

### 3.4 App layout (desktop window, `adaptive-navigation`)
- **Sidebar** fixed left, `260px` (collapsible → `64px` icon-rail at window < 880px).
- **Main area** fluid, content max-width `880px` centered for reading screens (chat, onboarding); full-bleed for the offers map table.
- Min window: `960×640`; responsive breakpoints inside the window: `< 880` collapse sidebar, `< 720` stack modal/forms full-width.
- Z-index scale (`z-index-management`): base `0` · sticky header `10` · dropdown `20` · sidebar overlay `40` · modal scrim `100` · modal `110` · toast `1000`.

---

## 4. Interaction states

Every interactive element defines **hover · focus-visible · active/pressed · disabled · loading** in
**both themes** (`state-contrast-parity`). Transitions 120–180ms ease-out; press uses scale 0.98 (`scale-feedback`).

| State | Treatment |
|-------|-----------|
| **Hover** | Surface lifts one step (`--surface`→`--surface-3`) or accent brightens; cursor pointer (`cursor-pointer`). |
| **Focus-visible** | Always-visible `focus-ring` (3px accent-soft glow + accent border). **Never remove focus rings.** Tab order = visual order (`keyboard-nav`). |
| **Active/pressed** | `--accent-pressed` / `--surface` darker + scale 0.98, 90ms. |
| **Disabled** | opacity 0.45 + `not-allowed` cursor + `aria-disabled`; never looks tappable (`disabled-states`). |
| **Loading** | Buttons: inline spinner, label persists, button disabled (`loading-buttons`). Regions: skeleton shimmer for >300ms (`progressive-loading`). |
| **Selected** | `--accent-soft` fill + 2px left accent bar (nav, offer row). |

Touch/click targets ≥ 36px desktop (≥44 where the same UI may be touched); 8px min gap (`touch-spacing`).

---

## 5. Motion — GSAP micro-animations (tasteful, never excessive)

> Driven by the GSAP suite (`gsap-core`, `gsap-react` `useGSAP`, `gsap-timeline`, `gsap-scrolltrigger`).
> **Rules:** animate `transform`/`opacity` only (`transform-performance`); 1–2 elements per view
> (`excessive-motion`); enter `ease-out`, exit ~65% faster (`exit-faster-than-enter`); everything wrapped in
> `gsap.matchMedia()` honoring **`prefers-reduced-motion`** (`reduced-motion`) — reduced = instant opacity, no movement.

| Moment | Animation | Tokens |
|--------|-----------|--------|
| **App boot** | Paw mark draws in (SVG stroke via DrawSVG-style), wordmark fades up 8px. | 420ms, `power2.out`, once |
| **Chat message in** | User msg slides from right +8px/fade; GARY msg from left +8px/fade. | 180ms `power2.out` |
| **Streaming / "escribiendo"** | 3-dot paw-amber bounce (staggered 120ms) + soft caret blink in the bubble. | loop, 1.0s |
| **Sidebar nav switch** | Active accent pill morphs to the new item (shared-element via Flip); content crossfades. | pill 260ms `power3.inOut`, content 140ms crossfade |
| **Connection status → connected** | Dot scales 0.6→1 with a tiny overshoot + check draws in; row flashes `--success-soft`. | 300ms `back.out(2)` |
| **Onboarding progress** | Progress bar tweens width; step dots fill + check stamp (CustomBounce-lite). | width 500ms `power2.out` |
| **Offer row reveal** | Stagger rows in on load/filter (30–50ms each, `stagger-sequence`); score meter dots fill left→right. | 40ms stagger, dots 250ms |
| **Modal open** | Scrim fades; modal scales 0.96→1 + fade from trigger origin (`modal-motion`). Exit 65% faster. | enter 220ms `power3.out`, exit 140ms |
| **Toast** | Slide-up + fade, auto-dismiss 3–5s, `aria-live=polite` (doesn't steal focus). | 200ms in |
| **Hover paw idle** | Sidebar paw does a subtle 2° wag on hover (rotation), respects reduced-motion. | 300ms `sine.inOut`, yoyo once |

All animations are **interruptible** and never block input (`interruptible`, `no-blocking-animation`).
A global `motion` token set keeps duration/easing consistent everywhere (`motion-consistency`).

---

## 6. Accessibility commitments (WCAG, `web-design-guidelines`)

- Contrast: body ≥ 4.5:1, large/UI ≥ 3:1 — verified per token pair, both themes.
- Full keyboard operability; visible focus ring everywhere; logical tab order; `Esc` closes modals/sheets (`escape-routes`).
- Icon-only buttons carry `aria-label` (`aria-labels`); status conveyed by icon+text+color, never color alone.
- Form fields: visible label, helper text, inline validation on blur, error below field + `role="alert"`, focus moves to first invalid field (`form-labels`, `inline-validation`, `error-placement`, `focus-management`).
- `prefers-reduced-motion` fully honored; text scales without breaking layout (`dynamic-type`).
- Live regions: streaming chat + toasts announced politely without grabbing focus (`toast-accessibility`).
- The Submit guardrail is also an a11y/clarity feature: a persistent, high-contrast notice "GARY no envía — el click final es tuyo" on every apply surface.

---

## 7. Component primitives (the kit)

Buttons (`primary` accent · `secondary` surface+border · `ghost` · `danger`), Icon button, Input/Textarea,
Select/Dropdown, Toggle (Dark/Light, settings), Segmented control (CLI picker), Chip/Tag (filters, status),
Card, Table row (offers), Score meter (5 dots + number), Status pill (connection), Avatar (paw + user),
Chat bubble (user/GARY/code/table), Code block (mono + copy), Modal/Sheet, Toast, Progress bar + step dots,
Skeleton, Empty/Loading/Error/Offline states, Tooltip, Sidebar nav item, Connection list item.
Full spec + props in [`docs/components.md`](./components.md).

---

## 8. Theming implementation note (for the build phase, not now)

Tokens ship as CSS custom properties on `:root` (dark default) and `[data-theme="light"]`. The Dark/Light
toggle flips `data-theme` and persists to settings; GSAP reads the same `--accent` so motion stays on-theme.
The xterm chat theme is derived from the same tokens (bg `--bg`, fg `--text`, accent cursor) so the embedded
terminal and the chat skin look like one surface.
</content>
</invoke>
