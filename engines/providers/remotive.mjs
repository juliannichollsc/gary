// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Remotive provider — hits the public remote-jobs API (legit, no auth, ToS-friendly).
// Auto-detects from careers_url pattern `https://remotive.com/api/remote-jobs?...`.
// API: https://remotive.com/api/remote-jobs?search=<q>&limit=<n>&category=<c>
// Returns { jobs: [{ title, company_name, url, candidate_required_location, salary, ... }] }.

const ALLOWED_HOSTS = new Set(['remotive.com', 'www.remotive.com']);

/**
 * Validate that the URL is a trusted Remotive API endpoint (HTTPS + host + path).
 * @param {string} url
 * @returns {string}
 */
function assertUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`remotive: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`remotive: URL must use HTTPS: ${url}`);
  if (!ALLOWED_HOSTS.has(parsed.hostname))
    throw new Error(`remotive: untrusted hostname "${parsed.hostname}" — must be remotive.com`);
  if (!parsed.pathname.startsWith('/api/remote-jobs'))
    throw new Error(`remotive: URL path must start with /api/remote-jobs: ${url}`);
  return url;
}

/** @type {Provider} */
export default {
  id: 'remotive',

  detect(entry) {
    const url = entry.careers_url || '';
    try {
      const parsed = new URL(url);
      if (ALLOWED_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith('/api/remote-jobs'))
        return { url };
    } catch {}
    return null;
  },

  /**
   * @param {{ careers_url?: string, name: string }} entry
   * @param {{ fetchJson: (url: string, opts?: { redirect?: 'error'|'follow'|'manual' }) => Promise<any> }} ctx
   * @returns {Promise<Array<{title: string, url: string, company: string, location: string}>>}
   */
  async fetch(entry, ctx) {
    const url = entry.careers_url;
    if (!url) throw new Error('remotive: careers_url required');
    assertUrl(url);
    const json = await ctx.fetchJson(url, { redirect: 'error' });
    if (!json || !Array.isArray(json.jobs)) {
      throw new Error(`remotive: unexpected API response — expected { jobs: [...] }`);
    }
    return json.jobs
      .filter(j => j && typeof j === 'object' && typeof j.url === 'string' && j.url.trim() !== '')
      .map(j => ({
        title: j.title || '',
        url: j.url,
        company: j.company_name || entry.name,
        location: j.candidate_required_location || '',
      }));
  },
};
