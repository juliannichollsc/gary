// GARY — stage the CANDIDATE-AGNOSTIC runtime context that ships INSIDE the installer.
// Runs in `beforeBuildCommand` (before Tauri bundles). Copies ONLY product + template files into
// `src-tauri/context/` (gitignored); Tauri bundles that dir as an app resource. On first run the Rust
// core copies it to a writable workspace so the spawned CLI/agent always has GARY's context.
//
// HARD RULE: never stage real PII / the user's runtime data. We copy an explicit allow-list and
// filter out the known runtime/PII paths (gmail-harvest, generated configs, the real CV, hunt data).
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const out = join(root, 'src-tauri', 'context');

// GARY's OWN runtime skills (board/connection source nodes + apply engines). Third-party build-time
// skills (GSAP, ui-ux-pro-max, pencil-design, …) are NOT shipped.
const SKILLS = [
  'gary-job-search', 'jnichollsc-job-search',
  'source-gmail', 'source-linkedin', 'source-getonbrd', 'source-himalayas',
  'getonbrd-offers', 'computrabajo-offers', 'indeed-offers',
  'tecla-offers', 'vanhack-offers', 'xpertdirect-offers',
  'chrome-autoapply', 'easyapply-autofill', 'website-analyzer',
];

// Files/dirs to skip anywhere in a recursive copy (PII / runtime caches).
const DENY = [
  'gmail-harvest',            // engines/gmail-harvest/* — real inbox harvest
  'ats-session',             // per-session RAG clone
];
const filter = (src) => !DENY.some((d) => src.includes(`${d}`));

function copyFile(rel) {
  const from = join(root, rel);
  if (!existsSync(from)) return;
  const to = join(out, rel);
  mkdirSync(join(to, '..'), { recursive: true });
  cpSync(from, to);
}
function copyDir(rel, extraFilter) {
  const from = join(root, rel);
  if (!existsSync(from)) return;
  cpSync(from, join(out, rel), {
    recursive: true,
    filter: (s) => filter(s) && (extraFilter ? extraFilter(s) : true),
  });
}

// ---- rebuild the staging dir ----
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Claude brain: the 4 job agents + 3 commands + OUR skills only.
copyDir('.claude/agents');
copyDir('.claude/commands');
copyFile('.claude/skills/SKILLS.md');
for (const s of SKILLS) copyDir(`.claude/skills/${s}`);

// El plugin de NotebookLM (RAG del candidato). Vive gitignorado en `.claude/skills/` como skill
// instalada, pero el core Rust lo ejecuta por ruta (ingest.rs → plugin_scripts_dir), así que DEBE
// viajar en el instalador o la ingesta falla con "plugin de NotebookLM no encontrado".
copyDir('.claude/skills/notebooklm-ai-plugin');

// Methodology + data map (all agnostic).
copyDir('docs');

// Deterministic engines (bots) — sources + providers, minus runtime output.
copyDir('engines', (s) => !s.endsWith('.output') );

// Templates + agnostic config/data templates.
copyDir('templates');
copyFile('config/apply-fieldmap.json');       // template ({{PLACEHOLDER}})
copyFile('config/profile.yml');               // template ({{PLACEHOLDER}})
copyFile('config/easyapply-filter.json.example');
for (const f of ['offers-master', 'metrics', 'orchestrator-state'])
  copyFile(`data/${f}.md.example`);
copyFile('data/cv/base/gary-context.md.example');
for (const f of ['applications.md', 'filters.md', 'easyapply-questions.md', 'linkedin-playbook.md'])
  copyFile(`data/${f}`);

// Dependencias de runtime de los engines. En el repo `playwright` resuelve por el `node_modules/` de al
// lado; en la app instalada los engines corren con CWD = workspace, donde no hay ninguno → todos morían con
// ERR_MODULE_NOT_FOUND (así se cayó "Verificar conexiones" al empaquetar). Los engines de conexión sólo
// hacen `chromium.connectOverCDP` contra el Chrome ya abierto, así que NO hace falta el navegador que
// descarga `playwright install` — sólo los dos paquetes JS. pnpm los enlaza por symlink al store, de modo
// que hay que resolverlos y copiar el contenido real (`dereference`).
// `playwright-core` no es dependencia DIRECTA del repo, así que con el node_modules estricto de pnpm no
// resuelve desde la raíz: hay que pedírselo a `playwright`, que es quien lo declara. Copiamos ambos planos
// bajo `context/node_modules/` — el `require('playwright-core')` interno de playwright sube un nivel y lo
// encuentra ahí.
function copyPackage(name, fromDir) {
  const req = createRequire(join(fromDir, 'noop.js'));
  const pkgDir = dirname(req.resolve(`${name}/package.json`));
  cpSync(pkgDir, join(out, 'node_modules', name), { recursive: true, dereference: true });
  return pkgDir;
}
const playwrightDir = copyPackage('playwright', root);
copyPackage('playwright-core', playwrightDir);

// Root context files the CLI reads.
for (const f of ['AGENTS.md', 'CLAUDE.md', 'cv-data.md', 'package.json', 'pnpm-lock.yaml', '.npmrc', '.env.example'])
  copyFile(f);

console.log(`[bundle-context] staged agnostic context → ${out}`);
