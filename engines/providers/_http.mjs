// HTTP transport helpers shared across providers.
// Files prefixed with _ are never loaded as providers by scan.mjs.

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; career-ops/1.3)';

// ANTI-BLOCK (mandatory): ONE request in flight per host, with a jittered 0.3–0.7 s gap between requests to the
// same host. scan.mjs runs many companies in parallel, but most share a host (boards-api.greenhouse.io,
// api.lever.co, api.ashbyhq.com…) — without this, 10 parallel hits on one host is exactly what earns a 423/429
// IP block. Different hosts still run in parallel. A 423/429 trips that host's breaker for the rest of the run
// (every later call to it fails fast) — never retry into a throttle.
const GAP_MS = [300, 700];
const hostChain = new Map();   // host → tail of its serial promise chain
const hostLast = new Map();    // host → when its last request ended
const hostBlocked = new Map(); // host → reason (breaker tripped this run)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function perHost(url, fn) {
  let host;
  try { host = new URL(url).host; } catch { return fn(); }
  const run = (hostChain.get(host) || Promise.resolve()).then(async () => {
    if (hostBlocked.has(host)) throw Object.assign(new Error(`host ${host} throttled earlier this run (${hostBlocked.get(host)}) — skipped`), { status: 429 });
    const gap = GAP_MS[0] + Math.random() * (GAP_MS[1] - GAP_MS[0]);
    const wait = (hostLast.get(host) || 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } catch (e) {
      if (e.status === 423 || e.status === 429) {
        hostBlocked.set(host, `HTTP ${e.status}`);
        console.error(`⛔ ${host} answered HTTP ${e.status} — breaker tripped, no more requests to it this run.`);
      }
      throw e;
    } finally {
      hostLast.set(host, Date.now());
    }
  });
  hostChain.set(host, run.catch(() => {}));
  return run;
}

async function fetchWithTimeout(url, opts = {}) {
  return perHost(url, () => rawFetch(url, opts));
}

async function rawFetch(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, method = 'GET', body = null, redirect = 'follow' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'user-agent': DEFAULT_USER_AGENT, ...headers },
      body,
      redirect,
      signal: controller.signal,
    });
    if (!res.ok) {
      const responseText = await res.text().catch(() => '');
      const snippet = responseText.replace(/\s+/g, ' ').trim().slice(0, 300);
      const err = new Error(snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`);
      err.status = res.status;
      err.body = responseText;
      throw err;
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  return await res.json();
}

export async function fetchText(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  return await res.text();
}

export function makeHttpCtx() {
  return {
    transport: 'http',
    fetchJson,
    fetchText,
  };
}
