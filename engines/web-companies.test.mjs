// Regression test for engines/web-companies.mjs (0 tokens, no network): node engines/web-companies.test.mjs
// Add a case whenever a non-direct or unsafe link slips into the Web channel.
import { classify, findEmbeddedAts, titleMatcher, urlSafety, htmlToText, requirementsOf, placeOf, jdSource } from './web-companies.mjs';
let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const kind = (u) => classify(u).kind;

// direct = the company's own ATS board / own domain
eq('lever board', classify('https://jobs.lever.co/acme/1234-abcd'), { kind: 'ats', provider: 'lever', slug: 'acme', careers_url: 'https://jobs.lever.co/acme' });
eq('ashby board', classify('https://jobs.ashbyhq.com/acme/53c2').provider, 'ashby');
eq('greenhouse legacy host', classify('https://boards.greenhouse.io/acme/jobs/1').careers_url, 'https://job-boards.greenhouse.io/acme');
eq('greenhouse embed', classify('https://boards.greenhouse.io/embed/job_board?for=acme').slug, 'acme');
eq('workday', classify('https://acme.wd5.myworkdayjobs.com/en-US/External/job/x').slug, 'acme/external');
eq('bamboohr = direct ats (no list provider)', kind('https://acme.bamboohr.com/careers/12'), 'ats');
eq('company domain → site (LM confirms)', kind('https://www.acme.com/careers'), 'site');
// NOT direct
eq('mipleo = board (2026-11-18 incident)', kind('https://www.mipleo.com.co/ofertas-de-trabajo/x-12796949.html'), 'board');
eq('linkedin → its own channel', classify('https://www.linkedin.com/jobs/view/1').channel, 'LinkedIn');
eq('computrabajo → its own channel', classify('https://co.computrabajo.com/ofertas-de-trabajo/x').channel, 'Computrabajo');
eq('jobgether = board', kind('https://jobgether.com/offer/abc'), 'board');
eq('turing = marketplace', kind('https://www.turing.com/jobs/x'), 'marketplace');
eq('hirelatam = marketplace', kind('https://hirelatam.com/jobs/x'), 'marketplace');
eq('freehire.me = board (2026-11-18 run 2)', kind('https://freehire.me/jobs/123'), 'board');
eq('jobtarget = board', kind('https://jobs.jobtarget.com/job/123'), 'board');
eq('jobvite = direct ats, no list provider', classify('https://jobs.jobvite.com/acme/job/o1g6').provider, null);
eq('aggregator board on Lever = board (2026-11-18 run 4)', kind('https://jobs.lever.co/jobgether/abc-123'), 'board');
eq('marketplace board on Workable = board', kind('https://apply.workable.com/workana-premium/j/ABC'), 'board');
eq('javascript.jobs = board', kind('https://javascript.jobs/x/123'), 'board');
eq('shared-host ATS slug = company, not "jobs"', classify('https://jobs.jobvite.com/acme/job/o1g6').slug, 'acme');
eq('shared-host ATS board url', classify('https://jobs.jobvite.com/acme/job/o1g6').careers_url, 'https://jobs.jobvite.com/acme');
// unsafe links never get fetched
eq('http rejected', urlSafety('http://acme.com/careers').reason, 'not https');
eq('ip literal', urlSafety('https://192.168.1.1/jobs').reason, 'IP literal');
eq('localhost', urlSafety('https://localhost/jobs').reason, 'local host');
eq('credentials', urlSafety('https://u:p@acme.com/jobs').reason, 'credentials in URL');
eq('port', urlSafety('https://acme.com:8443/jobs').reason, 'non-standard port 8443');
eq('shortener', urlSafety('https://bit.ly/3xyz').reason, 'link shortener');
eq('punycode look-alike', urlSafety('https://xn--pple-43d.com/careers').reason, 'punycode host (possible look-alike)');
eq('file download', urlSafety('https://acme.com/apply/form.exe').reason, 'file download');
eq('unsafe classify', kind('http://acme.com/careers'), 'unsafe');
// embedded ATS on a careers page
eq('embedded ats', findEmbeddedAts('<iframe src="https://boards.greenhouse.io/embed/job_board?for=acme"></iframe><a href="http://jobs.lever.co/beta">x</a> Grnhse.Settings.boardToken = "gamma"').map((c) => `${c.provider}:${c.slug}`).sort(),
  ['greenhouse:acme', 'greenhouse:gamma', 'lever:beta']);
// title keywords
const m = titleMatcher(['data engineer', 'site reliability', 'sre']);
eq('title match hyphen', m('Senior Site-Reliability Engineer'), true);
eq('title match accent-free', m('Ingeniero de Datos / Data Engineer Sénior'), true);
eq('title no match', m('Product Designer'), false);
// JD extraction (--jd) and place tagging (--places)
eq('greenhouse escaped html → text', htmlToText('&lt;p&gt;Hello &amp;amp; bye&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Go&lt;/li&gt;&lt;/ul&gt;'), 'Hello & bye\n- Go');
eq('requirements section picked', requirementsOf('About us\nWe sell things\nRequirements\n- 5 years TS\n- SQL').split('\n')[0], 'Requirements');
eq('no heading → start of text', requirementsOf('Just a short JD'), 'Just a short JD');
const P = ['{country}', 'latam', '{city}'];
eq('place match', placeOf('Remote - LATAM', P), 'match');
eq('place remote-open', placeOf('Remote - International', P), 'remote-open');
eq('place foreign (US-locked)', placeOf('Remote (US)', P), 'foreign');
eq('place unspecified', placeOf('', P), 'unspecified');
eq('jd api lever', jdSource('https://jobs.lever.co/acme/5057a0ef-1111').api, 'https://api.lever.co/v0/postings/acme/5057a0ef-1111');
eq('jd api greenhouse', jdSource('https://job-boards.greenhouse.io/acme/jobs/7732220003').api, 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/7732220003');
eq('jd api smartrecruiters', jdSource('https://jobs.smartrecruiters.com/Acme/743999660809044-react-dev').api, 'https://api.smartrecruiters.com/v1/companies/Acme/postings/743999660809044');
eq('jd api ashby board', jdSource('https://jobs.ashbyhq.com/acme/880b299b-2222').api, 'https://api.ashbyhq.com/posting-api/job-board/acme');
eq('jd: board url (no role) → none', jdSource('https://jobs.lever.co/acme'), false);
console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
