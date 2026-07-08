// Find fresh Truelogic LATAM roles: on-stack, NOT mentioning AWS, not already applied.
const done = ['a761f4be','6e4b2e7e','2fe8ab75','2ec754e5','3af5b1b2'];
const ok = /(full.?stack|front.?end|back.?end|react|node|nest|typescript|javascript|product engineer|web engineer)/i;
const bad = /(elixir|\brust\b|\bgo\b|golang|python|\bjava\b|\.net|c#|ruby|php|devops|\bqa\b|\bsre\b|data eng|machine learning|\bml\b|mobile|android|ios\b|salesforce|manager|director|recruit|\bsales\b)/i;
const j = await (await fetch('https://api.ashbyhq.com/posting-api/job-board/truelogic?includeCompensation=true')).json();
let n = 0;
for (const x of (j.jobs || [])) {
  const t = x.title || '', loc = x.location || '', url = x.jobUrl || '';
  if (!ok.test(t) || bad.test(t)) continue;
  if (!/latam|latin|americas|remote/i.test(loc)) continue;
  if (done.some(d => url.includes(d))) continue;
  const desc = x.descriptionPlain || x.descriptionHtml || '';
  const aws = /aws|amazon web services/i.test(t + ' ' + desc);
  if (aws) continue;
  n++;
  console.log(`${t} :: ${loc} :: ${url}`);
}
console.error(`# eligible non-AWS new: ${n}`);
