# GARY 🐾 — Prompts skill-grade para Pencil

> **Cómo usar:** abre `pencil/gary.pen` en VS Code (extensión Pencil) y pega cada bloque en el chat de IA
> del editor. Genera **una pantalla a la vez**, en orden. El `batch_design` del CLI headless está roto en
> esta máquina (bug de QuickJS, ver `memory/`); por eso la generación va por el chat del editor.
>
> **Estos prompts ya traen la dirección de arte resuelta** (a partir de mis skills ui-ux-pro-max +
> frontend-design + web-design-guidelines + GSAP). El agente de Pencil debe **EJECUTAR, no rediseñar**.
> Cada prompt empieza pidiéndole que **lea los docs del workspace** para que el output sea consistente y
> profesional, no genérico.

---

## ⚙️ Prompt de contexto (pégalo UNA vez, al inicio de la sesión de chat)

```
Vas a maquetar la app de escritorio GARY (copiloto de búsqueda de empleo, Tauri + React, model-agnóstico). ANTES de diseñar, LEE estos archivos del workspace y respétalos al pie de la letra como fuente de verdad: docs/design-system.md (tokens dark/light, tipografía, espaciado, radios, sombras, estados, motion, accesibilidad WCAG) y docs/components.md (inventario de componentes). Reglas de calidad para TODO lo que diseñes: usa SIEMPRE las variables de color temáticas (no hardcodees hex), tema dark por defecto y light como par; conserva un solo acento ámbar cálido (`#CE812D`) y construye los neutros desde negros y marrones del isotipo oficial, no desde slate frío; tipografía Inter para UI, Plus Jakarta Sans solo para wordmark/hero, JetBrains Mono para terminal/código/scores; espaciado en ritmo 4/8; radios 6/10/14/20; foco SIEMPRE visible; contraste AA (texto ≥4.5:1); el estado nunca se comunica solo por color (punto + icono + texto). No envuelvas cada elemento en su propia tarjeta: usa contenedores solo con propósito estructural. Cada pantalla es un frame top-level con clip:true, ~1280×832, con el sidebar de 260px a la izquierda. La marca ya NO es la huella emoji: usa el isotipo oficial `../public/isotipo.png` como avatar/hero/loader cuando corresponda, manteniendo line icons de lucide para navegación. El isotipo tiene negro `#000202`, marrón principal `#C26942`, marrón oscuro `#B3623D`, marrón claro `#C36E39`, ámbar `#CE812D`, blanco `#F3F3F3` y gris claro `#A0A09F`. Confirma que leíste los docs y dime "listo" antes de seguir.
```

## 0. Tokens (primera pantalla a generar)

```
Define los design tokens de GARY como VARIABLES temáticas con eje "mode" = dark/light, exactamente según docs/design-system.md §1: colores bg, surface, surface-2, surface-3, border, border-strong, text, text-secondary, text-muted, accent, accent-hover, accent-pressed, accent-soft, accent-on, y semánticos success/warning/danger/info cada uno con su variante -soft. Strings: font-ui=Inter, font-brand="Plus Jakarta Sans", font-mono="JetBrains Mono". Números: radius-sm=6, radius-md=10, radius-lg=14, radius-xl=20, y spacing 4/8/12/16/24/32. Usa la paleta del isotipo: dark con fondo casi negro y marrones cálidos; light con superficies claras pero manteniendo marrón/ámbar como identidad. A partir de ahora referencia estas variables con $ en todo lo que diseñes.
```

---

## 1. Chat (vista principal) — frame 1280×832, clip

```
Diseña la pantalla CHAT de GARY (frame 1280×832, clip, layout horizontal). Estructura en 2 columnas:

SIDEBAR izquierdo (260px, fill $surface, borde derecho $border, layout vertical, padding 16, gap 24):
- Marca: avatar con image fill `../public/isotipo.png` en contenedor circular suave (40px) + wordmark "GARY" (Plus Jakarta Sans 20/700, $text) + tagline "tu copiloto que caza empleos" ($text-muted, 12).
- Nav (gap 4): 4 items icono+label (lucide: message-square, map, sparkles, settings) → Chat (ACTIVO: fill $accent-soft, barra izquierda 2px $accent, texto $accent), Mapa de ofertas, Onboarding, Ajustes ($text-secondary). Cada item: frame radius-md, padding [8,12], gap 12.
- Sección "Conexiones" (label 12/600 $text-muted, mayúsculas, margen sup 8): filas LinkedIn ✓conectado, Gmail ✓conectado, GetOnBoard ✗desconectado (botón "Conectar"), Himalayas ◐verificando. Cada fila: punto de estado (success/danger/warning) + nombre ($text-secondary 13) + a la derecha el estado/botón. Botón "Conectar" = ghost pequeño con borde $border-strong.
- Footer: toggle Dark/Light (sol/luna) + avatar usuario.

MAIN derecho (fill_container, layout vertical, fill $bg):
- Header (altura 56, borde inferior $border, padding [0,24], alignItems center, space_between): título "Chat" ($text 16/600) + badge de modelo "Claude" (pill $surface-2 borde $border, mono 12).
- Historial scrolleable (fill_container, padding 24, gap 20): 
  · Mensaje usuario (alineado derecha): burbuja $surface-2, radius-lg, padding [10,14], texto 15/400 $text, max ~560px.
  · Mensaje GARY (izquierda) con avatar isotipo (28px, image fill `../public/isotipo.png`): burbuja transparente; contiene un párrafo, un BLOQUE DE CÓDIGO (fill $surface-3, radius-md, header con "bash" + icono copiar, mono 13 $text) y una TABLA pequeña de resultados (3 columnas: Empresa, Score, Estado — usa jerarquía Tabla→Fila→Celda, score en mono con 5 puntos ámbar).
  · Indicador "GARY está escribiendo…" : 3 puntos $accent + label $text-muted.
- Composer (altura ~96, borde superior $border, padding 16, layout vertical, gap 8): fila de chips de acción rápida ("Buscar ofertas", "Revisa Gmail", "Continuar hunt", "Mapa de ofertas" — pills $surface-2 borde $border, 13) y debajo el input (fill $surface-2, radius-lg, borde $border, padding [10,14], placeholder "Escribe a GARY…" $text-muted) con botón enviar circular $accent (icono send, $accent-on) a la derecha.

Genera la versión dark. Luego DUPLICA el frame entero y ponle theme {mode:"light"} para la versión light, colócala a la derecha con 80px de separación.
```

## 2. Sidebar (componente en detalle) — frame 320×832

```
Diseña un frame de especificación del SIDEBAR de GARY (320×832, clip, fill $bg, centrado) que muestre el sidebar de 260px en sus estados. Replica el sidebar del prompt 1 con MÁS detalle en "Conexiones": 6 sitios mapeados (Gmail, LinkedIn, Indeed, GetOnBoard, Himalayas, Computrabajo), cada fila con icono del sitio + nombre ($text-secondary 13) + chip de estado a la derecha: conectado (✓ + "Conectado", $success / $success-soft), desconectado (✗ + botón "Conectar" ghost), verificando (spinner + "Verificando…", $warning / $warning-soft con punto pulsante). El item de nav activo usa píldora $accent-soft + barra $accent. Abajo: toggle Dark/Light (segmented sol/luna, el activo $accent-soft) y footer con avatar usuario + nombre + icono settings. Respeta tokens, foco visible y contraste AA. Genera dark y, duplicado con theme {mode:"light"}, la versión light al lado.
```

## 3. Ajustes (Settings) — frame 1280×832, clip

```
Diseña la pantalla AJUSTES de GARY (frame 1280×832, clip) con el sidebar de 260px a la izquierda (item "Ajustes" activo) y el contenido a la derecha (max-width 720 centrado, layout vertical, gap 32, padding 32). Título "Ajustes" (h1 24/700 $text) + subtítulo $text-secondary. Tres secciones, cada una con header (16/600) + texto de ayuda ($text-secondary 13) + control; NO envuelvas cada fila en tarjeta, usa separadores $border:
1) "Sesión del chat": bloque informativo que diga que el CLI/modelo activo se decide cuando el usuario entra por el chat y no se selecciona aquí. Muestra 2-3 métricas compactas de uso, por ejemplo promedio de tokens usados por Chat, Mapa de ofertas y Apply prep.
2) "API key": input tipo password (fill $surface-2, borde $border, radius-md) con icono ojo mostrar/ocultar a la derecha, un badge "Guardada en keychain" (✓ $success-soft) y botón "Validar" secundario.
3) "Navegador de automatización": fila con estado (pill "Detenido" $text-muted o "Corriendo :9333" $success-soft) + botones "Iniciar" (primary $accent) / "Detener" (danger ghost) + un campo numérico de puerto (mono, valor 9333).
Footer pegajoso (borde superior $border, padding 16, alineado derecha): "Restablecer" (ghost) + "Guardar" (primary $accent). Tokens, foco visible, AA. Genera dark y, duplicado con theme {mode:"light"}, la light al lado.
```

## 4. Onboarding — frame 1280×832, clip

```
Diseña la pantalla ONBOARDING de GARY (frame 1280×832, clip, fill $bg, contenido centrado max-width 760, layout vertical, gap 32, padding 48). Hero: isotipo oficial grande usando image fill `../public/isotipo.png` en contenedor suave, con más presencia que antes pero sin parecer mascotte decorativa; título "Bienvenido a GARY" (Plus Jakarta Sans 32/700 $text) + subtítulo "Sube tu CV, valida el contexto y entra al mapa con prioridades claras" ($text-secondary 16). Añade una microfrase de apoyo debajo en caption: "GARY ordena el proceso; el envío final sigue siendo tuyo." 
STEPPER horizontal de 3 pasos con barra de progreso ($accent rellena el paso 1-2): 1·Subir CV  2·Iniciar sesión e ingestar en NotebookLM  3·Mapa de roles. El paso activo con punto $accent, completados con check $success.
Cuerpo del paso activo (paso 2 mostrado): 
- Paso 1 ya completo: chip de archivo "cv-julian.pdf · 240 KB" con icono file + botón quitar.
- Paso 2 activo: muestra primero un aviso claro para iniciar sesión en NotebookLM antes de continuar. Debajo, tarjeta con barra de progreso (~60%, $accent) + log de estado en mono ("✓ Sesión en NotebookLM lista", "✓ Notebook creado", "⟳ Indexando CV…", "· Mapeando roles") $text-secondary.
- Preview del paso 3: 3 tarjetas de variante (Frontend, Fullstack, Backend) con chips del stack detectado (React, TypeScript, Node…), atenuadas (opacity 0.5) hasta completar.
Footer: botones "Atrás" (ghost) y "Continuar" (primary $accent, deshabilitado hasta validar el paso → opacity 0.45). Tokens, foco visible, AA. Genera dark y, duplicado con theme {mode:"light"}, la light al lado.
```

## 4.5 Intro / splash — frame 1280×832, clip

```
Diseña una pantalla de INTRO / SPLASH de GARY (frame 1280×832, clip) pensada como estado de entrada antes del chat y como base futura de animación GSAP. Fondo sobrio, elegante, con textura o gradación muy sutil. Todo centrado vertical y horizontalmente:
- isotipo oficial `../public/isotipo.png` arriba, protagonista, limpio y bien proporcionado;
- debajo, wordmark "GARY" en Plus Jakarta Sans 36/700;
- debajo, una línea breve: "tu copiloto que caza empleos";
- debajo, una microfrase de producto: "contexto, búsqueda y aplicación asistida en una sola superficie".
Debe sentirse profesional, no infantil ni genérico. Haz dark y light lado a lado, manteniendo la misma composición y carácter.
```

## 5. Mapa de ofertas — frame 1360×860, clip

```
Diseña la pantalla MAPA DE OFERTAS de GARY (frame 1360×860, clip), full-bleed (sidebar 260px + tabla). Renderiza data/offers-master.md.
TOOLBAR (altura 56, borde inferior $border, padding [0,24], gap 12, alignItems center): buscador (input $surface-2 con icono search) + chips de canal toggle (Gmail, LinkedIn, Indeed, GetOnBoard, Himalayas, Computrabajo) + chips de estado (Pendiente, Aplicada, Flag) + "Score mín" con un slider pequeño. A la derecha, resumen "48 ofertas · 12 aplicadas".
TABLA agrupada por canal (jerarquía Tabla→Fila→Celda). Cada grupo: header colapsable (nombre del canal + contador, fill $surface-2). Columnas: Empresa · Rol · Canal · Score · Estado · (acción). 
Fila de oferta (padding [12,16], borde inferior $border, hover $surface-3): 
- Empresa (texto 14/600 $text) + Rol debajo ($text-secondary 13).
- Canal: chip pequeño.
- SCORE: medidor de 5 puntos (mono número 0–5 + 5 dots; color perceptual: 0–1.9 $danger, 2–2.9 $warning, 3–3.9 $info, 4–5 $success; si ≥4.0 añade anillo $accent).
- ESTADO: caja tri-estado con icono+label (pendiente [ ] $text-muted, aplicada [x] $success, flag [~] $warning).
- Meta de comp/ubicación en mono $text-muted.
- Acción "Preparar aplicación" (botón secundario; primary $accent si score ≥4.0).
Muestra ~6 filas en 2-3 canales con scores variados. Tokens, AA, scores en JetBrains Mono. Genera dark y, duplicado con theme {mode:"light"}, la light al lado.
```

## 6. Modal de aplicación / revisión — frame 1280×832, clip

```
Diseña el MODAL DE APLICACIÓN de GARY (frame 1280×832, clip) mostrando la pantalla de ofertas atenuada detrás con un SCRIM (rgba negro ~60%). Centrado, un modal (max-width 640, fill $surface-2, radius-lg, sombra elev-3, layout vertical):
- Header (padding [20,24], borde inferior $border, space_between): "Preparar aplicación" (16/600 $text) + empresa·rol debajo ($text-secondary 13) + botón cerrar (icono x).
- AVISO PERSISTENTE de alto contraste (fill $warning-soft, borde izquierda 3px $warning, padding [12,16], icono alert-triangle $warning): "GARY NO envía — el click final es tuyo." (texto $text 14/600).
- Cuerpo (padding 24, gap 20): 
  · "CV a adjuntar": fila con icono file + "cv-julian-fullstack.pdf" + badge de variante "Fullstack" ($accent-soft) + acciones "Ver" / "Regenerar" (ghost).
  · "Respuestas borrador" (label 13/600 $text-muted): 2 preguntas de screening con su textarea editable ($surface, borde $border, radius-md) y una nota "citado desde NotebookLM" ($text-muted 12 con icono).
- Footer (padding [16,24], borde superior $border, alineado derecha, gap 12): "Cerrar" (ghost) + "Abrir en navegador y llenar hasta Submit" (primary $accent). IMPORTANTE: NO existe ningún botón "Submit/Enviar" en el modal.
Tokens, foco visible, AA, scrim 40–60%. Genera dark y, duplicado con theme {mode:"light"}, la light al lado.
```

## 7. Estados globales — frame 1280×900, clip

```
Diseña un tablero ESTADOS GLOBALES de GARY (frame 1280×900, clip, fill $bg, padding 32, grid de tarjetas 2×3 con gap 24; usa filas de frames, no grid CSS). Cada tarjeta (fill $surface, borde $border, radius-lg, padding 24, layout vertical, gap 12, alignItems center, altura ~240):
1) VACÍO: isotipo oficial en contenedor suave + "Aún no hay ofertas" (16/600 $text) + "Inicia una búsqueda para llenar tu mapa" ($text-secondary 13) + botón primary $accent "Buscar ofertas".
2) CARGANDO: 3 líneas skeleton (fill $surface-3, radius-sm, anchos 80%/100%/60%) + loader de huella sutil.
3) ERROR: icono alert-circle $danger + "Algo salió mal" + causa ($text-secondary) + botón "Reintentar" (secondary) y link "Ayuda".
4) SIN CONEXIÓN: banner icono wifi-off $warning + "Sin conexión" + "El navegador de automatización (CDP) no responde" + "Reintentar".
5) TOAST éxito: pill flotante fill $surface-2, borde izquierda $success, icono check + "Aplicación preparada".
6) TOAST error: igual con borde $danger + icono x + "No se pudo conectar".
Tokens, AA, el estado nunca solo por color. Genera dark y, duplicado con theme {mode:"light"}, la light al lado.
```

## 8. Métricas — frame 1360×860, clip

```
Diseña una pantalla MÉTRICAS de GARY (frame 1360×860, clip) con el mismo lenguaje visual del chat y el mapa de ofertas. Sidebar a la izquierda; contenido principal a la derecha. Muestra:
- tarjetas resumen para consultas hechas, jobs encontrados, fuentes activas y matches listos para aplicar;
- comparativa total jobs por website (Gmail, LinkedIn, Indeed, GetOnBoard, Himalayas, Computrabajo) usando barras simples y legibles;
- una lista de últimas consultas con timestamp, fuente y número de hallazgos.
Usa JetBrains Mono para cifras y labels de datos, Inter para el resto, y conserva la paleta cálida dark/light. Debe sentirse analítico pero no dashboard corporativo frío. Genera dark y light lado a lado.
```

---

## Checklist de calidad (pídele a Pencil que lo verifique tras cada pantalla)
- Layout no colapsado ni contenido recortado fuera del frame.
- Contraste de texto AA en ambos temas (dark y light).
- Variables temáticas usadas en todo (sin hex hardcodeado).
- Estados (hover/focus/disabled) y foco visible presentes.
- Isotipo oficial usado con gusto, nunca como icono de navegación.
- Versión dark y light de cada pantalla, lado a lado.
</content>
