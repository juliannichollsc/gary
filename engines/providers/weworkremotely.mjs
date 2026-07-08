// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// WeWorkRemotely provider — public RSS feeds (no auth, ToS-friendly).
// Auto-detects from careers_url host weworkremotely.com with an .rss path, e.g.
//   https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss
// RSS <item>: <title>Company: Position</title> <link>..</link> <region>..</region>

const ALLOWED_HOSTS = new Set(['weworkremotely.com', 'www.weworkremotely.com']);

function assertUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`wwr: invalid URL: ${url}`); }
  if (parsed.protocol !== 'https:') throw new Error(`wwr: URL must use HTTPS: ${url}`);
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error(`wwr: untrusted host "${parsed.hostname}"`);
  if (!parsed.pathname.endsWith('.rss')) throw new Error(`wwr: path must end with .rss: ${url}`);
  return url;
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

/** @type {Provider} */
export default {
  id: 'weworkremotely',

  detect(entry) {
    const url = entry.careers_url || '';
    try {
      const p = new URL(url);
      if (ALLOWED_HOSTS.has(p.hostname) && p.pathname.endsWith('.rss')) return { url };
    } catch {}
    return null;
  },

  async fetch(entry, ctx) {
    const url = entry.careers_url;
    if (!url) throw new Error('wwr: careers_url required');
    assertUrl(url);
    const xml = await ctx.fetchText(url, { redirect: 'error' });
    const items = xml.split(/<item>/i).slice(1).map(s => s.split(/<\/item>/i)[0]);
    return items.map(block => {
      const rawTitle = tag(block, 'title');
      const link = tag(block, 'link');
      const region = tag(block, 'region');
      // WWR titles are usually "Company: Position"
      let company = entry.name, title = rawTitle;
      const idx = rawTitle.indexOf(': ');
      if (idx > 0) { company = rawTitle.slice(0, idx).trim(); title = rawTitle.slice(idx + 2).trim(); }
      return { title, url: link, company, location: region || 'Remote' };
    }).filter(j => j.title && j.url);
  },
};
