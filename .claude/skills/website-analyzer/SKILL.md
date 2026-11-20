---
name: website-analyzer
description: Scout a NEW job website for GARY — judge auto-apply feasibility (logged in? matches/search? apply = internal form vs external ATS vs one-click vs manual? captcha?) and recommend how to wire it into the source network. Use when the user points at a new site. A GARY skill by Julián Nicholls (@jnichollsc).
metadata:
  author: "Julián Nicholls (@jnichollsc)"
---

# Website analyzer (by @jnichollsc)

> **Before changing anything for this channel** (engine, selectors, verification, defaults): follow the `connections` skill §1 change protocol — baseline + re-run `node engines/check-connections.mjs`, change only this site's own rule, keep defaults, log the incident. Verification rule for this site lives ONLY in `engines/connections.mjs`.

When the user points GARY at a new board: open it in the automation browser (CDP), check login state, whether it has personalized matches/search, the apply mechanism (internal form = auto-fillable / external ATS = auto-fillable / one-click = the user's click / manual), and captcha/anti-bot. Output a verdict + how to add it as a source node (which method from `docs/operating-rules.md` §4 fits) and whether JDs need CDP-with-poll (Cloudflare) or WebFetch. Then add the site to the user's mapped_sites + login step.


## Wiring a new site into Conexiones
Add its card to the `connections` skill §2, its verification rule (yes/no markers + `why`, mapped on a REAL logged-in and logged-out page) to `engines/connections.mjs`, the site + login URL to `src/components/Sidebar.tsx → INITIAL_CONNS`, then `node engines/check-connections.mjs` (static check must pass). The generic text heuristic is only for the scouting phase — never ship a connection on it.
