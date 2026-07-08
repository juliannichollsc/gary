# GARY 🐾 — Component Inventory (React-ready)

> Implementation-ready catalog of every UI component across GARY's screens. Maps 1:1 to the Pencil
> `.pen` mockups in `pencil/` and to the tokens in [`docs/design-system.md`](./design-system.md).
> **Design only — no implementation yet.** Props are the contract for the build phase.
> All components: themed (dark/light), keyboard-accessible, GSAP-animated per the design system §5.

---

## A. Foundation / primitives

| Component | Variants | Key props | A11y / notes |
|-----------|----------|-----------|--------------|
| **Button** | `primary` (accent) · `secondary` · `ghost` · `danger` · sizes `sm/md` | `variant, size, loading, disabled, iconLeft/Right, onClick` | `loading` → spinner + disabled, label persists; focus ring; press scale 0.98 |
| **IconButton** | same variants | `icon, aria-label (required), tooltip` | never icon-only without `aria-label` |
| **Input / Textarea** | text, password (show/hide), number | `label, value, placeholder, error, helper, required, type` | visible label; error below + `role=alert`; mono for numbers |
| **Select / Dropdown** | single | `label, options, value, onChange` | keyboard nav; `elev-2` popover |
| **Toggle (Switch)** | — | `checked, onChange, label` | used for Dark/Light + settings booleans |
| **SegmentedControl** | — | `options, value, onChange` | reserved for simple toggles; no longer used to choose the runtime model in Settings |
| **Chip / Tag** | `filter` (toggle) · `status` · `static` | `label, active, color, onRemove?` | filters in offers map; status colors from tokens |
| **Tooltip** | — | `content, side` | keyboard-reachable; truncation companion |
| **Avatar** | `paw` (GARY) · `user` · `site` | `kind, src, size` | paw = crafted SVG brand mark, not emoji |
| **StatusDot** | `success/warning/danger/info` | `status, pulse` | pulse for "verificando"; paired with label always |
| **Skeleton** | line · block · row | `width, height` | shimmer for >300ms loads |

## B. Chat (main view) — `chat.pen`

| Component | Description | Props / states |
|-----------|-------------|----------------|
| **ChatLayout** | Header (title + model badge) · scrollable message list · composer. Underneath = embedded xterm terminal, skinned as chat. | — |
| **ChatMessage** | Bubble; `user` (right, surface-2) vs `gary` (left, with paw avatar). Renders markdown, **code blocks**, **tables**. | `author, content, timestamp, streaming` |
| **CodeBlock** | Mono, `--surface-3`, header with language + copy button. | `lang, code, onCopy` |
| **DataTable (in-message)** | Compact table for offers/results inside chat. | `columns, rows` |
| **StreamingIndicator** | 3-dot amber bounce + "GARY está escribiendo…". | loops; `aria-live=polite` |
| **Composer** | Multiline input (`--surface-2`), send button (accent), Enter=send / Shift+Enter=newline, char/stop affordance during stream. | `value, onSend, onStop, streaming, disabled` |
| **QuickActions** | Row of suggestion chips above composer ("Buscar ofertas", "Revisa Gmail", "Continuar hunt", "Mapa de ofertas"). | `actions[]` |

## C. Sidebar — `sidebar.pen`

| Component | Description | Props / states |
|-----------|-------------|----------------|
| **Sidebar** | 260px panel; collapsible to 64px icon-rail. | `collapsed` |
| **BrandHeader** | Paw mark + "GARY" wordmark + tagline. Paw wags on hover. | — |
| **NavItem** | Icon + label; active = accent pill (Flip morph) + left bar. Items: **Chat · Mapa de ofertas · Onboarding · Métricas · Ajustes**. `Métricas` lives directly below `Onboarding` in the sidebar. | `icon, label, active, badge?` |
| **ConnectionsSection** | Header "Conexiones" + list of mapped sites. | — |
| **ConnectionItem** | Site favicon/name + **StatusPill** (conectado ✓ / desconectado ✗ / verificando) + **"Conectar"** button (opens automation browser). Sites: Gmail · LinkedIn · Indeed · GetOnBoard · Himalayas · Computrabajo. | `site, status, onConnect` |
| **ThemeToggle** | Dark/Light switch with sun/moon, bottom of sidebar. | `theme, onToggle` |
| **UserFooter** | User avatar + name + settings shortcut. | — |

## D. Ajustes (Settings) — `settings.pen`

| Component | Description | Props / states |
|-----------|-------------|----------------|
| **SettingsLayout** | Grouped sections with headers + helper text. | — |
| **ChatRuntimeSummary** | Read-only block that explains the active CLI/model comes from the current chat session, not from Settings. | `cliLabel, modelLabel, sessionState` |
| **TokenUsageSummary** | Compact metrics showing approximate average tokens spent by major product views or workflows. | `items[]` |
| **ApiKeyField** | Password input (show/hide) + "guardada en keychain" badge + validate button. | `value, stored, onSave` |
| **BrowserControl** | Start/Stop automation browser (Chrome:9333) with running status pill + port field. | `running, port, onStart, onStop` |
| **SettingsRow** | Label + helper + control, consistent grid. | `label, helper, control` |
| **SaveBar** | Sticky footer: Save / Reset, dirty-state aware. | `dirty, onSave, onReset` |

## E. Onboarding — `onboarding.pen`

| Component | Description | Props / states |
|-----------|-------------|----------------|
| **OnboardingStepper** | 3 steps: **Subir CV → Iniciar sesión e ingestar en NotebookLM (RAG) → Mapa de roles**. Step dots + progress bar. | `step, total` |
| **CvUpload** | Drag-and-drop zone + browse; file chip with name/size; replace/remove. | `file, onUpload, onRemove` |
| **NotebookLMLoginBanner** | High-visibility guidance telling the user to sign in to NotebookLM before ingest starts. | `signedIn, onContinue` |
| **IngestProgress** | Progress bar + status log ("Inicia sesión en NotebookLM…", "Creando notebook…", "Indexando CV…") with NotebookLM mark. | `progress, status` |
| **RoleMap** | Cards per role variant (frontend / fullstack / backend) with detected stack chips; editable. | `roles[]` |
| **OnboardingHero** | Official isotipo centered above the welcome heading (display type). | — |
| **StepNav** | Back / Continue (Continue disabled until step valid). | `canContinue, onBack, onNext` |

## E2. Intro / splash — `intro.pen`

| Component | Description | Props / states |
|-----------|-------------|----------------|
| **IntroSplash** | Centered launch screen with official isotipo above the wordmark "GARY". Used as the polished pre-chat entry state and later motion target for GSAP. | `theme, loadingState?` |
| **IntroCaption** | Short supporting line under the wordmark clarifying the product role. | `text` |

## F. Mapa de ofertas — `offers-map.pen`

Renders `data/offers-master.md`.

| Component | Description | Props / states |
|-----------|-------------|----------------|
| **OffersLayout** | Toolbar (filters + search) · per-channel grouped table · summary. | — |
| **FilterBar** | Channel chips (Gmail/LinkedIn/Indeed/GetOnBoard/Himalayas/Computrabajo), status filter ([ ]/[x]/[~]), score-min slider, search. | `filters, onChange` |
| **ChannelGroup** | Collapsible section per channel with count + summary row. | `channel, count` |
| **OfferRow** | Company · role · channel · **ScoreMeter** (0–5) · **StatusBox** ([ ] pendiente / [x] aplicada / [~] flag) · comp/location meta · **"Preparar aplicación"** action. | `offer, onPrepare` |
| **ScoreMeter** | 5 dots + number, perceptual color; ≥4.0 gets accent ring. | `score` (0–5) |
| **StatusBox** | Checkbox-style tri-state with icon + label + color. | `status` |
| **OffersSummary** | Per-channel counts + totals header. | `summary` |

## F2. Métricas — `metrics.pen`

| Component | Description | Props / states |
|-----------|-------------|----------------|
| **MetricsOverview** | Summary cards for total queries, jobs found, active sources, and apply-ready matches. | `stats[]` |
| **JobsBySourceChart** | Side-by-side comparison of total jobs found by website/source. | `series[]` |
| **QueryHistoryPanel** | Timeline/list of recent hunts or queries with counts and status. | `items[]` |

## G. Modal de aplicación / revisión — `apply-modal.pen` — ❌ CANCELLED (2026-07-02)

> **Not implemented.** No apply modal — apply prep + dynamic screening questions happen in the **Chat**
> (supervisor asks → `learn()` → `--resume`). The Submit-guard notice lives on the offers/chat
> apply-initiation surface (already on the Offers map view). Table kept for history; ignore for the build.
> See `specs/05-apply-modal.md`.

| Component | Description | Props / states |
|-----------|-------------|----------------|
| **ApplyModal** | `elev-3` modal, scrim, scales from trigger. Header = company/role. | `offer, onClose` |
| **SubmitGuardBanner** | **Persistent high-contrast notice: "GARY NO envía — el click final es tuyo."** Always visible, top of modal. | warning/info styling |
| **CvAttachment** | Tailored CV preview/filename + variant badge + "ver / regenerar". | `cv, variant` |
| **DraftAnswers** | List of screening Q + editable draft answer (textarea), source-cited from NotebookLM. | `answers[], onEdit` |
| **ApplyActions** | "Abrir en navegador y llenar hasta Submit" (primary) · "Cerrar". **No "Submit" button exists.** | `onPrepare, onClose` |

## H. Global states (every screen) — `states.pen`

| Component | Description | Props / states |
|-----------|-------------|----------------|
| **EmptyState** | Paw hero + heading + helper + primary action (e.g. "Aún no hay ofertas — inicia una búsqueda"). | `icon, title, body, action` |
| **LoadingState** | Skeletons (lists/cards) or centered paw loader for full-screen. | `kind` |
| **ErrorState** | Danger icon + cause + **recovery action** (retry/help) — never a dead end. | `message, onRetry` |
| **OfflineState** | "Sin conexión" banner + degraded-mode note (automation browser/CDP down). | `onRetry` |
| **Toast** | Success/warning/danger/info; slide-up, auto-dismiss 3–5s, `aria-live`. | `type, message` |

---

## Component → screen matrix

| Screen (`.pen`) | Primary components |
|-----------------|--------------------|
| `chat` | ChatLayout, ChatMessage, CodeBlock, StreamingIndicator, Composer, QuickActions, Sidebar |
| `sidebar` | Sidebar, BrandHeader, NavItem, ConnectionsSection, ConnectionItem, StatusPill, ThemeToggle |
| `settings` | ChatRuntimeSummary, TokenUsageSummary, ApiKeyField, BrowserControl, SettingsRow, SaveBar |
| `onboarding` | OnboardingStepper, CvUpload, NotebookLMLoginBanner, IngestProgress, RoleMap, OnboardingHero, StepNav |
| `intro` | IntroSplash, IntroCaption |
| `offers-map` | FilterBar, ChannelGroup, OfferRow, ScoreMeter, StatusBox, OffersSummary |
| `metrics` | MetricsOverview, JobsBySourceChart, QueryHistoryPanel |
| `apply-modal` | ApplyModal, SubmitGuardBanner, CvAttachment, DraftAnswers, ApplyActions |
| `states` | EmptyState, LoadingState, ErrorState, OfflineState, Toast |

> Build order suggestion (later phase): primitives (A) → Sidebar+Chat shell (C, B) → Settings (D) →
> Offers map (F) → Onboarding (E) → Apply modal (G) → polish global states + GSAP motion (H, §5).
</content>
