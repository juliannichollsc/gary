<h1 align="center">GARY 🐾</h1>

<p align="center">
  <img src="docs/assets/gary-hero.png" alt="GARY — your copilot that hunts jobs" width="820">
</p>

> **G**uided **A**pplication & **R**ole **Y**ield — your open-source desktop copilot that hunts, evaluates, tailors, and helps you apply to jobs. Named after a real pet.

**English** · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [中文](README.zh.md)

---

## 🐾 In plain words — what is GARY?

**GARY is a free desktop app that helps you find a job with far less manual work.**

You give it your CV once. From then on, GARY does the tedious part of the job hunt for you:

- 🔎 **Searches** across many job boards at the same time.
- ✅ **Checks which openings actually fit you** — it reads the real job description, not just the title.
- ✍️ **Tailors your CV for each offer** so you apply with the strongest possible version.
- 📋 **Fills in the application forms** up to the last step… **and then stops.**

**You always press "Send" yourself.** GARY never submits an application for you and never solves a captcha — the final decision, and the final click, are always yours. It's built to *assist* your search: fewer, better-matched jobs, way less copy-paste, and you stay in control.

You chat with GARY in plain language, and it works quietly in the background on your own computer.

## ⬇️ Download & install (no coding required)

Not a developer? You don't build anything. Go to the **[Releases page](https://github.com/juliannichollsc/gary/releases/latest)**, download `GARY_x.y.z_x64-setup.exe`, and double-click it. Currently **Windows only**.

> On first launch Windows may show *"Windows protected your PC"* (the installer isn't code-signed yet) — click **More info → Run anyway**.

---

## For developers

GARY is a **desktop app (Tauri + Rust)** that puts a friendly chat in front of a terminal-grade AI agent. You type; under the hood it drives your chosen AI coding CLI (Gemini / Claude / OpenCode) which loads GARY's skills + engines to: source offers across boards, validate fit by reading the real JD, tailor your CV per role, and prepare applications — **stopping before submit** (the click stays human).

**Model/CLI-agnostic** — you pick the backend in the chat; auth is the CLI's own login or an API key stored in the OS keychain. Everything candidate-specific is DATA, so it runs for anyone: deliver your base CV → GARY maps your roles → tailors per offer.

### Architecture (PTY-bridge)
- **Shell:** Tauri (Rust core + webview) — local access to files + launches the automation browser.
- **Chat = terminal:** `xterm.js` + a PTY (`portable-pty`) spawn the interactive AI CLI; what you type → CLI stdin; CLI output → chat.
- **Brain:** the CLI loads `.claude/skills` + `.claude/agents` + `docs/operating-rules.md` (portable, user-agnostic).
- **Deterministic engines:** `engines/*.mjs` (board scrapers, scoring, CV builder) — ~0 tokens. The LLM is a **supervisor**, invoked only for judgment: unexpected errors, unknown application questions, and ATS-tailored CVs.
- **Candidate context = NotebookLM RAG:** your CV + onboarding answers are consolidated into one queryable notebook, so nothing is re-asked and no PII is hardcoded.

### Languages
The interface ships in **5 languages** — English · Español · Português (pt-BR) · Deutsch · 中文 — auto-detected from your OS (English by default) and switchable in Settings. The name "GARY" is never translated.

### Skills (vetted before install — see `.claude/skills/SKILLS.md`)
GSAP (animations) · ui-ux-pro-max (design system) · MCP Pencil (design→code) · NotebookLM RAG (`proyecto26/notebooklm-ai-plugin`) · job engine (ported from career-ops).

### Getting started
```bash
corepack enable pnpm   # GARY uses pnpm (not npm)
pnpm install
pnpm tauri dev
```
Requires Rust ≥ 1.96 + Node ≥ 18 + pnpm ≥ 9 (Windows: MSVC C++ Build Tools + WebView2). See `CLAUDE.md` for the build task list and `docs/operating-rules.md` for the methodology.

> **Platform: Windows only for now.** The installer ships as a Windows `.exe` (NSIS). Linux/macOS builds are on the roadmap but need a portability pass and aren't available yet.

## Responsible & respectful use

GARY exists to help **you** find the *right* job faster — **not** to break websites, spam, or flood anyone with junk. It is deliberately **controlled and respectful by design**:

- **No bot swarms per site.** GARY never fires many parallel bots at a single website — it **caps concurrency** (e.g. Himalayas ≤ 2 concurrent fetches, with pauses) specifically to **avoid rate-limits / HTTP 429** and stay gentle on each platform. Real parallelism is across *different* sources, not many tabs hammering one site.
- **Quality over volume — no spam, no junk.** GARY reads each offer's **real job description** and applies a two-way-fit gate, so it surfaces **fewer, better, profile-aligned** matches instead of blasting generic applications. It never mass-applies and never generates filler/garbage content.
- **The human makes the final call.** GARY fills an application **up to the Submit step and STOPS** — *you* review and click send. It never auto-submits and never solves captchas.
- **Respects each website.** Uses a **dedicated, isolated automation browser** (never your personal one), honors closed/expired postings, one-application-per-company, cooldowns, and each site's anti-bot signals (Cloudflare, 429). If a site blocks automation, GARY hands off to you instead of forcing it.
- **Your accounts, your responsibility.** Automating logged-in job sites can conflict with their Terms of Service; you run GARY against **your own** accounts, at your own discretion. The guardrails reduce risk but can't eliminate it — **respect each platform's ToS.**
- **The AI is used normally.** GARY does **not** alter, wrap, jailbreak, or resell any language model — it simply runs *your* chosen terminal CLI as an ordinary coding assistant, within your LLM provider's usage policy.

**In short:** an open-source tool to *assist* a real person's job search — speed up filtering and tailoring, keep it low-volume and honest, and leave every send to the human. It is built to **facilitate**, not to break processes or websites.

## Credits

GARY gives credit to [`proyecto26/career-ops`](https://github.com/proyecto26/career-ops) — the job-search automation project with which we **expanded the scope into a full desktop application**, bringing everything GARY offers today. We build on that foundation and take its reach much further.

## Status
🚧 Active development. Built: desktop shell, chat-as-terminal (PTY), custom titlebar, onboarding (CV → NotebookLM ingest → role map), offers map, metrics, settings (browser control), 5-language i18n, and the Rust command layer. Pending: full engine wiring over CDP — see `CLAUDE.md` and `docs/career-ops-map.md`.

> **⚠️ Work in progress.** GARY is still under active development and testing. So far it has only been built and tested on **Windows**, in a **developer environment** — expect rough edges, and use it at your own discretion.

## ⚖️ Disclaimer & liability

GARY is free software provided **"as is", without warranty of any kind**, under the Apache-2.0 license (see its *Disclaimer of Warranty* and *Limitation of Liability* sections). GARY is a tool that **assists** a job search — **you are solely responsible for how you use it and for the AI/LM agent you run through it.** The author is **not responsible or liable** for misuse, for any breach of a website's or LLM provider's Terms of Service, for application outcomes, or for any damage arising from its use — **including the performance/concurrency level you choose in the app**, which you set for your own machine and accounts at your own risk. By using GARY you accept full responsibility for your actions, accounts and data.

## License
[Apache License 2.0](LICENSE) © 2026 Julián Nicholls ([@jnichollsc](https://github.com/jnichollsc)). Open source — free to use, modify and share; the license **requires keeping attribution** and protects the "GARY" name.
