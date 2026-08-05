/**
 * GARY — NotebookLM host resolution (the "NotebookLM → Gemini" migration).
 *
 * Google moved NotebookLM under the Gemini umbrella: the app now lives on `notebook.google.com`.
 * The legacy `notebooklm.google.com` host still serves the app HTML (it 302s over to the new host),
 * so a naive "did the page load?" check keeps reporting a healthy session — but every batchexecute
 * RPC posted to the LEGACY origin now answers **401 Unauthorized**. That is why `notebooks create`
 * (and any other RPC) blew up while login/status looked fine.
 *
 * Fix: never hardcode the host. `RPCClient.init()` follows the redirect chain and records the origin
 * where the app ACTUALLY landed; every request afterwards (batchexecute, chat stream, file upload,
 * media download, notebook URLs) is issued against that resolved origin.
 */

/** Pre-migration host. Still resolves, but its RPC endpoints reject the session with 401. */
export const LEGACY_ORIGIN = 'https://notebooklm.google.com';

/** Post-migration (Gemini-era) host — the entry point we probe first. */
export const DEFAULT_ORIGIN = 'https://notebook.google.com';

let apiOrigin = DEFAULT_ORIGIN;

/** The origin every NotebookLM request must target (resolved at runtime by `RPCClient.init()`). */
export function getApiOrigin(): string {
  return apiOrigin;
}

/**
 * Pins the API origin to wherever the app page finally landed. Only accepts `*.google.com` origins,
 * so a redirect to `accounts.google.com` (i.e. an expired session) can never poison it.
 */
export function setApiOriginFromUrl(url: string | undefined | null): void {
  if (!url) return;
  try {
    const { origin, hostname } = new URL(url);
    if (!/(^|\.)google\.com$/.test(hostname)) return;
    if (hostname.startsWith('accounts.')) return;
    apiOrigin = origin;
  } catch {
    /* keep the current origin */
  }
}

/** Absolute URL on the resolved host, e.g. `apiUrl('/_/LabsTailwindUi/data/batchexecute')`. */
export function apiUrl(pathname: string): string {
  return `${getApiOrigin()}${pathname}`;
}

/** Canonical notebook URL on the resolved host. */
export function notebookUrl(notebookId: string): string {
  return `${getApiOrigin()}/notebook/${notebookId}`;
}

/** True for any host that serves NotebookLM (legacy or Gemini-era) — used to validate a browser URL. */
export function isNotebookLmUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'notebooklm.google.com' || hostname === 'notebook.google.com';
  } catch {
    return false;
  }
}
