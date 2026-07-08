// Pull fresh, eligible, on-stack roles from FREE-apply aggregators (Jobicy/Himalayas/Muse).
// Excludes WeWorkRemotely (paywalled) and companies already handled.
const sources = [
  { id: 'jobicy-latam', url: 'https://jobicy.com/api/v2/remote-jobs?count=50&geo=latam', key: 'jobs', map: x => ({ t: x.jobTitle, c: x.companyName, l: x.jobGeo, u: x.url }) },
  { id: 'jobicy-react', url: 'https://jobicy.com/api/v2/remote-jobs?count=50&tag=react', key: 'jobs', map: x => ({ t: x.jobTitle, c: x.companyName, l: x.jobGeo, u: x.url }) },
  { id: 'jobicy-node', url: 'https://jobicy.com/api/v2/remote-jobs?count=50&tag=node', key: 'jobs', map: x => ({ t: x.jobTitle, c: x.companyName, l: x.jobGeo, u: x.url }) },
  { id: 'himalayas', url: 'https://himalayas.app/jobs/api?limit=100', key: 'jobs', map: x => ({ t: x.title, c: x.companyName, l: Array.isArray(x.locationRestrictions) ? x.locationRestrictions.join(',') : '', u: x.applicationLink || x.guid }) },
];
const onstack = /(full.?stack|front.?end|back.?end|react|node|nest|software engineer|web engineer|typescript|product engineer)/i;
const bad = /(\.net|c#|\bjava\b|python|golang|\bgo\b|\brust|elixir|scala|\bphp\b|ruby|devops|\bsre\b|\bqa\b|data eng|data scien|machine learning|\bml\b|salesforce|\bsap\b|android|ios\b|wordpress|designer|\bmanager\b|director|\bvp\b|head\b|recruit|\bsales\b|market|writer|intern|junior|principal)/i;
const locGood = /(latam|latin america|colombia|americas|global|worldwide|anywhere)/i;
const locBad = /(united states|u\.s\.|\busa\b|us only|north america|canada|emea|europe|united kingdom|\buk\b|india|apac|\basia\b|germany|france|spain|portugal|brazil|argentina|nigeria|africa|australia|japan|philippines)/i;
const eligible = l => !l || locGood.test(l) || (/remote/i.test(l) && !locBad.test(l));
const skipCo = /(amplemarket|resend|coderoad|^engine$|^able$|hightouch|workos|vercel|planetscale|cohere|supabase|praxent|teravision|pos\+|posplus|dentology|quinncia|nubank|remote\.com|^remote$)/i;
const seen = new Set();
for (const s of sources) {
  try {
    const j = await (await fetch(s.url, { headers: { 'user-agent': 'Mozilla/5.0' } })).json();
    const arr = j[s.key] || [];
    for (const raw of arr) {
      const x = s.map(raw);
      if (!x.t || !x.u) continue;
      if (!onstack.test(x.t) || bad.test(x.t)) continue;
      if (!eligible(x.l)) continue;
      if (skipCo.test(x.c || '')) continue;
      const k = (x.c + '::' + x.t).toLowerCase();
      if (seen.has(k)) continue; seen.add(k);
      console.log(`${x.c} :: ${x.t} :: ${x.l || 'Remote'} :: ${x.u}`);
    }
  } catch (e) { console.error(`# ${s.id} ERR ${e.message}`); }
}
console.error(`# total unique: ${seen.size}`);
