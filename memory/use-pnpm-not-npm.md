---
name: use-pnpm-not-npm
description: Always use pnpm (never npm/yarn) for this project, including global CLI installs
metadata:
  type: feedback
---

For the GARY project, always use **pnpm** — never `npm` or `yarn`. This includes **global tool installs**: use `pnpm add -g <pkg>` (e.g. `pnpm add -g @pencil.dev/cli`), not `npm install -g`.

**Why:** The project migrated to pnpm for security and pins `packageManager: pnpm@11.1.2`. The user explicitly extended this to global installs after I used `npm install -g` for the Pencil CLI (2026-06-29).

**How to apply:** Default every install/script command to pnpm. CLAUDE.md already states "Package manager is pnpm — do not use npm/yarn"; treat global installs as covered by the same rule.
