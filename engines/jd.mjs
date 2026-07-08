// Helper: fetch a Greenhouse job's JD + questions. Usage: node engines/jd.mjs <slug> <id>
const [slug, id] = process.argv.slice(2);
const base = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${id}`;
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const j = await (await fetch(base)).json();
console.log('TITLE:', j.title, '| LOC:', j.location && j.location.name);
console.log('DESC:', strip(j.content).slice(0, 1500));
const q = await (await fetch(`${base}?questions=true`)).json();
console.log('QUESTIONS:', (q.questions || []).map(x => (x.required ? '*' : '') + x.label).join(' | '));
