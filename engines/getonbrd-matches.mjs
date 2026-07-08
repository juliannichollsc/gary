// GetOnBoard /myjobs sweep — filters + "Load more" pagination + per-offer JD read + eligibility.
// Method (canonical, see .claude/agents/source-getonbrd.md & memory sourcing-always-read-jd):
//   1. /myjobs filters persist (Programming · Full time · Semi Senior+Senior · salary min 2500). Re-affirm min.
//   2. Click "Load more jobs" until exhausted; scrape EVERY card {url,title,seniority,type,location,date}.
//   3. GetOnBoard has NO date filter → drop cards older than 1 week OURSELVES (from the card date).
//   4. Read EACH surviving offer's JD via the logged-in CDP browser (~0 tokens, no captcha) and capture
//      the description + remote-policy/location/sponsorship signals. GetOnBoard is LATAM-heavy and full of
//      region-locked posts ("Remote (Chile…)", "Santiago (Hybrid)") — an offer only serves the candidate if it is
//      remote-worldwide, remote-LATAM-incl-Colombia, on-site/hybrid in the configured city, OR offers visa sponsorship.
//      Hybrid/on-site outside the configured city and remote-restricted-excluding-Colombia w/o sponsorship → flagged DROP.
// Output: output/gmail-harvest/getonbrd-jobs.json + getonbrd-matches.txt (eligible urls).
// Usage: node engines/getonbrd-matches.mjs [--min 2500] [--days 7] [--max-loads 60] [--no-desc]
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9333';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MIN = arg('--min', '2500'), DAYS = parseInt(arg('--days', '7'), 10), MAX_LOADS = parseInt(arg('--max-loads', '5'), 10);
const NO_DESC = argv.includes('--no-desc');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
const now = new Date(); const cutoff = new Date(now.getTime() - DAYS * 864e5);
const parseCardDate = (s) => { const m = (s || '').match(/([A-Z][a-z]{2})\s+(\d{1,2})/); if (!m) return null; const mo = MONTHS[m[1].toLowerCase()]; if (mo == null) return null; let y = now.getFullYear(); const d = new Date(y, mo, +m[2]); if (d > now) d.setFullYear(y - 1); return d; };

let browser;
try { browser = await chromium.connectOverCDP(CDP); }
catch { console.error(`CDP down at ${CDP} — relaunch Chrome and retry.`); process.exit(1); }
const ctx = browser.contexts()[0];
mkdirSync('output/gmail-harvest', { recursive: true });
const p = await ctx.newPage();
await p.goto('https://www.getonbrd.com/myjobs', { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
await p.waitForTimeout(2500);

// re-affirm salary minimum (chip opens "$USD/month from [N]  Save")
try {
  const chip = p.locator('button').filter({ hasText: /2500|salary|menos de|less than/i }).first();
  if (await chip.count()) {
    await chip.click().catch(() => {}); await p.waitForTimeout(900);
    const inp = p.locator('input[type="number"], input[placeholder*="2500"]').last();
    if (await inp.count()) await inp.fill(String(MIN)).catch(() => {});
    const save = p.locator('a,button').filter({ hasText: /^\s*Save\s*$|Guardar/i }).first();
    if (await save.count()) { await save.click().catch(() => {}); await p.waitForTimeout(1500); }
  }
} catch {}
await p.waitForTimeout(1200);
const chips = await p.evaluate(() => [...document.querySelectorAll('button')].map(b => (b.innerText || '').replace(/\s+/g, ' ').trim()).filter(t => /programming|semi senior|senior|full time|2500/i.test(t)));
console.log('Active filters:', JSON.stringify([...new Set(chips)]));

// paginate via "Load more jobs" — STOP EARLY: GetOnBoard has no date filter and the feed runs
// newest→oldest, so once "Load more" stops adding cards within the week (or after MAX_LOADS≈5
// steps, the config rule: >5 steps means we've gone past the week) there's no point paginating more.
const cardSel = 'a[href*="/jobs/programming/"]';
const minDateOnPage = () => p.evaluate((sel) => {
  const MM = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const now = new Date(); let min = null;
  for (const a of document.querySelectorAll(sel)) {
    const card = a.closest('[class*=card], li, article') || a.parentElement || a;
    const m = (card.innerText || '').match(/([A-Z][a-z]{2})\s+(\d{1,2})/);
    if (!m || MM[m[1].toLowerCase()] == null) continue;
    let d = new Date(now.getFullYear(), MM[m[1].toLowerCase()], +m[2]); if (d > now) d.setFullYear(now.getFullYear() - 1);
    if (!min || d < min) min = d;
  }
  return min ? min.getTime() : null;
}, cardSel);
let loads = 0;
for (; loads < MAX_LOADS; loads++) {
  const before = await p.locator(cardSel).count();
  const btn = p.locator('button', { hasText: /load more jobs|cargar más/i }).first();
  if (!(await btn.count()) || !(await btn.isVisible().catch(() => false))) { console.log(`No more "Load more" (cards=${before}).`); break; }
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click().catch(() => {});
  await p.waitForTimeout(1700);
  const after = await p.locator(cardSel).count();
  const oldest = await minDateOnPage();
  const oldestStr = oldest ? new Date(oldest).toISOString().slice(0, 10) : '?';
  console.log(`  load #${loads + 1}: ${before} → ${after} cards (oldest ${oldestStr})`);
  if (after === before) { console.log('count stopped growing — done.'); break; }
  if (oldest && oldest < cutoff.getTime()) { console.log(`oldest card is past ${DAYS}d window — stop paginating.`); break; }
}

// scrape all cards
let jobs = await p.evaluate(() => {
  const seen = new Set(); const out = [];
  for (const a of document.querySelectorAll('a[href*="/jobs/programming/"]')) {
    const url = a.href.split('?')[0]; if (seen.has(url)) continue; seen.add(url);
    const card = a.closest('[class*=card], li, article') || a.parentElement || a;
    const txt = (card.innerText || '').replace(/\s+/g, ' ').trim();
    out.push({
      url, title: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      seniority: (txt.match(/\b(Semi Senior|Senior|Expert|Junior)\b/) || [])[0] || '',
      type: (txt.match(/\b(Full time|Part time|Freelance|Internship)\b/) || [])[0] || '',
      location: (txt.match(/Remote[^•|]{0,40}|Hybrid[^•|]{0,40}|On-?site[^•|]{0,40}/i) || [])[0]?.trim() || '',
      date: (txt.match(/\b[A-Z][a-z]{2} \d{1,2}\b/) || [])[0] || '',
    });
  }
  return out;
});
const scraped = jobs.length;
// recency filter (≤ DAYS) — GetOnBoard has no date filter in UI
jobs = jobs.filter(j => { const d = parseCardDate(j.date); return d ? d >= cutoff : true; });

// PATTERN PRE-FILTER on the card location — skip region-locked/hybrid WITHOUT reading the JD
// (the config rule: don't review them all). The card already shows "Remote (Chile)", "… (Hybrid)",
// "Remote (Any location)", etc. Only remote-worldwide / LATAM-or-Colombia / blank stays for JD read;
// hybrid/on-site and remote-restricted-to-other-countries are dropped by card pattern.
const CARD_DROP = (loc) => {
  const L = (loc || '').toLowerCase();
  if (!L) return false; // blank → ambiguous, read JD
  if (/hybrid|on-?site|presencial/.test(L)) return true;
  const par = (L.match(/remote\s*\(([^)]*)\)/) || [])[1];
  if (par && !/any|world|anywhere|global|latin|americas|latam|colombia|remote/.test(par)) return true; // remote but locked to other place(s)
  return false;
};
const droppedByCard = jobs.filter(j => CARD_DROP(j.location));
jobs = jobs.filter(j => !CARD_DROP(j.location));
droppedByCard.forEach(j => { j.eligible = false; j.dropReason = 'card-region-locked'; });
console.log(`Scraped ${scraped} cards → ${jobs.length + droppedByCard.length} within ${DAYS}d → ${droppedByCard.length} dropped by card pattern → ${jobs.length} to JD-read.`);

// read each JD via CDP + eligibility signals (only the card-survivors)
if (!NO_DESC) {
  // location keywords come from config/profile.yml (location.country/city) — configured country kept; on-site city literal removed for open-source
  const ELIG = /remote.{0,30}(any|world|anywhere|global|latin|americas|colombia)|work from anywhere|visa|sponsor|relocat|colombia/i;
  const LOCK = /remote.{0,20}\((?!.*(any|world|anywhere|global|latin|americas|colombia))[^)]*\)|hybrid|on-?site|must be (located|based)/i;
  const extract = async (job) => {
    const jp = await ctx.newPage();
    try {
      await jp.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await jp.waitForTimeout(1500);
      const d = await jp.evaluate(() => { const m = document.querySelector('main') || document.body; return (m.innerText || '').replace(/\s+/g, ' ').trim(); });
      job.description = d.slice(0, 6000);
      job.remotePolicy = (d.match(/Remote work policy[^.]{0,80}/i) || [])[0] || '';
      job.eligible = ELIG.test(d) && !LOCK.test(job.location + ' ' + (job.remotePolicy || ''));
    } catch (e) { job.description = `ERROR: ${e.message.split('\n')[0]}`; job.eligible = false; }
    await jp.close().catch(() => {});
  };
  for (let i = 0; i < jobs.length; i += 2) {
    await Promise.all(jobs.slice(i, i + 2).map(extract));
    console.log(`  JD ${Math.min(i + 2, jobs.length)}/${jobs.length}`);
    if (i + 2 < jobs.length) await sleep(2000);
  }
}

const allJobs = [...jobs, ...droppedByCard];
writeFileSync('output/gmail-harvest/getonbrd-jobs.json', JSON.stringify(allJobs, null, 2));
const elig = jobs.filter(j => j.eligible);
writeFileSync('output/gmail-harvest/getonbrd-matches.txt', elig.map(j => j.url).join('\n') + '\n');
console.log(`\nSaved ${allJobs.length} jobs (${droppedByCard.length} card-dropped, ${jobs.length} JD-read, ${elig.length} location-eligible) → getonbrd-jobs.json`);
await p.close().catch(() => {});
await browser.close();
