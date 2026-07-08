# Spec 01 — Foundation + app shell + Chat view

> **Goal:** a real, installable desktop app that opens to the GARY shell (sidebar + views) with the
> **Chat view = the embedded terminal** running the LM CLI. Everything else stubs to real screens later.
> Screens: `pencil/gary.pen` → Chat (prompt 1) + Sidebar (prompt 2). Tokens = prompt 0 / design-system §1–3.

## Scope
1. **Design tokens** — `src/styles/tokens.css`: every token from `design-system.md` §1 as CSS custom
   properties on `:root` (dark) and `[data-theme="light"]`, plus spacing/radius/shadow (§3) and the font
   stacks (§2). Load Inter, Plus Jakarta Sans, JetBrains Mono (`display=swap`). No raw hex in components.
2. **App shell (React)** — convert `src/main.tsx` from a bare xterm bootstrap into a React app:
   - `ThemeProvider` — `data-theme` on `<html>`, dark default, persisted (localStorage now; Tauri settings later).
   - `Sidebar` (260px): `BrandHeader` (paw SVG + "GARY" wordmark + tagline), `NavItem`s
     (Chat · Mapa de ofertas · Onboarding · Métricas · Ajustes — lucide icons, active = accent pill + left bar),
     with **Métricas placed directly below Onboarding**,
     `ConnectionsSection` (Gmail/LinkedIn/Indeed/GetOnBoard/Himalayas/Computrabajo with `StatusDot` +
     conectado/desconectado/verificando + "Conectar" ghost button — static data for now), `ThemeToggle`,
     `UserFooter`.
   - Simple client router (state or hash) switching the main area between the 4 views. Only **Chat** is real
     this stage; the others render a placeholder `EmptyState`.
3. **Chat view** — `ChatLayout`: header (title "Chat" + model badge from `GARY_CLI`), the **embedded xterm**
   skinned from tokens (bg `--bg`, fg `--text`, cursor `--accent`), and a visual `Composer` + `QuickActions`
   row. Keep the PTY bridge (`spawn_cli`/`write_stdin`/`resize_pty`). The terminal is the chat surface.
4. **Primitives** (minimum for this stage): `Button` (primary/secondary/ghost), `Chip`, `StatusDot`,
   `NavItem`, `Avatar` (paw SVG). Faithful to `components.md` §A/§B/§C.
5. **Rust:** fix `spawn_cli` CWD so the CLI starts at the **project root** (loads `.claude/`). Keep the
   window ≥ min size; no new commands required this stage.

## Out of scope (later stages)
Settings controls, onboarding, offers map, apply modal, GSAP motion polish, live connection checks, wiring
the bots. Connection statuses + model badge may be static/placeholder here.

## Acceptance criteria
- `pnpm install && pnpm tauri dev` opens the window showing the **sidebar + Chat view**; the terminal
  spawns `GARY_CLI` and is interactive (type → CLI responds), rooted at the project (loads `.claude/`).
- Sidebar matches `gary.pen` prompt 1/2 closely: brand, 4 nav items (Chat active), Conexiones list with
  status dots + "Conectar", theme toggle. Nav switches views (others show a placeholder).
- **Dark and light** both correct via the toggle; all colors come from tokens (no hardcoded hex in
  components). Focus ring visible on every interactive element; tab order = visual order.
- Terminal colors are derived from the same tokens (chat + terminal read as one surface).
- **The PTY session SURVIVES navigation.** ChatView stays mounted (hidden, not unmounted) when another
  view is active, so switching tabs never disposes the xterm / re-invokes `open_terminal` / kills the
  running agent. On return, the terminal refits and the prior session is intact. (Regression: unmounting
  ChatView on nav restarted the terminal and dropped the Claude session.)
- No TypeScript/console errors; `prefers-reduced-motion` respected (no motion added yet is fine).

## How to verify locally
1. `pnpm install`
2. `pnpm tauri dev` → GARY window opens.
3. Type in the terminal → the CLI (default gemini) responds. Toggle Dark/Light → theme flips. Click nav
  items → view switches. Tab through the sidebar → focus ring visible. Sidebar order is Chat → Mapa de ofertas
  → Onboarding → Métricas → Ajustes.
4. (Optional) build a subagent from `build-agents/accessibility-expert.md` to spot-check AA contrast.

## Notes for the builder
- Use `build-agents/`: `design-system-architect` (tokens), `frontend-developer` + `ui-ux-designer`
  (shell/Chat), `rust-pro` (CWD fix), `accessibility-expert` (AA). They are build-only; do not add them to
  `.claude/agents/`.
- The paw is a **crafted SVG brand asset**, never the 🐾 emoji in functional UI, and never a nav icon.
- Keep `index.html` importing xterm CSS; move inline styles into `tokens.css` + component styles.
