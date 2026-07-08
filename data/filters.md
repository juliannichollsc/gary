<!-- GARY — Filtros por defecto (default filters) usados al FILTRAR ofertas en las conexiones.
     Fuente de verdad LOCAL editable por el agente LM. Al empezar a filtrar, el agente TAMBIÉN los guarda
     en el NotebookLM del usuario (contexto RAG). Candidate-agnostic: los valores {{...}} salen del perfil
     del usuario (onboarding / config/profile.yml / NotebookLM), nunca se hardcodea una persona.
     Espeja el two-way-fit gate de docs/business-rules.md §3. El usuario ajusta esto vía el chat. -->
# Filtros por defecto

## Two-way-fit gate (una oferta debe pasar TODOS)
- **Modalidad:** remoto-mundial · remoto-LATAM (incl. país del usuario) · on-site/híbrido EN la ciudad del
  usuario · o roles con **visa sponsorship**. Region-locked en otro lado → descartar.
- **Idioma:** español o inglés. Respetar el nivel de inglés del usuario ({{english_level}}): si es B2, rechazar roles que exijan C1/C2.
- **Fit de perfil:** matchear el stack real ({{roles}} / {{skills}}). Rechazar gap-core, no-ingeniería, y roles que pidan más años de dominio de los que tiene.
- **YOE (años de experiencia):** rechazar 10+ (o por encima del total del usuario: {{total_yoe}}). 8–9 = stretch → flag, no auto-incluir.
- **Comp (salario):** piso de negociación {{salary_min}} {{currency}} — guía, **no filtro duro** (notar, no descartar).
- **Cerradas / ya aplicadas / cooldown:** descartar postings cerrados/expirados; saltar ya-aplicadas; honrar cooldown por empresa (~1 semana).

## Sourcing
- **Recencia (por defecto): 1 semana.** El usuario puede ampliarla.
- **Concurrencia:** canales CDP en serie sobre el navegador `:9333`; APIs/WebFetch en paralelo. Nunca varios bots por-sitio (429).
- **Reglas por board:** ver `docs/career-ops-map.md` / skills `source-*` (LinkedIn EasyApply, Gmail alerts, Himalayas Cloudflare, GetOnBoard early-stop, Computrabajo/Indeed).

## Conexiones activas (dónde se aplican estos filtros)
- LinkedIn · Gmail · Indeed · GetOnBoard · Himalayas · Computrabajo
