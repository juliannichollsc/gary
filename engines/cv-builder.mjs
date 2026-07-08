// cv-builder.mjs — reusable per-role CV generator for the candidate.
// candidate values come from config/apply-fieldmap.json + config/profile.yml — never hardcode PII.
// Holds the full real CV data once; variants change only the header subtitle,
// summary and competencies (ATS-relevant differentiators). Per-offer you pass
// --variant, --company, --format and optionally --summary to override.
// Works around the Windows isMain bug in generate-pdf.mjs by calling its
// exported renderHtmlToPdf() directly. No fabrication — same real experience.
//
// Usage:
//   node engines/cv-builder.mjs --variant fullstack --company "Base" --format a4
//   node engines/cv-builder.mjs --variant frontend --company "Amplemarket" --format a4 --out output/cv-amplemarket-frontend.pdf
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { renderHtmlToPdf, normalizeTextForATS } from './generate-pdf.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const variant = getArg('variant', 'fullstack');
const company = getArg('company', 'Base');
const format = getArg('format', 'a4');
const summaryOverride = getArg('summary', '');
const companySlug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const out = getArg('out', `docs/roles/${variant}/cv-${companySlug}-${variant}.pdf`);

// ── per-role variants (only these differ between roles) ────────────────
const VARIANTS = {
  fullstack: {
    subtitle: 'Senior Full-Stack Software Engineer — React · Node.js / NestJS · PostgreSQL',
    summary: `Senior Full-Stack Software Engineer with 7+ years building SaaS products end to end with React, TypeScript, Node.js/NestJS and PostgreSQL. Track record owning central, complex components, turning rough specs into features shipped weekly, and keeping growing systems scalable, stable and user-friendly under real customer load. Strong at debugging production issues to root cause and reasoning about edge cases, failure modes and migrations. Works cross-functionally with founders, product, design and customer-facing teams, and applies AI-augmented engineering to ship faster without sacrificing quality.`,
    competencies: ['Full-Stack Engineering', 'React & TypeScript', 'Node.js / NestJS', 'PostgreSQL', 'Scalable System Design', 'REST API Design', 'Production Debugging', 'AI-Augmented Engineering'],
  },
  frontend: {
    subtitle: 'Senior Frontend Engineer — React · React Native · Angular · TypeScript',
    summary: `Senior Frontend Engineer with 7+ years building complex, performant user interfaces with React, React Native, Angular, Next.js and TypeScript. Track record shipping high-performance frontends with TanStack Query, Zustand, virtualized data tables and advanced filtering, finding elegant solutions to real usability problems, and contributing to internal design systems. Comfortable across the full stack (Node.js/NestJS + PostgreSQL) and at debugging production issues to root cause. Works cross-functionally with product and design and applies AI-augmented engineering to ship faster with higher quality.`,
    competencies: ['React & TypeScript', 'React Native', 'Angular & Next.js', 'State Management', 'Design Systems', 'Performance Optimization', 'Full-Stack Delivery', 'AI-Augmented Engineering'],
  },
  backend: {
    subtitle: 'Senior Backend Engineer — Node.js / NestJS · PostgreSQL · REST APIs',
    summary: `Senior Backend Engineer with 7+ years designing and maintaining scalable, modular backend systems with Node.js/NestJS, PostgreSQL and REST APIs (also PHP/Laravel). Built a NestJS backend of 13+ domain modules powering commission engines, debt management, tax calculations, audit trails and payout processing, with attention to edge cases, failure modes, migrations and metrics. Strong at debugging production issues to root cause and hardening systems for reliability (reduced operational incidents across large-scale data pipelines). Full-stack capable on the React front end, works cross-functionally, and applies AI-augmented engineering to ship faster with higher quality.`,
    competencies: ['Node.js / NestJS', 'PostgreSQL', 'REST API Design', 'Domain-Driven Design', 'Scalable System Design', 'Production Reliability', 'PHP / Laravel', 'AI-Augmented Engineering'],
  },
};
const v = VARIANTS[variant] || VARIANTS.fullstack;
const summary = summaryOverride || v.summary;

// ── shared real CV data ────────────────────────────────────────────────
const EXPERIENCE = [
  { company: 'Home Power', period: 'Jul 2024 – Present', role: 'Senior Full Stack Developer — Remote / Hybrid', bullets: [
    'Own central, complex components of a commission-management SaaS built with <strong>React, TypeScript and PostgreSQL</strong>, shipping features for consultant hierarchies, payouts, chargebacks, invoicing and financial reporting.',
    'Designed and maintained a growing <strong>NestJS</strong> backend of 13+ domain modules and PostgreSQL — commission engines, debt management, tax calculations, audit trails and payout processing — built for scale, stability and correctness.',
    'Built high-performance React frontends with TanStack Query, Zustand, virtualized data tables and advanced filtering, solving real usability problems.',
    'Design for edge cases, failure modes, migrations and releases; debug production issues to root cause and proactively fix or improve what is broken.',
    'Collaborate cross-functionally with stakeholders to turn rough specs into shipped features; contributed across an Angular CRM and a React Native customer app.',
    'Established AI-augmented engineering practices (multi-agent workflows, Spec-Driven Development) to ship weekly with higher quality.',
  ]},
  { company: 'Smart Solutions', period: 'Dec 2023 – Jun 2025', role: 'Full Stack Developer — Remote / Hybrid', bullets: [
    'Built and maintained full-stack web and mobile apps (React, React Native, Angular, Node, PHP/Laravel) across logistics, e-commerce and business-management domains.',
    'Designed software architectures and worked directly with clients to translate business requirements into scalable, user-friendly solutions.',
    'Developed backend APIs, payment-gateway integrations, real-time tracking and workflow automation; owned full lifecycles to deployment and production support.',
  ]},
  { company: 'Linkcarga', period: 'Aug 2023 – Dec 2023', role: 'Web & Mobile Developer (Freelance) — Remote', bullets: [
    'Led the migration of a production logistics platform from Angular to <strong>React</strong> + Ionic, improving maintainability and user experience.',
    'Implemented authentication, geolocation tracking and state management; coordinated testing, release and deployment to App Store and Google Play.',
  ]},
  { company: 'Talent.co', period: 'Dec 2020 – Jan 2023', role: 'Software Developer — Remote', bullets: [
    'Built and maintained large-scale data-extraction platforms processing high volumes of public web data across multiple production pipelines.',
    'Improved scraper reliability, monitoring and performance and reduced operational incidents while modernizing legacy applications.',
    'Mentored junior developers, acted as team-lead backup, and earned multiple promotions for ownership and delivery consistency.',
  ]},
  { company: 'Pacífica Diseño', period: 'Jan 2020 – Jul 2020', role: 'Front-End Developer — Hybrid', bullets: [
    'Developed business applications and internal automation tools with ASP.NET MVC, JavaScript and SQL Server.',
  ]},
];

const PROJECTS = [
  { title: 'Commission-Management SaaS — Home Power', desc: 'End-to-end React + NestJS + PostgreSQL platform: commission engine, payouts, chargebacks, invoicing, audit trails and financial reporting, owning complex components from architecture to deployment.', tech: 'React · TypeScript · NestJS · PostgreSQL · TanStack Query · Zustand' },
  { title: 'Logistics Platform Migration — Linkcarga', desc: 'Led migration of a production logistics platform from Angular to React + Ionic, with auth, geolocation and mobile-first workflows shipped to App Store and Google Play.', tech: 'React · Ionic · TypeScript' },
  { title: 'Large-Scale Data-Extraction Platform — Talent.co', desc: 'High-volume web-data pipelines hardened for reliability and performance, reducing operational incidents across multiple production systems.', tech: 'Node.js · Python · Distributed pipelines' },
];

const SKILLS = [
  ['Frontend & Mobile', 'React, React Native, Angular, Next.js, Ionic, TypeScript, JavaScript'],
  ['Backend', 'NestJS, Node.js, PHP, Laravel, REST APIs'],
  ['Databases', 'PostgreSQL, MySQL, SQL Server'],
  ['State Management', 'TanStack Query, Zustand, Redux, NgRx, RxJS'],
  ['Architecture', 'SOLID, Domain-Driven Design, Modular Monoliths, Spec-Driven Development'],
  ['Infrastructure', 'Docker, Git, CI/CD, Swagger'],
  ['AI-Augmented Development', 'Claude Code, Cursor, Multi-Agent Workflows, Agentic Development'],
];
const CERTS = [
  ['Claude 101', 'Anthropic'], ['Claude Code 101', 'Anthropic'], ['Claude Code in Action', 'Anthropic'],
  ['Introduction to Agent Skills', 'Anthropic'], ['AWS Cloud Foundations (In Progress)', 'AWS'],
];

// ── render helpers ─────────────────────────────────────────────────────
const expHtml = EXPERIENCE.map(j => `
    <div class="job">
      <div class="job-header"><span class="job-company">${j.company}</span><span class="job-period">${j.period}</span></div>
      <div class="job-role">${j.role}</div>
      <ul>${j.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
    </div>`).join('');
const projHtml = PROJECTS.map(p => `
    <div class="project"><div class="project-title">${p.title}</div><div class="project-desc">${p.desc}</div><div class="project-tech">${p.tech}</div></div>`).join('');
const skillsHtml = SKILLS.map(([c, s]) => `<div class="skill-item"><span class="skill-category">${c}:</span> ${s}</div>`).join('');
const certHtml = CERTS.map(([t, o]) => `<div class="cert-item"><span class="cert-title">${t}</span><span class="cert-org">${o}</span></div>`).join('');
const compHtml = v.competencies.map(c => `<span class="competency-tag">${c}</span>`).join('');
const PAGE_WIDTH = format === 'letter' ? '8.5in' : '210mm';

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>{{FULL_NAME}} — CV</title><style>
@font-face{font-family:'Space Grotesk';src:url('./fonts/space-grotesk-latin.woff2') format('woff2');font-weight:300 700;font-display:swap;}
@font-face{font-family:'Space Grotesk';src:url('./fonts/space-grotesk-latin-ext.woff2') format('woff2');font-weight:300 700;font-display:swap;}
@font-face{font-family:'DM Sans';src:url('./fonts/dm-sans-latin.woff2') format('woff2');font-weight:100 1000;font-display:swap;}
@font-face{font-family:'DM Sans';src:url('./fonts/dm-sans-latin-ext.woff2') format('woff2');font-weight:100 1000;font-display:swap;}
*{margin:0;padding:0;box-sizing:border-box;}html{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{font-family:'DM Sans',sans-serif;font-size:11px;line-height:1.5;color:#1a1a2e;background:#fff;}
.page{width:100%;max-width:${PAGE_WIDTH};margin:0 auto;padding:2px 0;}
.header{margin-bottom:20px;}.header h1{font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;color:#1a1a2e;letter-spacing:-.02em;margin-bottom:6px;line-height:1.1;}
.header-sub{font-size:11px;color:hsl(270,70%,45%);font-weight:600;margin-bottom:8px;}
.header-gradient{height:2px;background:linear-gradient(to right,hsl(187,74%,32%),hsl(270,70%,45%));border-radius:1px;margin-bottom:10px;}
.contact-row{display:flex;flex-wrap:wrap;gap:8px 14px;font-size:10.5px;color:#555;}.contact-row a{color:#555;text-decoration:none;}.contact-row .separator{color:#ccc;}
.section{margin-bottom:18px;}.section-title{font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:hsl(187,74%,32%);border-bottom:1.5px solid #e2e2e2;padding-bottom:4px;margin-bottom:10px;}
.summary-text{font-size:11px;line-height:1.7;color:#2f2f2f;}a{white-space:nowrap;}
.competencies-grid{display:flex;flex-wrap:wrap;gap:8px;}.competency-tag{font-size:10px;font-weight:500;color:hsl(187,74%,28%);background:hsl(187,40%,95%);padding:4px 10px;border-radius:3px;border:1px solid hsl(187,40%,88%);}
.job{margin-bottom:14px;}.job-header{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:4px;}
.job-company{font-family:'Space Grotesk',sans-serif;font-size:12.5px;font-weight:600;color:hsl(270,70%,45%);}.job-period{font-size:10.5px;color:#777;white-space:nowrap;}
.job-role{font-size:11px;font-weight:600;color:#333;margin-bottom:6px;}.job ul{padding-left:18px;margin-top:6px;}.job li{font-size:10.5px;line-height:1.6;color:#333;margin-bottom:4px;}.job li strong{font-weight:600;}
.project{margin-bottom:12px;}.project-title{font-family:'Space Grotesk',sans-serif;font-size:11.5px;font-weight:600;color:hsl(270,70%,45%);}.project-desc{font-size:10.5px;color:#444;margin-top:3px;line-height:1.55;}.project-tech{font-size:9.5px;color:#888;margin-top:3px;}
.edu-item{margin-bottom:8px;}.edu-title{font-weight:600;font-size:11px;color:#333;}.edu-org{color:hsl(270,70%,45%);font-weight:500;}
.cert-table{display:table;width:100%;}.cert-item{display:table-row;}.cert-item>*{display:table-cell;padding-bottom:6px;}.cert-title{font-size:10.5px;font-weight:500;color:#333;}.cert-org{color:hsl(270,70%,45%);white-space:nowrap;}
.skills-grid{display:flex;flex-direction:column;gap:6px;}.skill-item{font-size:10.5px;color:#444;}.skill-category{font-weight:600;color:#333;}
.avoid-break,.job,.project,.edu-item,.cert-item{break-inside:avoid;page-break-inside:avoid;}
</style></head><body><div class="page">
  <div class="header avoid-break"><h1>{{FULL_NAME}}</h1><div class="header-sub">${v.subtitle}</div><div class="header-gradient"></div>
    <div class="contact-row"><span>{{PHONE}}</span><span class="separator">|</span><span>{{EMAIL}}</span><span class="separator">|</span><a href="{{LINKEDIN_URL}}">{{LINKEDIN_HANDLE}}</a><span class="separator">|</span><span>{{CITY}}, {{COUNTRY}} (Remote, GMT-5)</span></div>
  </div>
  <div class="section avoid-break"><div class="section-title">Professional Summary</div><div class="summary-text">${summary}</div></div>
  <div class="section"><div class="section-title">Core Competencies</div><div class="competencies-grid">${compHtml}</div></div>
  <div class="section"><div class="section-title">Work Experience</div>${expHtml}</div>
  <div class="section avoid-break"><div class="section-title">Projects</div>${projHtml}</div>
  <div class="section avoid-break"><div class="section-title">Education</div><div class="edu-item"><span class="edu-title">Software Programming Technician — <span class="edu-org">SENA</span></span></div></div>
  <div class="section avoid-break"><div class="section-title">Certifications</div><div class="cert-table">${certHtml}</div></div>
  <div class="section avoid-break"><div class="section-title">Technical Skills</div><div class="skills-grid">${skillsHtml}</div></div>
  <div class="section avoid-break"><div class="section-title">Languages</div><div class="skills-grid"><div class="skill-item"><span class="skill-category">Spanish:</span> Native</div><div class="skill-item"><span class="skill-category">English:</span> B2 (Professional Working Proficiency)</div></div></div>
</div></body></html>`;

// font path resolution + ATS normalization (same as generate-pdf.mjs generatePDF)
const fontsDir = join(ROOT, 'fonts');
let finalHtml = html.replace(/url\(['"]?\.\/fonts\//g, `url('file://${fontsDir}/`);
finalHtml = finalHtml.replace(/file:\/\/([^'")]+)\.(woff2?|ttf|otf)['"]?\)/g, `file://$1.$2')`);
finalHtml = normalizeTextForATS(finalHtml).html;

const res = await renderHtmlToPdf(finalHtml, resolve(ROOT, out), { format, baseDir: ROOT });
console.log(`OK ${variant} / ${company} -> ${out} | pages=${res.pageCount} | ${(res.size/1024).toFixed(1)}KB`);
