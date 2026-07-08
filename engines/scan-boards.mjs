// Sweep Greenhouse boards for FRESH roles matching the candidate + LATAM/remote eligibility.
// Usage: node engines/scan-boards.mjs --since 2026-06-18 slug1 slug2 ...
// Board API lists only ACTIVE jobs; we further filter by updated_at >= since.
const args = process.argv.slice(2);
const si = args.indexOf('--since');
const since = si !== -1 ? args[si + 1] : '2026-06-18';
const slugs = args.filter((a, i) => a !== '--since' && i !== (si + 1));
const sinceTs = Date.parse(since + 'T00:00:00Z');

const titleOk = /(full.?stack|front.?end|back.?end|react|node|nest|software engineer|web engineer|typescript|javascript)/i;
const titleBad = /(\.net|c#|\bjava\b|python|golang|\bgo\b|\brust|elixir|scala|php only|devops|\bsre\b|\bqa\b|\bsdet\b|data eng|data scien|machine learning|\bml\b|salesforce|\bsap\b|android|ios\b|mobile|designer|\bmanager\b|director|\bvp\b|head of|recruit|\bsales\b|market|principal architect)/i;
const locGood = /(latam|latin america|colombia|americas|global|worldwide|anywhere)/i;
const locBad = /(united states|u\.s\.|\busa\b|us-|us only|north america|canada|emea|europe|united kingdom|\buk\b|ireland|india|apac|\basia\b|germany|france|spain|portugal|poland|brazil|méxico|mexico|argentina|chile|peru|nigeria|kenya|south africa|australia|japan|singapore|philippines)/i;

function eligible(l) {
  if (!l) return true;
  if (locGood.test(l)) return true;
  if (/remote/i.test(l) && !locBad.test(l)) return true;
  return false;
}

for (const slug of slugs) {
  try {
    const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
    if (!r.ok) continue;
    const j = await r.json();
    const jobs = Array.isArray(j.jobs) ? j.jobs : [];
    const hits = jobs.filter(x => {
      const t = x.title || ''; const l = (x.location && x.location.name) || '';
      const ts = x.updated_at ? Date.parse(x.updated_at) : 0;
      return titleOk.test(t) && !titleBad.test(t) && eligible(l) && ts >= sinceTs;
    });
    if (hits.length) {
      console.log(`# ${slug} (${hits.length} fresh)`);
      hits.forEach(x => console.log(`  ${(x.updated_at || '').slice(0, 10)} | ${x.title} :: ${(x.location && x.location.name) || ''} :: ${x.absolute_url}`));
    }
  } catch { /* skip */ }
}
