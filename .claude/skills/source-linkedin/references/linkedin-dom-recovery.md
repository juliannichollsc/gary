# LinkedIn DOM / engine-recovery notes (by @jnichollsc)

> Reference for `engines/linkedin-scan.mjs` — the failure modes seen when LinkedIn changes its logged-in
> DOM, and how the engine + LM supervisor recover. Candidate-agnostic. Applies to BOTH LinkedIn paths:
> `scanCombo` (the `--all` filters/roles sweep) and `scanUrls` (the Gmail-harvested `--urls` path).
> Read this when a LinkedIn sweep returns `scanned 0`, empty JDs, or a `writeSeen` crash.

## 1. The JD renders ONLY in the search split-view (`currentJobId`) — NOT `/jobs/view/{id}`
**Symptom:** the bot navigates fine (`nav ~1.6s`) but every JD comes back empty (`jd@final=0`), so the
run reports `scanned 0 | 0 survivors` and marks nothing seen. A CDP probe shows the offer title in
`document.title` (so you ARE logged in) but `#job-details`, `.jobs-description__content`, `h1`, and even
`[class*="description"]` are all NULL — the page rendered global nav + a search typeahead, no job pane.

**Cause:** for a LOGGED-IN session, `https://www.linkedin.com/jobs/view/{id}` renders nav chrome and does
NOT hydrate the job-detail pane. The `#job-details` pane only mounts in the SEARCH split-view.

**Fix (already in the engine):**
- `scanCombo` gets this for free — it CLICKS a card in `/jobs/search`, which lands on
  `…/jobs/search/?currentJobId={id}` and mounts the pane.
- `scanUrls` (standalone Gmail URLs) must NOT `goto('/jobs/view/{id}')`. `loadUrls` rebuilds every id as
  `https://www.linkedin.com/jobs/search/?currentJobId={id}`, and the id is re-extracted with
  `url.match(/currentJobId=(\d+)|\/jobs\/view\/(\d+)/)`. The canonical `/jobs/view/{id}/` URL is kept only
  for the offers-map record.
- The pane hydrates a beat AFTER the selector attaches → `waitForSelector(#job-details …, {timeout:14000})`
  **then** a `waitForTimeout(1500)` settle before scraping. (This is the "hay tiempos de espera" the user saw.)

**Do NOT** "fix" this by falling back to WebFetch on `/jobs/view/{id}` for every offer — WebFetch works
(guest pages render a JD) but each JD enters the LM context = tokens. WebFetch stays the FALLBACK only
(non-LinkedIn ATS, or CDP tab unavailable). The whole point of the CDP bot is a zero-token JD read.

## 2. GENERIC, self-healing selectors + the escalation guard
`scrapeDetail()` picks stable-id-first (`#job-details`) then GENERIC `[class*="jobs-description"]` /
`[class*="unified-top-card__…"]` fallbacks, so a LinkedIn class RENAME keeps matching. If the pane stops
rendering ENTIRELY (a real layout change), the engine does not silently burn the batch:
- `scanUrls` counts consecutive empty JDs; after `--fail-limit` in a row (default **8**, i.e. "5–10
  seguidos") it ABORTS and prints **`ENGINE-SELECTOR-STALE`**.
- **That message is the signal for the LM supervisor** (supervisor case #1 — unexpected engine error) to
  open one offer over CDP, inspect the live DOM, refresh the `pick([...])` selector lists + the
  `waitForSelector` string, then re-run. Update this doc with the new class names when you do.

## 3. Corrupt `linkedin-seen.json` → `RangeError: Invalid string length` on write
**Symptom:** a run dies mid-way with `RangeError: Invalid string length` at
`writeSeen → JSON.stringify(seen)`, even though `seen` looks small.

**Cause:** a legacy/corrupt seen file shaped `{"0":"<id>","1":"<id>",…}` (array-like index keys → id
STRINGS) instead of `{"<id>":{record}}`. Mixed with real entries it poisons dedup and can break
serialization.

**Fix (already in the engine):** `writeSeen` runs `cleanSeen()` first — it deletes any key that isn't a
`\d{6,}` jobId or whose value isn't an object — then pretty-prints, falling back to compact
`JSON.stringify(seen)` if V8 ever refuses the indented form. If a seen file is already corrupt, reset it:
`echo '{}' > output/gmail-harvest/linkedin-seen.json` (safe — it only means offers get re-triaged once).

## 4. Read-once, triage-from-file — never re-navigate
After the sweep the JD is captured in `output/gmail-harvest/survivors.json` (or WebFetch results already in
context). Triage FROM that file, merge survivors into `data/offers-master.md` + update `data/metrics.md`,
then treat the survivors file as TRANSIENT scratch (deprecated after the session). Re-running the scan to
"refresh" re-navigates offers you already read — the exact waste this pipeline exists to avoid. See
`source-gmail/SKILL.md` §5 and `docs/operating-rules.md` §3 (weekly `filt:`-date freshness purge).
