# GARY 🐾

> **G**uided **A**pplication & **R**ole **Y**ield — tu copiloto de escritorio open source que caza, evalúa, adapta y te ayuda a postularte a empleos. Lleva el nombre de una mascota real.

[English](README.md) · **Español** · [Português](README.pt.md) · [Deutsch](README.de.md) · [中文](README.zh.md)

---

## 🐾 En palabras sencillas — ¿qué es GARY?

**GARY es una app de escritorio gratuita que te ayuda a encontrar empleo con muchísimo menos trabajo manual.**

Le das tu CV una sola vez. A partir de ahí, GARY hace por ti la parte tediosa de la búsqueda:

- 🔎 **Busca** en muchos portales de empleo al mismo tiempo.
- ✅ **Verifica qué vacantes realmente encajan contigo** — lee la descripción real del puesto, no solo el título.
- ✍️ **Adapta tu CV a cada oferta** para que te postules con la mejor versión posible.
- 📋 **Rellena los formularios de postulación** hasta el último paso… **y ahí se detiene.**

**El botón de "Enviar" siempre lo pulsas tú.** GARY nunca envía una postulación por ti ni resuelve un captcha — la decisión final, y el clic final, siempre son tuyos. Está hecho para *asistir* tu búsqueda: menos empleos pero mejor alineados, muchísimo menos copiar y pegar, y tú mantienes el control.

Conversas con GARY en lenguaje natural, y él trabaja en silencio en segundo plano, en tu propio computador.

## ⬇️ Descargar e instalar (sin programar)

¿No eres desarrollador? No tienes que compilar nada. Entra a la **[página de Releases](https://github.com/juliannichollsc/gary/releases/latest)**, descarga `GARY_x.y.z_x64-setup.exe` y haz doble clic. Por ahora **solo Windows**.

> En el primer arranque Windows puede mostrar *"Windows protegió tu PC"* (el instalador aún no está firmado) — haz clic en **Más información → Ejecutar de todas formas**.

---

## Para desarrolladores

GARY es una **app de escritorio (Tauri + Rust)** que pone un chat amigable delante de un agente de IA de nivel terminal. Tú escribes; por debajo, GARY conduce la CLI de IA que elijas (Gemini / Claude / OpenCode), que carga las skills + engines de GARY para: buscar ofertas en varios portales, validar el encaje leyendo la descripción real, adaptar tu CV por rol y preparar las postulaciones — **deteniéndose antes de enviar** (el clic sigue siendo humano).

**Agnóstico de modelo/CLI** — el backend lo eliges en el chat; la autenticación es el login propio de la CLI o una API key guardada en el llavero del sistema operativo. Todo lo específico del candidato es DATO, así que funciona para cualquiera: entregas tu CV base → GARY mapea tus roles → adapta por oferta.

### Arquitectura (puente PTY)
- **Shell:** Tauri (núcleo Rust + webview) — acceso local a archivos + lanza el navegador de automatización.
- **Chat = terminal:** `xterm.js` + un PTY (`portable-pty`) lanzan la CLI de IA interactiva; lo que escribes → stdin de la CLI; salida de la CLI → chat.
- **Cerebro:** la CLI carga `.claude/skills` + `.claude/agents` + `docs/operating-rules.md` (portable, agnóstico del usuario).
- **Engines deterministas:** `engines/*.mjs` (scrapers de portales, scoring, generador de CV) — ~0 tokens. El LLM es un **supervisor**, invocado solo cuando hace falta criterio: errores inesperados, preguntas de postulación desconocidas y CVs adaptados por ATS.
- **Contexto del candidato = RAG de NotebookLM:** tu CV + respuestas del onboarding se consolidan en un solo notebook consultable, para no repreguntar nada y no hardcodear PII.

### Idiomas
La interfaz viene en **5 idiomas** — English · Español · Português (pt-BR) · Deutsch · 中文 — autodetectados según tu sistema operativo (inglés por defecto) e intercambiables en Ajustes. El nombre "GARY" nunca se traduce.

### Skills (revisadas antes de instalar — ver `.claude/skills/SKILLS.md`)
GSAP (animaciones) · ui-ux-pro-max (sistema de diseño) · MCP Pencil (diseño→código) · RAG de NotebookLM (`proyecto26/notebooklm-ai-plugin`) · motor de empleo (portado de career-ops).

### Primeros pasos
```bash
corepack enable pnpm   # GARY usa pnpm (no npm)
pnpm install
pnpm tauri dev
```
Requiere Rust ≥ 1.96 + Node ≥ 18 + pnpm ≥ 9 (Windows: MSVC C++ Build Tools + WebView2). Consulta `CLAUDE.md` para la lista de tareas del build y `docs/operating-rules.md` para la metodología.

> **Plataforma: solo Windows por ahora.** El instalador se distribuye como un `.exe` de Windows (NSIS). Las versiones para Linux/macOS están en el roadmap, pero requieren un pase de portabilidad y aún no están disponibles.

## Uso responsable y respetuoso

GARY existe para ayudarte **a ti** a encontrar el empleo *correcto* más rápido — **no** para romper sitios web, hacer spam ni inundar a nadie con basura. Es deliberadamente **controlado y respetuoso por diseño**:

- **Sin enjambres de bots por sitio.** GARY nunca dispara muchos bots en paralelo contra un mismo sitio — **limita la concurrencia** (p. ej. Himalayas ≤ 2 peticiones concurrentes, con pausas) precisamente para **evitar rate-limits / HTTP 429** y ser amable con cada plataforma. El paralelismo real es entre fuentes *distintas*, no muchas pestañas machacando un solo sitio.
- **Calidad por encima de volumen — sin spam, sin basura.** GARY lee la **descripción real** de cada oferta y aplica un gate de encaje bidireccional, así que muestra coincidencias **menos numerosas, mejores y alineadas con tu perfil** en lugar de disparar postulaciones genéricas. Nunca postula en masa ni genera contenido de relleno.
- **La decisión final la toma el humano.** GARY rellena la postulación **hasta el paso de Enviar y SE DETIENE** — *tú* revisas y pulsas enviar. Nunca envía automáticamente ni resuelve captchas.
- **Respeta cada sitio.** Usa un **navegador de automatización dedicado y aislado** (nunca el personal), respeta ofertas cerradas/vencidas, una-postulación-por-empresa, cooldowns y las señales anti-bot de cada sitio (Cloudflare, 429). Si un sitio bloquea la automatización, GARY te lo delega en vez de forzarlo.
- **Tus cuentas, tu responsabilidad.** Automatizar sitios de empleo con sesión iniciada puede entrar en conflicto con sus Términos de Servicio; ejecutas GARY contra **tus propias** cuentas, bajo tu criterio. Las salvaguardas reducen el riesgo pero no lo eliminan — **respeta los ToS de cada plataforma.**
- **La IA se usa con normalidad.** GARY **no** altera, envuelve, jailbreakea ni revende ningún modelo de lenguaje — simplemente ejecuta *tu* CLI de terminal elegida como un asistente de programación normal, dentro de la política de uso de tu proveedor de LLM.

**En resumen:** una herramienta open source para *asistir* la búsqueda de empleo de una persona real — acelerar el filtrado y la adaptación, mantenerla de bajo volumen y honesta, y dejar cada envío al humano. Está hecha para **facilitar**, no para romper procesos ni sitios web.

## Créditos

GARY le da crédito a [`proyecto26/career-ops`](https://github.com/proyecto26/career-ops) — el proyecto de automatización de búsqueda de empleo con el cual **escalamos el alcance hacia una app de escritorio completa**, con todo lo que GARY ofrece hoy. Partimos de esa base y llevamos su alcance mucho más lejos.

## Estado
🚧 Desarrollo activo. Construido: shell de escritorio, chat-como-terminal (PTY), barra de título personalizada, onboarding (CV → ingesta en NotebookLM → mapa de roles), mapa de ofertas, métricas, ajustes (control del navegador), i18n en 5 idiomas y la capa de comandos en Rust. Pendiente: cableado completo de los engines sobre CDP — ver `CLAUDE.md` y `docs/career-ops-map.md`.

> **⚠️ En desarrollo.** GARY sigue en desarrollo y pruebas activas. Hasta ahora solo se ha compilado y probado en **Windows**, en un **entorno de desarrollador** — espera detalles ásperos y úsalo bajo tu propio criterio.

## ⚖️ Descargo de responsabilidad

GARY es software libre entregado **"tal cual", sin garantía de ningún tipo**, bajo la licencia Apache-2.0 (ver sus secciones de *Ausencia de garantía* y *Limitación de responsabilidad*). GARY es una herramienta que **asiste** la búsqueda de empleo — **tú eres el único responsable de cómo lo usas y del agente de IA/LM que ejecutes a través de él.** El autor **no se hace responsable** por el mal uso, por cualquier incumplimiento de los Términos de Servicio de un sitio web o de tu proveedor de LLM, por los resultados de las postulaciones, ni por daño alguno derivado de su uso — **incluido el nivel de rendimiento/concurrencia que elijas en la app**, que configuras para tu propia máquina y cuentas bajo tu propio riesgo. Al usar GARY aceptas plena responsabilidad sobre tus acciones, cuentas y datos.

## Licencia
[Apache License 2.0](LICENSE) © 2026 Julián Nicholls ([@jnichollsc](https://github.com/jnichollsc)). Código abierto — libre de usar, modificar y compartir; la licencia **obliga a mantener la atribución** y protege el nombre "GARY".
