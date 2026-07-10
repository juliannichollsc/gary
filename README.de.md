<h1 align="center">GARY 🐾</h1>

<p align="center">
  <img src="docs/assets/gary-hero.png" alt="GARY — dein Copilot, der Jobs jagt" width="820">
</p>

> **G**uided **A**pplication & **R**ole **Y**ield — dein quelloffener Desktop-Copilot, der Jobs jagt, bewertet, anpasst und dir beim Bewerben hilft. Benannt nach einem echten Haustier.

[English](README.md) · [Español](README.es.md) · [Português](README.pt.md) · **Deutsch** · [中文](README.zh.md)

---

## 🐾 In einfachen Worten — was ist GARY?

**GARY ist eine kostenlose Desktop-App, die dir hilft, mit deutlich weniger Handarbeit einen Job zu finden.**

Du gibst einmal deinen Lebenslauf ein. Ab dann übernimmt GARY den mühsamen Teil der Jobsuche für dich:

- 🔎 **Sucht** auf vielen Jobbörsen gleichzeitig.
- ✅ **Prüft, welche Stellen wirklich zu dir passen** — es liest die echte Stellenbeschreibung, nicht nur den Titel.
- ✍️ **Passt deinen Lebenslauf an jede Stelle an**, damit du dich mit der stärkstmöglichen Version bewirbst.
- 📋 **Füllt die Bewerbungsformulare** bis zum letzten Schritt aus… **und hält dann an.**

**Auf „Senden" drückst immer du selbst.** GARY reicht nie eine Bewerbung für dich ein und löst kein Captcha — die letzte Entscheidung und der letzte Klick gehören immer dir. Es ist dafür gebaut, deine Suche zu *unterstützen*: weniger, aber besser passende Jobs, viel weniger Copy-and-paste, und du behältst die Kontrolle.

Du sprichst mit GARY in natürlicher Sprache, und es arbeitet still im Hintergrund auf deinem eigenen Rechner.

## ⬇️ Herunterladen & installieren (kein Coding nötig)

Kein Entwickler? Du baust nichts. Geh zur **[Releases-Seite](https://github.com/juliannichollsc/gary/releases/latest)**, lade `GARY_x.y.z_x64-setup.exe` herunter und doppelklicke sie. Vorerst **nur Windows**.

> Beim ersten Start zeigt Windows evtl. *„Der Computer wurde durch Windows geschützt"* (der Installer ist noch nicht signiert) — klicke auf **Weitere Informationen → Trotzdem ausführen**.

---

## Für Entwickler

GARY ist eine **Desktop-App (Tauri + Rust)**, die einen freundlichen Chat vor einen terminalstarken KI-Agenten setzt. Du tippst; im Hintergrund steuert GARY die von dir gewählte KI-CLI (Gemini / Claude / OpenCode), die GARYs Skills + Engines lädt, um: Angebote über mehrere Börsen zu finden, die Passung durch Lesen der echten Beschreibung zu prüfen, deinen Lebenslauf pro Rolle anzupassen und Bewerbungen vorzubereiten — **stoppt vor dem Absenden** (der Klick bleibt menschlich).

**Modell-/CLI-agnostisch** — das Backend wählst du im Chat; die Authentifizierung ist der CLI-eigene Login oder ein im OS-Schlüsselbund gespeicherter API-Schlüssel. Alles Kandidatenspezifische ist DATEN, also läuft es für jeden: liefere deinen Basis-Lebenslauf → GARY mappt deine Rollen → passt pro Angebot an.

### Architektur (PTY-Bridge)
- **Shell:** Tauri (Rust-Kern + Webview) — lokaler Dateizugriff + startet den Automatisierungsbrowser.
- **Chat = Terminal:** `xterm.js` + ein PTY (`portable-pty`) starten die interaktive KI-CLI; was du tippst → CLI-stdin; CLI-Ausgabe → Chat.
- **Gehirn:** die CLI lädt `.claude/skills` + `.claude/agents` + `docs/operating-rules.md` (portabel, benutzeragnostisch).
- **Deterministische Engines:** `engines/*.mjs` (Börsen-Scraper, Scoring, Lebenslauf-Generator) — ~0 Tokens. Das LLM ist ein **Supervisor**, nur bei Ermessensfragen aktiv: unerwartete Fehler, unbekannte Bewerbungsfragen und ATS-angepasste Lebensläufe.
- **Kandidatenkontext = NotebookLM-RAG:** dein Lebenslauf + Onboarding-Antworten werden in einem einzigen abfragbaren Notebook konsolidiert, damit nichts erneut gefragt wird und keine PII fest im Code steht.

### Sprachen
Die Oberfläche kommt in **5 Sprachen** — English · Español · Português (pt-BR) · Deutsch · 中文 — automatisch anhand deines Betriebssystems erkannt (Englisch als Standard) und in den Einstellungen umschaltbar. Der Name „GARY" wird nie übersetzt.

### Skills (vor der Installation geprüft — siehe `.claude/skills/SKILLS.md`)
GSAP (Animationen) · ui-ux-pro-max (Design-System) · MCP Pencil (Design→Code) · NotebookLM-RAG (`proyecto26/notebooklm-ai-plugin`) · Job-Engine (aus career-ops portiert).

### Erste Schritte
```bash
corepack enable pnpm   # GARY nutzt pnpm (nicht npm)
pnpm install
pnpm tauri dev
```
Benötigt Rust ≥ 1.96 + Node ≥ 22.13 + pnpm ≥ 11 (Windows: MSVC C++ Build Tools + WebView2). Siehe `CLAUDE.md` für die Build-Aufgabenliste und `docs/operating-rules.md` für die Methodik.

> **Plattform: vorerst nur Windows.** Der Installer wird als Windows-`.exe` (NSIS) ausgeliefert. Linux-/macOS-Builds sind auf der Roadmap, brauchen aber einen Portierungsschritt und sind noch nicht verfügbar.

## Verantwortungsvolle & respektvolle Nutzung

GARY existiert, um **dir** zu helfen, den *richtigen* Job schneller zu finden — **nicht**, um Websites lahmzulegen, zu spammen oder jemanden mit Müll zu überfluten. Es ist bewusst **kontrolliert und respektvoll gestaltet**:

- **Keine Bot-Schwärme pro Seite.** GARY feuert nie viele parallele Bots auf eine einzige Website — es **begrenzt die Parallelität** (z. B. Himalayas ≤ 2 gleichzeitige Abrufe, mit Pausen), gerade um **Rate-Limits / HTTP 429 zu vermeiden** und jede Plattform zu schonen. Echte Parallelität läuft über *verschiedene* Quellen, nicht über viele Tabs, die eine Seite hämmern.
- **Qualität vor Menge — kein Spam, kein Müll.** GARY liest die **echte Stellenbeschreibung** jedes Angebots und wendet ein Zwei-Wege-Passungs-Gate an, sodass es **weniger, bessere, profilgerechte** Treffer zeigt, statt generische Bewerbungen zu verschicken. Es bewirbt sich nie massenhaft und erzeugt keinen Füll-/Müllinhalt.
- **Der Mensch entscheidet endgültig.** GARY füllt eine Bewerbung **bis zum Absende-Schritt aus und STOPPT** — *du* prüfst und klickst auf Senden. Es sendet nie automatisch und löst keine Captchas.
- **Respektiert jede Website.** Nutzt einen **dedizierten, isolierten Automatisierungsbrowser** (nie deinen persönlichen), respektiert geschlossene/abgelaufene Anzeigen, eine-Bewerbung-pro-Unternehmen, Cooldowns und die Anti-Bot-Signale jeder Seite (Cloudflare, 429). Blockiert eine Seite die Automatisierung, übergibt GARY an dich, statt es zu erzwingen.
- **Deine Konten, deine Verantwortung.** Das Automatisieren angemeldeter Jobseiten kann mit deren Nutzungsbedingungen kollidieren; du betreibst GARY mit **deinen eigenen** Konten, nach eigenem Ermessen. Die Schutzmechanismen senken das Risiko, beseitigen es aber nicht — **respektiere die ToS jeder Plattform.**
- **Die KI wird normal genutzt.** GARY **verändert, umhüllt, jailbreakt oder verkauft** kein Sprachmodell — es führt einfach *deine* gewählte Terminal-CLI als gewöhnlichen Coding-Assistenten aus, im Rahmen der Nutzungsrichtlinie deines LLM-Anbieters.

**Kurz gesagt:** ein quelloffenes Werkzeug, um die Jobsuche einer echten Person zu *unterstützen* — Filtern und Anpassen beschleunigen, es geringvolumig und ehrlich halten, und jedes Absenden dem Menschen überlassen. Es ist gebaut, um zu **erleichtern**, nicht um Prozesse oder Websites zu brechen.

## Danksagung

GARY dankt [`proyecto26/career-ops`](https://github.com/proyecto26/career-ops) — dem Jobsuche-Automatisierungsprojekt, mit dem wir den **Umfang zu einer vollständigen Desktop-Anwendung ausgebaut** haben, mit allem, was GARY heute bietet. Wir bauen auf dieser Grundlage auf und treiben ihre Reichweite weit voran.

## Status
🚧 Aktive Entwicklung. Gebaut: Desktop-Shell, Chat-als-Terminal (PTY), eigene Titelleiste, Onboarding (Lebenslauf → NotebookLM-Ingestion → Rollenkarte), Angebotskarte, Metriken, Einstellungen (Browser-Steuerung), i18n in 5 Sprachen und die Rust-Befehlsschicht. Ausstehend: vollständige Engine-Verkabelung über CDP — siehe `CLAUDE.md` und `docs/career-ops-map.md`.

> **⚠️ In Entwicklung.** GARY befindet sich noch in aktiver Entwicklung und im Test. Bisher wurde es nur unter **Windows**, in einer **Entwicklerumgebung**, gebaut und getestet — rechne mit Ecken und Kanten und nutze es nach eigenem Ermessen.

## ⚖️ Haftungsausschluss

GARY ist freie Software, bereitgestellt **„wie besehen", ohne jegliche Gewährleistung**, unter der Apache-2.0-Lizenz (siehe die Abschnitte *Gewährleistungsausschluss* und *Haftungsbeschränkung*). GARY ist ein Werkzeug, das die Jobsuche **unterstützt** — **du allein bist verantwortlich dafür, wie du es nutzt, und für den KI-/LM-Agenten, den du damit ausführst.** Der Autor **haftet nicht** für Missbrauch, für Verstöße gegen die Nutzungsbedingungen einer Website oder deines LLM-Anbieters, für Bewerbungsergebnisse oder für Schäden aus der Nutzung — **einschließlich der Leistungs-/Parallelitätsstufe, die du in der App wählst**, die du für deinen eigenen Rechner und deine Konten auf eigenes Risiko einstellst. Mit der Nutzung von GARY übernimmst du die volle Verantwortung für dein Handeln, deine Konten und deine Daten.

## Lizenz
[Apache License 2.0](LICENSE) © 2026 Julián Nicholls ([@jnichollsc](https://github.com/jnichollsc)). Open Source — frei nutzbar, änderbar und teilbar; die Lizenz **verlangt den Erhalt der Namensnennung** und schützt den Namen „GARY".
