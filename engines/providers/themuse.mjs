// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */
// The Muse provider — public jobs API (no auth/key for basic use, free, ToS-friendly).
// careers_url: https://www.themuse.com/api/public/jobs?category=Software%20Engineering&page=1&location=Remote
const ALLOWED = new Set(['themuse.com', 'www.themuse.com']);
function assertUrl(url) {
  let p; try { p = new URL(url); } catch { throw new Error(`themuse: invalid URL: ${url}`); }
  if (p.protocol !== 'https:') throw new Error('themuse: must be HTTPS');
  if (!ALLOWED.has(p.hostname)) throw new Error(`themuse: untrusted host ${p.hostname}`);
  if (!p.pathname.startsWith('/api/public/jobs')) throw new Error('themuse: bad path');
  return url;
}
/** @type {Provider} */
export default {
  id: 'themuse',
  detect(entry) {
    try { const p = new URL(entry.careers_url || ''); if (ALLOWED.has(p.hostname) && p.pathname.startsWith('/api/public/jobs')) return { url: entry.careers_url }; } catch {}
    return null;
  },
  async fetch(entry, ctx) {
    assertUrl(entry.careers_url);
    const j = await ctx.fetchJson(entry.careers_url, { redirect: 'error' });
    if (!j || !Array.isArray(j.results)) throw new Error('themuse: expected { results: [...] }');
    return j.results.filter(x => x && x.name && x.refs && x.refs.landing_page).map(x => ({
      title: String(x.name),
      url: String(x.refs.landing_page),
      company: String((x.company || {}).name || entry.name),
      location: Array.isArray(x.locations) ? x.locations.map(l => l.name).join(', ') : 'Remote',
    }));
  },
};
