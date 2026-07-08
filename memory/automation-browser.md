---
name: automation-browser
description: GARY drives ONE dedicated persistent Chrome (CDP :9333, isolated profile) for all automation — logins + bots + apply
metadata:
  type: project
---

GARY's automation runs entirely through **one dedicated debug Chrome over CDP on port 9333**, launched with an **isolated, persistent** profile (`%USERPROFILE%\<browser>-automation-profile`; Chrome uses `chrome-automation-profile`, matching the career-ops prototype). This SAME browser is used for **logins + sourcing bots + apply automation** — the user logs into each site **once** and the session **persists day-to-day**. It is **user-selectable** in Ajustes (Chrome is the default/tested; Edge/Brave/Chromium allowed). GARY **never touches, reads, or kills the user's personal browser**.

Launch flags: `--remote-debugging-port=<port> --remote-allow-origins=* --user-data-dir=<profile> --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --no-first-run --no-default-browser-check`.

**Why:** logins must persist without re-auth; automation must not disrupt the user's real browsing; CDP needs a debug-launched instance.

**How to apply:** engines connect via `chromium.connectOverCDP('http://127.0.0.1:9333')`. Port/profile are DATA (settings), never hardcode. See [[context-store-split]] and `docs/operating-rules.md §5` + `docs/career-ops-map.md §5`.
