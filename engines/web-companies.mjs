#!/usr/bin/env node
// GARY — Web channel helper (skill `source-web`). 0 tokens, NO browser, NO navigation: it never opens a page in
// the automation Chrome and never touches the user's accounts. The searcher is the user's own LM (WebSearch);
// this helper only does the deterministic part so the LM doesn't burn tokens reading pages one by one:
//   1. CLASSIFY every URL the LM found → `ats` (company's own ATS board) · `site` (maybe the company's own
//      domain — the LM confirms) · `board` (job board / aggregator — NOT a direct offer) · `marketplace`
//      (talent platform / recruiter — NOT a direct offer). Boards/marketplaces never enter the Web channel.
//   2. RESOLVE `site` careers pages (`--resolve`): one GET of the company page → finds an embedded ATS board
//      (greenhouse/lever/ashby/workable/smartrecruiters/recruitee) — the Argus technique.
//   3. LIST each company's open roles through its PUBLIC ATS JSON API (reusing engines/providers/*, one request
//      in flight per host via providers/_http.mjs) → keep titles matching `--kw` (NO age filter by default — the Web channel treats a role
//      still listed on the employer's portal as OPEN, owner order 2026-11-18; `--max-age N` is opt-in) with the
//      posting's own date (unknown → kept, `postedDays: null`) → compact JSON for the LM to gate + score.
//   4. CACHE the companies in output/web-research/companies.json (gitignored) so the next session re-lists them
//      with `--recheck` (cheapest, highest-yield lane) instead of searching the web again.
// Candidate-agnostic: keywords come from --kw or the GENERATED config/easyapply-filter.json `titles`.
//
//   node engines/web-companies.mjs --urls output/web-research/hits.txt [--resolve] [--kw "<title fragment>|<variant>"]
//   node engines/web-companies.mjs https://jobs.lever.co/acme https://acme.com/careers --resolve
//   node engines/web-companies.mjs --recheck            # re-list every cached company (0 web searches)
//   node engines/web-companies.mjs --classify-only <urls…>
//   node engines/web-companies.mjs --add-portal <official careers-search URL> --name "<Employer>" --tier country|region|city|global
//   node engines/web-companies.mjs --skip <cache key> --reason "<why>"     # never re-list it (closed board, not direct…)
//   node engines/web-companies.mjs --add-lead "Employer A|Employer B" --tier country [--sector "<sector>"]
//        # the target-employer MAP (skill §3 Step 0): employers planned but not resolved yet; `--recheck` returns
//        # them as `leads[]` (tier order) until their portal is registered with --add-portal --name "<same name>".
// Flags: --max-age N (opt-in age filter; default none — listed = open) · --out <file> (also write the JSON there) · --dry-run (classify, no network)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeHttpCtx } from './providers/_http.mjs';
import greenhouse from './providers/greenhouse.mjs';
import lever from './providers/lever.mjs';
import ashby from './providers/ashby.mjs';
import workable from './providers/workable.mjs';
import smartrecruiters from './providers/smartrecruiters.mjs';
import recruitee from './providers/recruitee.mjs';
import workday from './providers/workday.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'output', 'web-research', 'companies.json');
const DAY = 86_400_000;

// ── Classification lists (registrable domains; a host matches the domain or any subdomain) ────────────────────
// GARY's own channels: an offer there belongs to THAT channel, never to Web.
export const CHANNEL_HOSTS = {
  'linkedin.com': 'LinkedIn', 'indeed.com': 'Indeed', 'computrabajo.com': 'Computrabajo', 'getonbrd.com': 'GetOnBoard',
  'getonboard.com': 'GetOnBoard', 'himalayas.app': 'Himalayas', 'glassdoor.com': 'Glassdoor', 'glassdoor.co.in': 'Glassdoor',
  'dice.com': 'Dice', 'hireline.io': 'Hireline', 'jobs.dover.com': 'Dover', 'workingnomads.com': 'ATS', 'jobspresso.co': 'ATS',
  'remotive.com': 'ATS', 'remoteok.com': 'ATS', 'jobicy.com': 'ATS', 'weworkremotely.com': 'ATS', 'themuse.com': 'ATS',
};
// Job boards / aggregators / scrapers (list offers of MANY employers). Non-exhaustive — the LM applies the same
// test to any unknown host (§3 of the skill): a page listing jobs of many companies is a board.
export const BOARD_HOSTS = [
  'mipleo.com.co', 'mipleo.com', 'elempleo.com', 'magneto365.com', 'bumeran.com', 'bumeran.com.ar', 'bumeran.com.pe',
  'zonajobs.com.ar', 'occ.com.mx', 'opcionempleo.com', 'opcionempleo.com.co', 'jooble.org', 'talent.com', 'neuvoo.com',
  'careerjet.com', 'careerjet.com.co', 'trabajando.com', 'laborum.cl', 'infojobs.net', 'tecnoempleo.com', 'empleos.net',
  'trabajos.com', 'jobrapido.com', 'jobisjob.com', 'whatjobs.com', 'lensa.com', 'ziprecruiter.com', 'monster.com',
  'careerbuilder.com', 'simplyhired.com', 'adzuna.com', 'jobgether.com', 'remoterocketship.com', 'builtin.com',
  'wellfound.com', 'angel.co', 'remote.co', 'flexjobs.com', 'nodesk.co', 'remoteleaf.com',
  'justremote.co', 'dynamitejobs.com', 'echojobs.io', 'jobleads.com', 'joblist.com', 'learn4good.com', 'theirstack.com',
  'startup.jobs', 'ycombinator.com', 'workatastartup.com', 'otta.com', 'welcometothejungle.com', 'landing.jobs',
  'remoteyeah.com', 'remotefront.com', 'jobsinlatam.com', 'latamremotejobs.com', 'empleo.gob', 'serviciodeempleo.gov.co',
  'trabajo.org', 'co.trabajo.org', 'jobted.com', 'jobvertise.com', 'glints.com', 'naukri.com', 'stepstone.de', 'xing.com',
  'catho.com.br', 'vagas.com.br', 'infojobs.com.br', 'trampos.co', 'programathor.com.br', 'geekhunter.com.br',
  'freehire.me', 'jobtarget.com', 'jobs.jobtarget.com', 'web3.career', 'cryptojobslist.com',
  'javascript.jobs', 'jointaro.com', 'y-axis.com', 'aijobs.app', 'expertini.work', 'expertini.com', 'catalitium.com',
  'jobless.dev', 'ticjob.co', 'joinrise.co', 'seedtable.com', 'jobs-radar.com',
];
// Talent marketplaces / staffing platforms / recruiters that place you with an UNDISCLOSED client — not the employer.
export const MARKETPLACE_HOSTS = [
  'turing.com', 'toptal.com', 'andela.com', 'hirelatam.com', 'arc.dev', 'lemon.io', 'revelo.com', 'x-team.com',
  'braintrust.com', 'usebraintrust.com', 'crossover.com', 'vanhack.com', 'xpertdirect.io', 'torre.ai', 'torre.co', 'tecla.io', 'manfred.com', 'getmanfred.com',
  'upwork.com', 'freelancer.com', 'workana.com', 'contra.com', 'gun.io', 'terminal.io',
  'micro1.ai', 'mercor.com', 'outlier.ai', 'dataannotation.tech', 'alignerr.com', 'immiland.com',
];
// ATS hosts with no list provider here: still the company's own board (direct), the LM reads the page.
const OTHER_ATS = [
  'bamboohr.com', 'breezy.hr', 'teamtailor.com', 'pinpointhq.com', 'gupy.io', 'personio.de', 'personio.com',
  'factorialhr.com', 'jobvite.com', 'icims.com', 'taleo.net', 'successfactors.com', 'rippling-ats.com', 'ats.rippling.com',
  'jazzhr.com', 'applytojob.com', 'comeet.com', 'homerun.co', 'workforcenow.adp.com', 'paylocity.com', 'ultipro.com',
  'hirehive.com', 'kula.ai', 'trakstar.com', 'freshteam.com', 'zohorecruit.com', 'manatal.com', 'polymer.co', 'gem.com',
];
// Boards / marketplaces that run their OWN board on a real ATS (e.g. an aggregator's Lever page) — not employers.
export const BOARD_SLUGS = { lever: ['jobgether'], workable: ['workana-premium', 'workana'], greenhouse: [], ashby: ['jobgether'] };
// Unlisted ATS on a SHARED host (jobs.jobvite.com/<company>, jobs.breezy.hr/…): the company is the first path segment.
const SHARED_ATS_HOST = /^(?:jobs|careers|apply|app|boards)\./;
const PROVIDERS = [greenhouse, lever, ashby, workable, smartrecruiters, recruitee, workday];

// ── Link safety (the LM's WebSearch results are UNTRUSTED input) ─────────────────────────────────────────────
// Only plain public HTTPS pages: no http, no credentials in the URL, no IP literals / localhost / private nets
// (SSRF), no odd ports, no link shorteners (hide the real target), no direct file downloads. The DNS answer is
// checked too (assertPublicHost) so a public-looking name can't point at the user's LAN.
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'is.gd',
  'shorturl.at', 'lnkd.in', 'rb.gy', 't.ly', 'tiny.cc', 'bl.ink', 's.id', 'shorturl.com', 'linktr.ee'];
const FILE_EXT = /\.(?:exe|msi|dmg|pkg|apk|bat|cmd|ps1|sh|scr|jar|zip|rar|7z|gz|tgz|iso|docm|xlsm|js|vbs)(?:$|[?#])/i;
export function urlSafety(url) {
  let u; try { u = new URL(url); } catch { return { ok: false, reason: 'not a URL' }; }
  if (u.protocol !== 'https:') return { ok: false, reason: 'not https' };
  if (u.username || u.password) return { ok: false, reason: 'credentials in URL' };
  if (u.port && u.port !== '443') return { ok: false, reason: `non-standard port ${u.port}` };
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h.endsWith('.local') || h.endsWith('.internal') || h === 'localhost') return { ok: false, reason: 'local host' };
  if (/^[\d.]+$/.test(h) || h.startsWith('[')) return { ok: false, reason: 'IP literal' };
  if (h.split('.').some((l) => l.startsWith('xn--'))) return { ok: false, reason: 'punycode host (possible look-alike)' };
  if (SHORTENERS.some((d) => h === d || h.endsWith('.' + d))) return { ok: false, reason: 'link shortener' };
  if (FILE_EXT.test(u.pathname)) return { ok: false, reason: 'file download' };
  return { ok: true };
}
const PRIVATE_IP = /^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|::$|f[cd][0-9a-f]{2}:|fe80:|::ffff:(?:10|127|192\.168|169\.254)\.)/i;
export async function assertPublicHost(url) {
  const { lookup } = await import('dns/promises');
  const addrs = await lookup(new URL(url).hostname, { all: true });
  if (!addrs.length || addrs.some((a) => PRIVATE_IP.test(a.address))) throw new Error('host resolves to a private/loopback address');
}
// GET a company page safely: re-validates every redirect hop (max 3), HTML only, 2 MB cap, 15 s timeout.
// Text only — nothing is executed, rendered or saved; the page never reaches the user's browser.
export async function safeGetHtml(url) {
  let cur = url;
  for (let hop = 0; hop <= 3; hop++) {
    const s = urlSafety(cur);
    if (!s.ok) throw new Error(`unsafe link (${s.reason}): ${cur}`);
    await assertPublicHost(cur);
    const res = await fetch(cur, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { accept: 'text/html' } });
    if (res.status >= 300 && res.status < 400) { cur = new URL(res.headers.get('location') || '', cur).href; continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!/text\/html|application\/xhtml/i.test(res.headers.get('content-type') || '')) throw new Error('not an HTML page');
    if (Number(res.headers.get('content-length') || 0) > 2_000_000) throw new Error('page too large');
    const reader = res.body.getReader(); const chunks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2_000_000) { reader.cancel(); break; } chunks.push(value); }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('too many redirects');
}

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const onDomain = (host, d) => host === d || host.endsWith('.' + d);

// URL → { kind, provider?, slug?, careers_url?, channel? }
export function classify(url) {
  const safe = urlSafety(url);
  if (!safe.ok) return { kind: 'unsafe', reason: safe.reason };
  const host = hostOf(url);
  const u = url.replace(/^http:/, 'https:');
  const ats = [
    ['greenhouse', /(?:boards|job-boards(?:\.eu)?)\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=)?([\w-]+)/i, (s) => `https://job-boards.greenhouse.io/${s}`],
    ['greenhouse', /boards-api\.greenhouse\.io\/v1\/boards\/([\w-]+)/i, (s) => `https://job-boards.greenhouse.io/${s}`],
    ['lever', /jobs(?:\.eu)?\.lever\.co\/([\w.-]+)/i, (s) => `https://jobs.lever.co/${s}`],
    ['ashby', /jobs\.ashbyhq\.com\/([\w.%-]+)/i, (s) => `https://jobs.ashbyhq.com/${s}`],
    ['workable', /apply\.workable\.com\/([\w-]+)/i, (s) => `https://apply.workable.com/${s}`],
    ['smartrecruiters', /(?:careers|jobs)\.smartrecruiters\.com\/([\w-]+)/i, (s) => `https://jobs.smartrecruiters.com/${s}`],
    ['recruitee', /([\w-]+)\.recruitee\.com/i, (s) => `https://${s}.recruitee.com`],
  ];
  for (const [provider, re, mk] of ats) {
    const m = u.match(re);
    if (m && /^\w[\w%-]*(?:\.[\w%-]+)*$/.test(m[1]) && !['embed', 'v1', 'api', 'www'].includes(m[1].toLowerCase())) {
      if (BOARD_SLUGS[provider]?.includes(m[1].toLowerCase())) return { kind: 'board' };
      return { kind: 'ats', provider, slug: m[1].toLowerCase(), careers_url: mk(m[1]) };
    }
  }
  const wd = u.match(/^https:\/\/([\w-]+)\.(wd[\w-]*)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/);
  if (wd) return { kind: 'ats', provider: 'workday', slug: `${wd[1]}/${wd[3]}`.toLowerCase(), careers_url: `https://${wd[1]}.${wd[2]}.myworkdayjobs.com/${wd[3]}` };
  for (const [d, channel] of Object.entries(CHANNEL_HOSTS)) if (onDomain(host, d)) return { kind: 'board', channel };
  if (MARKETPLACE_HOSTS.some((d) => onDomain(host, d))) return { kind: 'marketplace' };
  if (BOARD_HOSTS.some((d) => onDomain(host, d))) return { kind: 'board' };
  if (OTHER_ATS.some((d) => onDomain(host, d))) {
    const seg = new URL(u).pathname.split('/').filter(Boolean)[0] || '';
    const shared = SHARED_ATS_HOST.test(host) && seg;
    return { kind: 'ats', provider: null, slug: (shared ? seg : host.split('.')[0]).toLowerCase(), careers_url: shared ? `https://${host}/${seg}` : `https://${host}` };
  }
  return { kind: 'site', host };
}

// Embedded ATS links inside a company careers page (iframes, "View openings" buttons, script configs).
export function findEmbeddedAts(html) {
  const out = new Map();
  const re = /https?:\/\/(?:boards|job-boards(?:\.eu)?)\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=)?[\w-]+|https?:\/\/jobs(?:\.eu)?\.lever\.co\/[\w.-]+|https?:\/\/jobs\.ashbyhq\.com\/[\w.%-]+|https?:\/\/apply\.workable\.com\/[\w-]+|https?:\/\/(?:careers|jobs)\.smartrecruiters\.com\/[\w-]+|https?:\/\/[\w-]+\.recruitee\.com|https?:\/\/[\w-]+\.wd[\w-]*\.myworkdayjobs\.com\/[^"'\s<>?#]+/gi;
  for (const m of String(html).matchAll(re)) {
    const c = classify(m[0].replace(/^http:/i, 'https:'));
    if (c.kind === 'ats' && c.provider) out.set(`${c.provider}:${c.slug}`, c);
  }
  // `Grnhse.Settings.boardToken = "acme"` / `data-board-token="acme"`
  for (const m of String(html).matchAll(/board[_-]?token["'\s:=]+["']([\w-]+)["']/gi)) {
    out.set(`greenhouse:${m[1].toLowerCase()}`, { kind: 'ats', provider: 'greenhouse', slug: m[1].toLowerCase(), careers_url: `https://job-boards.greenhouse.io/${m[1]}` });
  }
  return [...out.values()];
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+#]+/g, ' ').trim();
export function titleMatcher(kws) {
  const list = kws.map(norm).filter(Boolean);
  return (title) => { const t = norm(title); return list.length === 0 || list.some((k) => t.includes(k)); };
}

// HTML (also entity-escaped HTML, as Greenhouse returns) → plain text.
export function htmlToText(h) {
  const dec = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return dec(dec(String(h || ''))).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
// The requirements part of a JD (what §6.1 scores), else the start of the text. Capped so the LM reads little.
const REQ_HEAD = /(requirements|requisitos|qualifications|what you('|’)ll (need|bring)|what we('|’)re looking for|you (have|bring|are)|must[- ]haves?|about you|your profile|perfil|lo que buscamos|lo que necesitas|necesitamos|experiencia requerida|skills)/i;
export function requirementsOf(text, cap = 1800) {
  const lines = String(text).split('\n');
  const i = lines.findIndex((l) => l.length < 90 && REQ_HEAD.test(l));
  const body = (i >= 0 ? lines.slice(i) : lines).join('\n');
  return body.length > cap ? body.slice(0, cap) + ' …' : body;
}
// Location string vs the candidate's places (--places "country|region|city…"): match · remote-open · foreign · unspecified.
const LOCKED = /\b(us|usa|united states|u s|uk|united kingdom|europe|eu|emea|canada|india|apac|australia|germany|spain|poland)\b/;
export function placeOf(location, places) {
  const l = norm(location);
  if (!l) return 'unspecified';
  if (places.some((p) => p && l.includes(norm(p)))) return 'match';
  if (/\b(remote|remoto|anywhere|worldwide|international|global|work from home|latam)\b/.test(l) && !LOCKED.test(l)) return 'remote-open';
  return 'foreign';
}
// Role URL → its provider's public JSON (one GET, 0 tokens) + how to pick the JD text out of it.
export function jdSource(url) {
  const c = classify(url);
  if (c.kind !== 'ats' || !c.provider) return null;
  const segs = new URL(url).pathname.split('/').filter(Boolean);
  const id = segs[segs.length - 1] || '';
  if (c.provider === 'greenhouse') {
    const gid = (url.match(/jobs\/(\d+)/) || url.match(/gh_jid=(\d+)/) || [])[1];
    return gid && { api: `https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs/${gid}`, pick: (j) => htmlToText(j?.content), loc: (j) => j?.location?.name };
  }
  if (c.provider === 'lever') return segs.length > 1 && { api: `https://api.lever.co/v0/postings/${c.slug}/${id}`,
    pick: (j) => [j?.descriptionPlain, ...(j?.lists || []).map((x) => `${x.text}\n${htmlToText(x.content)}`), j?.additionalPlain].filter(Boolean).join('\n'),
    loc: (j) => [j?.categories?.location, j?.workplaceType].filter(Boolean).join(' · ') };
  if (c.provider === 'ashby') return segs.length > 1 && { api: `https://api.ashbyhq.com/posting-api/job-board/${c.slug}`,
    pick: (b) => { const j = (b?.jobs || []).find((x) => String(x.id) === id || String(x.jobUrl || '').includes(id)); return j ? (j.descriptionPlain || htmlToText(j.descriptionHtml)) : null; },
    loc: (b) => { const j = (b?.jobs || []).find((x) => String(x.id) === id || String(x.jobUrl || '').includes(id)); return j && [j.location, j.workplaceType, ...(j.secondaryLocations || []).map((s) => s.location)].filter(Boolean).join(' · '); } };
  if (c.provider === 'smartrecruiters') { const pid = (id.match(/^\d{6,}/) || [])[0];
    return pid && { api: `https://api.smartrecruiters.com/v1/companies/${segs[0]}/postings/${pid}`,
      pick: (j) => Object.values(j?.jobAd?.sections || {}).map((x) => `${x.title || ''}\n${htmlToText(x.text)}`).join('\n'),
      loc: (j) => [j?.location?.city, j?.location?.country, j?.location?.remote ? 'remote' : ''].filter(Boolean).join(' · ') }; }
  return null;
}
const isTimeout = (e) => /abort|timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(String(e?.message || e));

function defaultKeywords() {
  try {
    const f = JSON.parse(readFileSync(path.join(ROOT, 'config', 'easyapply-filter.json'), 'utf8'));
    return (f.titles || []).filter((t) => t && !/\{\{/.test(t));
  } catch { return []; }
}
// Geographic tiers of the target-employer plan (skill source-web §3 Step 0), in search order.
export const TIERS = ['country', 'region', 'city', 'global'];
const leadSlug = (n) => String(n).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tierRank = (t) => { const i = TIERS.indexOf(t); return i < 0 ? TIERS.length : i; };
const loadCache = () => { try { return JSON.parse(readFileSync(CACHE, 'utf8')); } catch { return { companies: {} }; } };

async function main() {
  const argv = process.argv.slice(2);
  const flag = (n) => argv.includes(n);
  const val = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const maxAge = Number(val('--max-age', Infinity));
  const out = val('--out', '');
  const valued = new Set(['--urls', '--kw', '--max-age', '--out', '--jd', '--places']);
  const places = (val('--places', '') || '').split('|').map((x) => x.trim()).filter(Boolean);
  let urls = argv.filter((a, i) => /^https?:\/\//i.test(a) && !valued.has(argv[i - 1]));
  const file = val('--urls', '');
  if (file) urls.push(...readFileSync(file, 'utf8').split(/\s+/).filter((s) => /^https?:\/\//i.test(s)));
  urls = [...new Set(urls)];
  const kws = (val('--kw', '') || '').split('|').map((s) => s.trim()).filter(Boolean);
  const keywords = kws.length ? kws : defaultKeywords();

  const classified = urls.map((url) => ({ url, ...classify(url) }));
  const report = {
    generated: new Date().toISOString(), maxAgeDays: Number.isFinite(maxAge) ? maxAge : null, keywords,
    notDirect: classified.filter((c) => c.kind === 'board' || c.kind === 'marketplace')
      .map(({ url, kind, channel }) => ({ url, kind, ...(channel ? { channel } : {}) })),
    unsafe: classified.filter((c) => c.kind === 'unsafe').map(({ url, reason }) => ({ url, reason })),
    toConfirm: [], jsShell: [], atsUnlisted: [], closedHits: [], portals: [], leads: [], companies: [], errors: [],
  };
  // Cache maintenance (no network): register an employer's own careers portal / mark an entry as skipped.
  if (flag('--add-portal') || flag('--skip') || flag('--add-lead')) {
    const cache = loadCache();
    const tier = val('--tier', '');
    if (tier && !TIERS.includes(tier)) { console.error(`--tier must be one of ${TIERS.join('|')}`); process.exit(2); }
    if (flag('--add-lead')) {
      if (!tier) { console.error('--add-lead needs --tier'); process.exit(2); }
      const sector = val('--sector', '');
      for (const name of val('--add-lead', '').split('|').map((n) => n.trim()).filter(Boolean)) {
        const key = `lead:${leadSlug(name)}`;
        if (Object.values(cache.companies).some((c) => c.kind !== 'lead' && leadSlug(c.name || '') === leadSlug(name))) continue; // already resolved
        cache.companies[key] = { ...(cache.companies[key] || {}), kind: 'lead', name, tier, ...(sector ? { sector } : {}),
          firstSeen: cache.companies[key]?.firstSeen || new Date().toISOString().slice(0, 10) };
      }
      console.log(`leads: ${Object.values(cache.companies).filter((c) => c.kind === 'lead').length}`);
    }
    if (flag('--add-portal')) {
      const url = val('--add-portal', ''); const c = classify(url);
      if (c.kind === 'unsafe' || c.kind === 'board' || c.kind === 'marketplace') { console.error(`refused: ${c.kind} ${c.reason || ''} ${url}`); process.exit(2); }
      const key = c.kind === 'ats' && c.provider ? `${c.provider}:${c.slug}` : c.kind === 'ats' ? `portal:${hostOf(url)}/${c.slug}` : `portal:${hostOf(url)}`;
      cache.companies[key] = { ...(cache.companies[key] || {}), ...(c.provider ? c : { kind: 'portal', careers_url: url }), name: val('--name', hostOf(url)),
        ...(tier ? { tier } : {}), firstSeen: cache.companies[key]?.firstSeen || new Date().toISOString().slice(0, 10) };
      const lead = `lead:${leadSlug(cache.companies[key].name)}`;
      if (cache.companies[lead]) { cache.companies[key].tier ||= cache.companies[lead].tier; delete cache.companies[lead]; } // lead resolved
      console.log(`added ${key}`);
    }
    if (flag('--skip')) {
      const key = val('--skip', '');
      if (!cache.companies[key]) { console.error(`no cache entry ${key}`); process.exit(2); }
      cache.companies[key].skip = val('--reason', 'skipped');
      console.log(`skipped ${key}`);
    }
    mkdirSync(path.dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify(cache, null, 2));
    return;
  }
  if (flag('--classify-only') || flag('--dry-run')) {
    report.ats = classified.filter((c) => c.kind === 'ats');
    report.toConfirm = classified.filter((c) => c.kind === 'site').map((c) => c.url);
    return emit(report, out);
  }

  // Same API hosts as the ATS scan → same lock: never both at once (one bot per site, CLAUDE.md).
  const { acquireSiteLock } = await import('./_site-lock.mjs');
  await acquireSiteLock('ats-scan');
  const ctx = makeHttpCtx();
  // --jd <role url>: the JD's requirements straight from the provider's public JSON (Ashby/Lever/Greenhouse/
  // SmartRecruiters) — replaces a WebFetch of a JS-only page or a 700k-char board (0 tokens until the LM reads it).
  if (flag('--jd')) {
    const url = val('--jd', ''); const src = jdSource(url);
    if (!src) { console.error(`--jd: not a role URL of a supported ATS (greenhouse/lever/ashby/smartrecruiters): ${url}`); process.exit(2); }
    let j; try { j = await ctx.fetchJson(src.api, { redirect: 'error' }); } catch (e) {
      if (!isTimeout(e)) throw e; await new Promise((r) => setTimeout(r, 3000)); j = await ctx.fetchJson(src.api, { redirect: 'error' }); }
    const text = src.pick(j);
    if (!text) { console.log(JSON.stringify({ url, closed: true, why: 'role not in the provider data any more' })); return; }
    const location = src.loc(j) || '';
    return emit({ url, location, ...(places.length ? { place: placeOf(location, places) } : {}), requirements: requirementsOf(text) }, out);
  }
  const cache = loadCache();
  const hitUrls = new Map(); // target key → the role URLs the search returned (to flag the ones no longer listed)
  const targets = new Map();
  const addTarget = (c, source) => { if (c.provider) targets.set(`${c.provider}:${c.slug}`, { ...c, source }); };
  // ATS without a list provider (Jobvite, Breezy, Teamtailor…) are DIRECT — the LM just reads the board page.
  for (const c of classified) if (c.kind === 'ats') {
    if (!c.provider) { report.atsUnlisted.push(c.careers_url); continue; }
    addTarget(c, c.url);
    const k = `${c.provider}:${c.slug}`; hitUrls.set(k, [...(hitUrls.get(k) || []), c.url]);
  }
  if (flag('--recheck')) for (const [key, c] of Object.entries(cache.companies).sort((a, b) => tierRank(a[1].tier) - tierRank(b[1].tier))) {
    if (c.skip) continue;
    if (c.kind === 'lead') { report.leads.push({ name: c.name, tier: c.tier, ...(c.sector ? { sector: c.sector } : {}) }); continue; }
    if (c.kind === 'portal') report.portals.push({ key, name: c.name, careers_url: c.careers_url, tier: c.tier || null });
    else addTarget(c, 'cache');
  }

  for (const c of classified.filter((x) => x.kind === 'site')) {
    if (!flag('--resolve')) { report.toConfirm.push(c.url); continue; }
    try {
      // Employer home or careers page → embedded ATS; else follow ONE careers link on the same site (or to an ATS).
      let page = c.url; let html = await safeGetHtml(page);
      let found = findEmbeddedAts(html);
      if (!found.length) {
        const link = [...html.matchAll(/href=["']([^"'#\s]+)["']/gi)].map((m) => { try { return new URL(m[1], page).href; } catch { return null; } })
          .filter((h) => h && h !== page && urlSafety(h).ok)
          .find((h) => { const u = new URL(h); return /career|jobs?\b|empleo|vacante|trabaja|join|work-with-us|trabalhe|vagas/i.test(u.pathname + ' ' + u.hostname.split('.')[0])
            && (onDomain(u.hostname.replace(/^www\./, ''), hostOf(page).split('.').slice(-2).join('.')) || classify(h).kind === 'ats'); });
        if (link) {
          const lc = classify(link);
          if (lc.kind === 'ats') { found = [lc]; } else { page = link; html = await safeGetHtml(link); found = findEmbeddedAts(html); }
        }
      }
      for (const f of found) { if (f.provider) addTarget(f, c.url); else report.atsUnlisted.push(f.careers_url); }
      if (!found.length) {
        report.toConfirm.push(page);
        // A JavaScript shell (little text, scripts) can't be read as text — look for its JSON or skip (§3.2).
        if (/<script/i.test(html) && htmlToText(html).length < 600) report.jsShell.push(page);
      }
    } catch (e) { report.toConfirm.push(c.url); report.errors.push({ url: c.url, error: String(e.message || e).slice(0, 160) }); }
  }

  const match = titleMatcher(keywords);
  const now = Date.now();
  for (const [key, t] of targets) {
    const provider = PROVIDERS.find((p) => p.id === t.provider);
    const entry = { name: t.name || t.slug, careers_url: t.careers_url };
    if (!provider?.detect?.(entry)) { report.atsUnlisted.push(t.careers_url); continue; }
    try {
      let jobs;
      try { jobs = await provider.fetch(entry, ctx); }
      catch (e) { if (!isTimeout(e)) throw e; await new Promise((r) => setTimeout(r, 3000)); jobs = await provider.fetch(entry, ctx); } // one retry on timeout, never on 4xx/429
      let old = 0, other = 0;
      const keep = [];
      for (const j of jobs) {
        if (!match(j.title)) { other++; continue; }
        const days = typeof j.postedAt === 'number' ? Math.floor((now - j.postedAt) / DAY) : null;
        if (days !== null && days > maxAge) { old++; continue; }
        keep.push({ title: j.title, url: j.url, location: j.location || '', postedDays: days, ...(places.length ? { place: placeOf(j.location, places) } : {}) });
      }
      keep.sort((a, b) => (a.postedDays ?? 1e9) - (b.postedDays ?? 1e9)); // newest first, undated last
      // Search hits for this board that are no longer on its live list → closed (don't spend a read on them).
      const listed = jobs.map((j) => j.url).join(' ');
      for (const h of hitUrls.get(key) || []) {
        const last = new URL(h).pathname.split('/').filter(Boolean).pop() || '';
        const id = (h.match(/gh_jid=(\d+)/) || [])[1] || (last.match(/^\d{6,}/) || [])[0] || last;
        if (id.length > 5 && id.toLowerCase() !== t.slug && !listed.includes(id)) report.closedHits.push(h);
      }
      report.companies.push({ key, tier: cache.companies[key]?.tier || t.tier || null, provider: t.provider, slug: t.slug, careers_url: t.careers_url, found_via: t.source, open: jobs.length, matching: keep, olderThanWindow: old, otherTitles: other });
      cache.companies[key] = { ...(cache.companies[key] || {}), provider: t.provider, slug: t.slug, careers_url: t.careers_url,
        name: cache.companies[key]?.name || t.slug, firstSeen: cache.companies[key]?.firstSeen || new Date().toISOString().slice(0, 10),
        lastChecked: new Date().toISOString().slice(0, 10), lastMatches: keep.length };
    } catch (e) { report.errors.push({ key, error: String(e.message || e).slice(0, 160) }); }
  }
  report.toConfirm = [...new Set(report.toConfirm)];
  report.atsUnlisted = [...new Set(report.atsUnlisted)];
  report.jsShell = [...new Set(report.jsShell)];
  mkdirSync(path.dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  emit(report, out);
}

function emit(report, out) {
  const s = JSON.stringify(report, null, 2);
  if (out) { mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); writeFileSync(out, s); }
  console.log(s);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`web-companies: ${e.stack || e}`); process.exit(1); });
}
