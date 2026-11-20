// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Working Nomads provider — public JSON API (free, no auth, no membership).
// Auto-detects from careers_url host workingnomads.com with path /api/exposed_jobs.
// API: https://www.workingnomads.com/api/exposed_jobs/  → JSON array.
// Job fields: url, title, company_name, category_name, tags, location, pub_date, description.

const ALLOWED_HOSTS = new Set(['workingnomads.com', 'www.workingnomads.com']);

function assertUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`workingnomads: invalid URL: ${url}`); }
  if (parsed.protocol !== 'https:') throw new Error(`workingnomads: URL must use HTTPS: ${url}`);
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error(`workingnomads: untrusted host "${parsed.hostname}"`);
  if (!parsed.pathname.startsWith('/api/exposed_jobs')) throw new Error(`workingnomads: path must start with /api/exposed_jobs: ${url}`);
  return url;
}

/** @type {Provider} */
export default {
  id: 'workingnomads',

  detect(entry) {
    const url = entry.careers_url || '';
    try {
      const p = new URL(url);
      if (ALLOWED_HOSTS.has(p.hostname) && p.pathname.startsWith('/api/exposed_jobs')) return { url };
    } catch {}
    return null;
  },

  async fetch(entry, ctx) {
    const url = entry.careers_url;
    if (!url) throw new Error('workingnomads: careers_url required');
    assertUrl(url);
    const arr = await ctx.fetchJson(url, { redirect: 'error' });
    if (!Array.isArray(arr)) throw new Error('workingnomads: expected a JSON array');
    return arr
      .filter(j => j && typeof j === 'object' && j.title && j.url)
      .map(j => {
        const ts = Date.parse(j.pub_date || '');
        return {
          title: String(j.title),
          url: String(j.url),
          company: String(j.company_name || entry.name),
          location: String(j.location || 'Remote'),
          ...(Number.isFinite(ts) ? { postedAt: ts } : {}),
        };
      });
  },
};
