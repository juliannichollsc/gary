# Spec 02 — Settings (Ajustes)

> Screen: `pencil/gary.pen` prompt 3. Components: `components.md` §D. Runtime chosen in chat; keys in keychain.

## Scope
- `SettingsLayout` with grouped sections (header + helper + control, separators — **not** a card per row).
- **ChatRuntimeSummary** — read-only explanation that the active CLI/model is the one the user started in
  chat. Settings does not choose the runtime model anymore.
- **TokenUsageSummary** — compact operational metrics showing approximate average token spend per major
  workflow/view (for example chat, offers triage, apply prep).
- **ApiKeyField** — password input (show/hide) + "Guardada en keychain" badge + "Validar" button. Stored in
  the **OS keychain** (Tauri keyring/stronghold), injected into the spawned PTY env — never committed.
- **BrowserControl** — Start/Stop the automation Chrome (`:9333`) with a running-status pill + numeric port.
- **SaveBar** — sticky footer, dirty-aware: Guardar (primary) / Restablecer (ghost).

## Runtime/LLM note
Validation stays agnostic: prefer delegating to the CLI's own login; a direct key check (the thin
LLM-integration piece Julián authorized) is the **only** place GARY may touch a provider, and only to
validate that a stored key is usable. The brain is still the terminal CLI session the user opens in chat.
Use `build-agents/ai-engineer.md` for this.

## Rust commands (new)
`get_settings`, `set_settings`, `save_api_key`(keychain), `has_api_key`, `start_browser`, `stop_browser`,
`browser_status`. Persist non-secret settings to a config file; secrets to the keychain only.

## Acceptance criteria
- Settings explains the active runtime comes from chat, surfaces token-usage summaries, and stores API keys
  in the keychain (never in the config file / git). Start/Stop toggles the Chrome debug process and reflects
  real status.
- Matches prompt 3 in both themes; AA; focus visible; SaveBar reflects dirty state.
