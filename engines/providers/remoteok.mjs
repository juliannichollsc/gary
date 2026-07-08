// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// RemoteOK provider — public JSON API (no auth, ToS-friendly).
// Auto-detects from careers_url host remoteok.com|remoteok.io with path /api.
// API: https://remoteok.com/api  → JSON array; element [0] is metadata (skip).
// Job fields: position, company, url, apply_url, location, tags, salary_min/max, date.

const ALLOWED_HOSTS = new Set(['remoteok.com', 'remoteok.io', 'www.remoteok.com']);

function assertUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`remoteok: invalid URL: ${url}`); }
  if (parsed.protocol !== 'https:') throw new Error(`remoteok: URL must use HTTPS: ${url}`);
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error(`remoteok: untrusted host "${parsed.hostname}"`);
  if (!parsed.pathname.startsWith('/api')) throw new Error(`remoteok: path must start with /api: ${url}`);
  return url;
}

/** @type {Provider} */
export default {
  id: 'remoteok',

  detect(entry) {
    const url = entry.careers_url || '';
    try {
      const p = new URL(url);
      if (ALLOWED_HOSTS.has(p.hostname) && p.pathname.startsWith('/api')) return { url };
    } catch {}
    return null;
  },

  async fetch(entry, ctx) {
    const url = entry.careers_url;
    if (!url) throw new Error('remoteok: careers_url required');
    assertUrl(url);
    const arr = await ctx.fetchJson(url, { redirect: 'error' });
    if (!Array.isArray(arr)) throw new Error('remoteok: expected a JSON array');
    return arr
      .filter(j => j && typeof j === 'object' && j.position && (j.url || j.apply_url))
      .map(j => ({
        title: String(j.position || ''),
        url: String(j.url || j.apply_url),
        company: String(j.company || entry.name),
        location: String(j.location || 'Remote'),
      }));
  },
};
