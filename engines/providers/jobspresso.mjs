// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Jobspresso provider — public WP Job Manager RSS feed (free, no auth, no membership).
// Auto-detects from careers_url host jobspresso.co with query feed=job_feed, e.g.
//   https://jobspresso.co/?feed=job_feed
//   https://jobspresso.co/?feed=job_feed&search_keywords=developer
// RSS <item>: <title>Position</title> <link>..</link>
//   <dc:creator><![CDATA[Company<br>⚲&nbsp;Location]]></dc:creator> <pubDate>..</pubDate>

const ALLOWED_HOSTS = new Set(['jobspresso.co', 'www.jobspresso.co']);

function assertUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`jobspresso: invalid URL: ${url}`); }
  if (parsed.protocol !== 'https:') throw new Error(`jobspresso: URL must use HTTPS: ${url}`);
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error(`jobspresso: untrusted host "${parsed.hostname}"`);
  if (parsed.searchParams.get('feed') !== 'job_feed') throw new Error(`jobspresso: URL must carry feed=job_feed: ${url}`);
  return url;
}

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

/** @type {Provider} */
export default {
  id: 'jobspresso',

  detect(entry) {
    const url = entry.careers_url || '';
    try {
      const p = new URL(url);
      if (ALLOWED_HOSTS.has(p.hostname) && p.searchParams.get('feed') === 'job_feed') return { url };
    } catch {}
    return null;
  },

  async fetch(entry, ctx) {
    const url = entry.careers_url;
    if (!url) throw new Error('jobspresso: careers_url required');
    assertUrl(url);
    const xml = await ctx.fetchText(url, { redirect: 'error' });
    const items = xml.split(/<item>/i).slice(1).map(s => s.split(/<\/item>/i)[0]);
    return items.map(block => {
      // dc:creator is "Company<br>⚲&nbsp;Location"
      const [company = '', location = ''] = tag(block, 'dc:creator').split(/<br\s*\/?>/i);
      const ts = Date.parse(tag(block, 'pubDate'));
      return {
        title: decode(tag(block, 'title')),
        url: decode(tag(block, 'link')),
        company: decode(company).trim() || entry.name,
        location: decode(location).replace(/^⚲\s*/, '').trim() || 'Remote',
        ...(Number.isFinite(ts) ? { postedAt: ts } : {}),
      };
    }).filter(j => j.title && j.url);
  },
};
