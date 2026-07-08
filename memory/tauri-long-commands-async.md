---
name: tauri-long-commands-async
description: Long-running Tauri commands must be async + spawn_blocking or they freeze the UI; window ops need a capabilities file
metadata:
  type: reference
---

In Tauri v2, a **synchronous `#[tauri::command]` runs on the main/UI thread** — any long or blocking work (spawning `node`/Playwright, waiting on `.output()`, heavy I/O) **freezes the whole webview**. Make such commands `async` and offload the blocking call with `tauri::async_runtime::spawn_blocking(move || { ... }).await`. (Learned when `check_login` froze the app for 20–60s while running an engine.)

Two more Tauri v2 gotchas from this project:
- **Core window controls** (`minimize` / `toggleMaximize` / `close`, and drag via `data-tauri-drag-region`) require a **capabilities file** (`src-tauri/capabilities/default.json`) granting `core:window:*` (+ `core:window:allow-start-dragging`). Without it they silently no-op. Custom app commands do NOT need ACL permissions.
- **HTML file drag-drop** in the webview needs `"dragDropEnabled": false` on the window, or Tauri intercepts the OS drop and the DOM `ondrop` never fires.

**How to apply:** any Rust command that spawns a process or does I/O that can exceed ~100ms → `async` + `spawn_blocking`. Verify the backend with `cargo check` (fast once deps are cached).
