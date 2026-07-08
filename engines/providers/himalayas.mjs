// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */
// Himalayas provider — public remote-jobs API (no auth, free, ToS-friendly).
// careers_url: https://himalayas.app/jobs/api?limit=100
const ALLOWED = new Set(['himalayas.app', 'www.himalayas.app']);
function assertUrl(url) {
  let p; try { p = new URL(url); } catch { throw new Error(`himalayas: invalid URL: ${url}`); }
  if (p.protocol !== 'https:') throw new Error('himalayas: must be HTTPS');
  if (!ALLOWED.has(p.hostname)) throw new Error(`himalayas: untrusted host ${p.hostname}`);
  if (!p.pathname.startsWith('/jobs/api')) throw new Error('himalayas: bad path');
  return url;
}
/** @type {Provider} */
export default {
  id: 'himalayas',
  detect(entry) {
    try { const p = new URL(entry.careers_url || ''); if (ALLOWED.has(p.hostname) && p.pathname.startsWith('/jobs/api')) return { url: entry.careers_url }; } catch {}
    return null;
  },
  async fetch(entry, ctx) {
    assertUrl(entry.careers_url);
    const j = await ctx.fetchJson(entry.careers_url, { redirect: 'error' });
    if (!j || !Array.isArray(j.jobs)) throw new Error('himalayas: expected { jobs: [...] }');
    return j.jobs.filter(x => x && x.title && (x.applicationLink || x.guid)).map(x => ({
      title: String(x.title),
      url: String(x.applicationLink || x.guid),
      company: String(x.companyName || entry.name),
      location: Array.isArray(x.locationRestrictions) ? x.locationRestrictions.join(', ') : String(x.locationRestrictions || 'Remote'),
    }));
  },
};
