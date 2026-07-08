// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */
// Jobicy provider — public remote-jobs API (no auth, free, ToS-friendly; attribution requested).
// careers_url: https://jobicy.com/api/v2/remote-jobs?count=50&tag=react&geo=latam
const ALLOWED = new Set(['jobicy.com', 'www.jobicy.com']);
function assertUrl(url) {
  let p; try { p = new URL(url); } catch { throw new Error(`jobicy: invalid URL: ${url}`); }
  if (p.protocol !== 'https:') throw new Error('jobicy: must be HTTPS');
  if (!ALLOWED.has(p.hostname)) throw new Error(`jobicy: untrusted host ${p.hostname}`);
  if (!p.pathname.startsWith('/api/v2/remote-jobs')) throw new Error('jobicy: bad path');
  return url;
}
/** @type {Provider} */
export default {
  id: 'jobicy',
  detect(entry) {
    try { const p = new URL(entry.careers_url || ''); if (ALLOWED.has(p.hostname) && p.pathname.startsWith('/api/v2/remote-jobs')) return { url: entry.careers_url }; } catch {}
    return null;
  },
  async fetch(entry, ctx) {
    assertUrl(entry.careers_url);
    const j = await ctx.fetchJson(entry.careers_url, { redirect: 'error' });
    if (!j || !Array.isArray(j.jobs)) throw new Error('jobicy: expected { jobs: [...] }');
    return j.jobs.filter(x => x && x.url && x.jobTitle).map(x => ({
      title: String(x.jobTitle), url: String(x.url), company: String(x.companyName || entry.name), location: String(x.jobGeo || 'Remote'),
    }));
  },
};
