---
name: website-analyzer
description: Scout a NEW job website for GARY — judge auto-apply feasibility (logged in? matches/search? apply = internal form vs external ATS vs one-click vs manual? captcha?) and recommend how to wire it into the source network. Use when the user points at a new site. A GARY skill by Julián Nicholls (@jnichollsc).
metadata:
  author: "Julián Nicholls (@jnichollsc)"
---

# Website analyzer (by @jnichollsc)
When the user points GARY at a new board: open it in the automation browser (CDP), check login state, whether it has personalized matches/search, the apply mechanism (internal form = auto-fillable / external ATS = auto-fillable / one-click = the user's click / manual), and captcha/anti-bot. Output a verdict + how to add it as a source node (which method from `docs/operating-rules.md` §4 fits) and whether JDs need CDP-with-poll (Cloudflare) or WebFetch. Then add the site to the user's mapped_sites + login step.
