# Plan de investigación — PWA companion (móvil) + soporte Linux/macOS

> **Estado: INVESTIGACIÓN. No implementado.** Este documento NO es un spec: recoge la decisión de
> producto, los hallazgos del análisis del código actual y las incógnitas a resolver ANTES de escribir
> un spec en `docs/specs/`. Owner: Julián Nicholls (@jnichollsc). Fecha del análisis: 2026-07-13.

## 1. Qué se quiere construir

Tres líneas de trabajo que comparten un mismo motivo (sacar a GARY del "solo funciona en mi Windows, en
mi repo clonado"):

- **Track A — PWA companion.** Desde el móvil, en la red local, acceder a GARY vía IP (o QR a esa IP).
  **Decisión del owner: acceso TOTAL**, no solo lectura — el móvil ve las ofertas y métricas *y* puede
  escribirle al agente LM en la vista chat y controlarlo. El PC sigue siendo el motor (Chrome :9333,
  engines, CLI supervisor); el móvil es un cliente remoto de esa misma sesión.
- **Track B — Portabilidad.** Que GARY corra e instale en Linux (Ubuntu) y macOS, no solo Windows.
- **Track C — Bugs de empaquetado** (§4). Surgieron al analizar lo anterior: hay engines que **no viajan
  en el instalador**. Rompe la app instalada HOY, en Windows incluido → va antes que A y B.

### Por qué NO una versión web completa (descartado)
Se evaluó reimplementar GARY como app web con API key de un modelo gratuito. **Descartado.** El
cuello de botella no es el LLM sino **las sesiones de navegador**: los engines funcionan porque manejan
por CDP un Chrome real donde el usuario YA inició sesión (LinkedIn, Gmail, GetOnBoard). Una web no puede
hacer eso — no hay CDP, CORS bloquea, las cookies son de otro origen, y los boards son agresivamente
anti-bot. Las únicas salidas serían navegadores headless en servidor con credenciales de terceros (adiós
local-first, custodia de contraseñas ajenas, ToS de los boards) o pedir al usuario que suba cookies.
Ambas inaceptables. Además, un tier gratuito de API suele entrenar con lo que recibe → chocaría con la
convención MANDATORY de que el CV y la PII vivan SOLO en el RAG de NotebookLM.
La PWA companion evita todo esto porque **nunca toca un job board**: solo habla con el GARY del PC.

---

## 2. Track A — PWA companion

### 2.1 Hallazgo clave: la mitad del backend ya existe

| Necesidad de la PWA | Ya implementado en | Nota |
|---|---|---|
| Lista de ofertas en JSON | `src-tauri/src/data.rs:67` `read_offers()` | Parsea `data/offers-master.md` → `{id, company, role, score, url, channel, status, meta}`. Es la forma exacta que consume `OffersView`. |
| Métricas en JSON | `src-tauri/src/data.rs:14` `read_metrics()` | Parsea `data/metrics.md` → `{hunts: […]}`. |
| Mapa de roles | `src-tauri/src/data.rs:114` `read_role_map()` | Alimenta el onboarding. |
| Terminal del agente | `src-tauri/src/main.rs:39` `spawn_in_pty()` | **PTY centralizado**: un único `writer` + `master` en estado global; la salida se emite como evento `pty://data`, la entrada entra por `write_stdin` (`main.rs:96`). |

**Consecuencia:** exponer la PWA es mayormente *transporte*, no lógica nueva. Los mismos bytes que hoy
van al evento `pty://data` pueden ir además a un WebSocket; lo que el móvil escriba entra por el mismo
`write_stdin`. No hay que reimplementar el agente ni los parsers.

Además, los datos que viajan (`offers-master.md`, `metrics.md`) son **candidate-agnostic por diseño**
(convención MANDATORY del proyecto) → exponerlos no filtra PII. La PII sigue viviendo solo en el RAG.

### 2.2 Consecuencia de seguridad de "acceso total" (asumida, no un bug)

Si el móvil puede escribirle al agente en el chat, **ese canal es ejecución remota sobre el PC**, con CWD
en la raíz del proyecto. Es exactamente la función pedida, no un defecto. Pero obliga a que el transporte
sea serio. **No se puede tratar como "un JSON de solo lectura en la LAN".**

### 2.3 La convergencia afortunada: TLS resuelve dos problemas a la vez

- Una PWA **solo es instalable y solo puede usar service worker en contexto seguro** (HTTPS o
  `localhost`). `http://192.168.x.x:PUERTO` **NO** es contexto seguro → sin TLS no hay PWA instalable ni
  offline, solo una web móvil normal.
- Sobre HTTP plano el token de sesión **viaja en claro**: cualquiera con un sniffer en la misma WiFi lo
  captura. Para "ver ofertas" (datos sin PII) sería tolerable; para "controlar el agente" (= shell
  remota) **no lo es**.

→ El TLS que hace falta por seguridad es el mismo que hace falta para que sea instalable.
**Deja de ser un coste y pasa a ser el camino. Diseñar con TLS desde el día 1.**

### 2.4 Modelo de emparejamiento (propuesta del owner, refinada)

Propuesta original: token visible en Ajustes del PC; **solo el primer dispositivo** que lo introduzca
puede conectarse. Es el patrón *trust-on-first-use* que usan Syncthing / VS Code Remote Tunnels. Se
adopta, con tres ajustes:

1. **Separar token de emparejamiento del credencial real.** El token del QR es de **un solo uso y
   caducidad corta** (2–5 min). Al canjearlo, el servidor emite un **secreto de dispositivo** de larga
   vida que la PWA guarda y usa en cada petición. Así lo que se muestra en pantalla caduca, y el
   credencial permanente nunca se enseña.
2. **"Solo el primer dispositivo" es un footgun** → si el usuario limpia los datos del navegador o cambia
   de teléfono queda bloqueado sin salida, y la regla es invisible. Sustituir por una **lista explícita
   de dispositivos vinculados en Ajustes, con botón de revocar**. Misma seguridad, sin la trampa.
3. **El QR lleva URL + token juntos** → en el móvil no se teclea nada.

Defensas adicionales a evaluar: bind explícito a la interfaz LAN (nunca `0.0.0.0` por accidente),
toggle **apagado por defecto**, indicador visible en el desktop ("1 dispositivo conectado"), kill switch,
y confirmación en el PC al abrir sesión de control.

### 2.5 Incógnitas a resolver (esto es lo que hay que investigar)

- **Cómo obtener TLS en LAN.** Tres candidatos, hay que elegir con criterio:
  - *Cert autofirmado* — cero dependencias, pero avisos feos en el móvil; ¿el service worker llega a
    funcionar tras aceptar la excepción en Android/iOS? (dudoso en iOS).
  - *CA local propia (estilo mkcert)* — hay que instalar un root cert en el móvil una vez; funciona bien
    pero es fricción de onboarding para usuarios no técnicos (y GARY apunta a no-técnicos).
  - *Tailscale / tunnel* — HTTPS real, sin exponer puertos, y **funciona también fuera de casa**. Es la
    opción más sólida pero añade una dependencia externa. **Candidata preferida a validar.**
- **Servidor HTTP dentro de Tauri.** `src-tauri/Cargo.toml` **no tiene hoy ninguna dependencia de
  servidor** (solo `tauri`, `serde`, `serde_json`, `portable-pty`, `keyring`). Decidir: `axum`/`hyper`
  embebido en el proceso Tauri, vs plugin. Evaluar peso y compatibilidad con el runtime async de Tauri.
- **Write-back de decisiones al store.** El `id` que genera `read_offers` (`data.rs:91`) es **posicional**
  (`o1`, `o2`…) y se recalcula en cada parseo → si el agente LM mergea ofertas nuevas, los ids bailan.
  Para escribir desde el móvil hay que **matchear por URL**, no por id, y limitarse a voltear el carácter
  del checkbox (`[ ]` → `[~]` / `[x]`) dejando la línea intacta.
- **Concurrencia sobre `offers-master.md`.** El agente LM también escribe ahí. Si el móvil escribe durante
  un barrido, uno pisa al otro → hace falta lock o reintento. Diseñarlo, no parchearlo después.
- **UX del chat en móvil.** Escribir a una terminal desde un teclado de móvil es incómodo. El caso de uso
  real probablemente no es *trabajar*, sino **desbloquear**: el agente se para preguntando algo y el
  usuario contesta desde el sofá. Investigar si conviene una vista de chat simplificada además del xterm
  crudo.
- **Reconexión y estado.** Qué pasa cuando el móvil pierde la WiFi a mitad de sesión; ¿buffer de salida
  del PTY para re-sincronizar?

---

## 3. Track B — Soporte Linux (Ubuntu) y macOS

### 3.1 Punto de partida: mejor de lo esperado

El código **ya anticipa Unix** en varios puntos: `main.rs:70` (`system_shell()` → `$SHELL`/`/bin/bash`),
`settings.rs:107` y `settings.rs:265`, `ingest.rs:54` tienen ramas `cfg!(windows)` con alternativa Unix.
`settings.rs:97` (`browser_profile_dir`) ya cae a `$HOME` si no hay `%USERPROFILE%`. Los iconos del bundle
ya incluyen `.icns` (macOS). El propio `.github/workflows/release.yml:7` deja escrito el pendiente:
*"add macos-latest / ubuntu-22.04 to the matrix once the portability pass lands"*.

### 3.2 Bloqueadores concretos encontrados

| # | Archivo:línea | Qué asume de Windows | Esfuerzo |
|---|---|---|---|
| 1 | `settings.rs:92` `engine_script()` | Apunta a `engines/start-chrome-debug.cmd`. **Solo existe el `.cmd`** — no hay `.sh` hermano. Es fallback (`settings.rs:203`), pero en Unix no resuelve. | Bajo — añadir `start-chrome-debug.sh` o eliminar el fallback si el exe siempre se resuelve. |
| 2 | `settings.rs:134-141` `resolve_browser_exe()` (rama Unix) | Resuelve por **nombre de comando** (`google-chrome`, `brave-browser`, `chromium`). Correcto en **Linux**; **falla en macOS**, donde Chrome vive en `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` y **no está en el PATH**. | Medio — añadir rama macOS con rutas `/Applications/*.app/Contents/MacOS/*`. |
| 3 | `tauri.conf.json:28` | `"targets": ["nsis"]` → solo instalador Windows. Falta `deb`/`appimage` (Linux) y `dmg` (macOS). | Bajo — ampliar targets; los iconos `.icns` ya están. |
| 4 | `.github/workflows/release.yml:20-24` | Matriz con **solo `windows-latest`**. | Bajo — añadir `ubuntu-22.04` + `macos-latest`; Linux necesita deps de sistema (`libwebkit2gtk-4.1-dev`, `libsecret-1-dev`, etc.) antes de compilar Tauri. |
| 5 | `Cargo.toml:19` `keyring = "2"` | En Windows usa el Credential Manager. En **Linux requiere libsecret** (y un keyring desbloqueado: en headless/servidor puede fallar). En macOS usa Keychain (OK). | Medio — validar en Ubuntu real; definir fallback si no hay keyring disponible. |
| 6 | `ingest.rs:48-54` | Comentado: en Windows `npx` es un shim `.cmd` → va por `cmd.exe`; en otros SO invoca `npx` directo. **Ya contemplado**, solo hay que verificarlo. | Bajo — verificar. |
| 7 | `workspace.rs:3-5` | Copia el contexto a un workspace escribible porque *"Program Files es de solo lectura"*. La lógica es correcta en concepto para todos los SO, pero hay que confirmar que usa rutas de Tauri (`app_data_dir`) y no rutas Windows. | Bajo — verificar. |

### 3.3 Incógnitas a resolver

- **¿Qué navegador de automatización en cada SO?** El perfil persistente (`browser_profile_dir`) guarda
  los logins entre sesiones — hay que verificar que el flag `--user-data-dir` + `--remote-debugging-port`
  se comporta igual en Chrome de Linux y de macOS (macOS tiene además protecciones de TCC/permisos).
- **macOS: firma y notarización.** Sin firmar, Gatekeeper bloquea la app. Es un coste real (cuenta de
  Apple Developer, ~99 USD/año). Decidir si se asume o si se documenta el "abrir de todas formas".
  Nota: Windows ya tiene el mismo problema sin resolver (SmartScreen, ver `release.yml:64`).
- **Linux: AppImage vs deb vs Flatpak.** AppImage es la más simple para "descargar y ejecutar" (que es el
  público objetivo de GARY: no-técnicos).
- **Discrepancia de licencia a aclarar:** `Cargo.toml:6` dice `MIT`, pero `CLAUDE.md` dice **Apache-2.0**.
  Hay que unificar antes de publicar releases multiplataforma.

---

## 4. Track C — Bugs de empaquetado detectados (BLOQUEAN el instalador, cualquier SO)

Descubiertos al ejecutar una búsqueda por Gmail (sesión del 2026-07-13). No son teóricos: se reprodujeron
en uso real. **No son específicos de Linux/macOS — afectan también al build de Windows actual.**

### 4.1 [ALTA] El `DENY` de `bundle-context.mjs` excluye el engine `gmail-harvest.mjs` del instalador

`scripts/bundle-context.mjs:67` copia `engines/` entero al bundle. Pero el filtro `DENY`
(`bundle-context.mjs:26-30`) hace **match de substring sobre la ruta completa**:

```js
const DENY = ['gmail-harvest', 'ats-session'];
const filter = (src) => !DENY.some((d) => src.includes(`${d}`));
```

La intención (comentario de la línea 27) era excluir el **output** real del inbox (PII). Pero
`engines/gmail-harvest.mjs` — el **engine**, no el output — también contiene ese substring, así que
**el filtro se lo come y el engine NO viaja en el instalador**. En la app instalada, `source-gmail`
fallaría con el engine ausente (mismo modo de fallo que tuvieron `playwright` y `js-yaml`, documentado en
`bundle-context.mjs:80-102`).

**Agravante:** la caché de PII real vive en `output/gmail-harvest/*` (ver `CLAUDE.md` → *Known issues*), y
**`output/` no se stagea nunca** — no está en la lista de copia. Es decir, **el `DENY` no protege nada y sí
rompe el engine legítimo.** Lo mismo con `ats-session` (`output/ats-session/`), hoy inofensivo solo porque
ningún engine se llama así — es una trampa latente para el siguiente engine que lleve ese nombre.

Dirección de arreglo (a decidir): anclar el DENY a rutas de directorio en vez de substring libre, o
eliminarlo dado que `output/` ya nunca se copia. **Cualquier engine cuyo nombre coincida con un dir de
output está hoy en riesgo silencioso.**

### 4.2 [ALTA] Deriva skill ↔ engine: skills que apuntan a engines inexistentes

En la misma sesión, la skill `source-gmail` invocaba `engines/gmail-harvest.mjs`, **que no existía en el
repo** — el agente LM tuvo que escribirlo sobre la marcha para poder continuar. Es un fallo de clase, no
un caso aislado: nada garantiza hoy que cada engine referenciado por una skill exista realmente.

Investigar: un check en CI (o en `bundle-context.mjs`) que **extraiga los `engines/*.mjs` mencionados en
`.claude/skills/**` y falle si alguno no existe en disco** — y, simétricamente, que falle si un engine
existente queda excluido del bundle por el filtro. Ambos fallos son invisibles hasta que un usuario los
sufre en la app instalada.

### 4.3 [MEDIA — mina latente, NO disparada hoy] `data/applications.md` es a la vez plantilla y store real

`data/applications.md` se declara a sí mismo *"candidate-AGNOSTIC skeleton… Ships EMPTY per candidate"*
(cabecera, línea 18) y por eso está **trackeado en git** y **copiado al instalador**
(`scripts/bundle-context.mjs:77`). Pero es **el mismo fichero** al que `engines/merge-tracker.mjs` escribe
las solicitudes REALES del candidato (empresa, rol, score, estado, notas).

→ En cuanto el usuario corra el pipeline completo, su historial real de aplicaciones queda (a) commiteable
con un `git add -A` y (b) **empaquetado dentro del `.exe` que se publica**.

**Hoy NO está disparada:** el tracker tiene 0 filas (verificado 2026-07-13) y el barrido de PII sobre
`data/*.md` + `config/*` + `cv-data.md` sale limpio → **la build 0.1.3 es segura de publicar**.

**El arreglo es el patrón que el repo YA usa** para `offers-master.md` / `metrics.md` /
`orchestrator-state.md`: commitear `data/applications.md.example`, gitignorar `data/applications.md`, y
que `bundle-context.mjs` copie el `.example`. `applications.md` es el ÚNICO de la familia que se quedó
fuera de esa convención. Toca además `docs/README.md:46`, `templates/README.md` y los defaults de los 5
engines del tracker.

**El momento barato para hacerlo es AHORA, mientras el fichero está vacío.** En cuanto tenga filas reales,
migrarlo implica reescribir historia de git.

### 4.4 Nota de método
El patrón se repite (`playwright`, `js-yaml`, ahora `gmail-harvest.mjs`): **lo que funciona en el repo no
funciona en el instalador**, porque en el repo todo resuelve por vecindad y en la app instalada el CWD es
el workspace copiado. Merece una **verificación de humo sobre el build empaquetado**, no solo sobre
`pnpm tauri dev`. Esto se vuelve más urgente con Track B: tres SO × este modo de fallo.

---

## 5. Orden sugerido (a discutir, no decidido)

1. **Track C (bugs de empaquetado)** — es lo único que ya está roto para usuarios reales HOY, en Windows
   incluido. Va primero.
2. **Pasada de portabilidad (Track B)** — prerrequisito honesto de todo lo demás y desbloquea usuarios
   Linux/macOS. Los bloqueadores son pocos y de esfuerzo bajo/medio.
3. **Decidir la estrategia de TLS (Track A)** — es la decisión estructurante de la PWA. Hasta que no esté,
   no tiene sentido escribir el spec.
4. **Spec de la PWA en `docs/specs/`** (sería el stage 08) con el modelo de emparejamiento cerrado.
5. Implementación.

## 6. Invariantes que NINGUNA de estas líneas puede romper

- **GARY nunca hace clic en Submit ni resuelve captchas** — tampoco desde el móvil.
- **La PII del candidato vive SOLO en el RAG de NotebookLM.** La PWA solo puede exponer los stores
  candidate-agnostic (`data/offers-master.md`, `data/metrics.md`).
- **Local-first.** Ningún track puede introducir un servidor que custodie sesiones o credenciales de los
  job boards.
