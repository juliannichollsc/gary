// GARY — PTY bridge core.
// The chat IS the terminal: we spawn the user's chosen AI coding CLI (gemini/claude/opencode…)
// inside a pseudo-terminal, stream its output to the webview (xterm.js), and pipe user input
// back to its stdin. The CLI loads GARY's .claude/skills + agents + docs/operating-rules.md,
// so 100% of the agent brain is reused — GARY only provides the chat shell.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod data;
mod engines;
mod ingest;
mod settings;
mod workspace;

use std::io::{Read, Write};
use std::sync::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize, MasterPty};
use tauri::{Emitter, State};
use engines::{EngineState, resolve_cwd, run_engine, stop_engine, stop_all_engines};
use settings::{
    BrowserState, get_settings, set_settings, save_api_key, has_api_key,
    browser_status, start_browser, stop_browser,
    list_browsers, open_in_browser, check_login, open_path,
};
use data::{read_metrics, read_offers, read_role_map, get_onboarding, set_onboarding};
use ingest::{save_cv, start_ingest, notebooklm_status, connect_notebooklm, save_context, add_context_source};

struct PtyState {
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
}

// Project-root / cwd resolution is shared with the engine orchestrator — see `engines::resolve_cwd`
// (the spawned CLI *and* the bots must run with CWD = project root so `.claude/` + engine assets load).

// Shared PTY wiring: spawn `cmd` in a fresh pseudo-terminal rooted at `cwd`, stash the writer/master
// in state, and stream the child's output to the frontend as "pty://data" events. Both `open_terminal`
// (the system shell — the default boot path) and `spawn_cli` (an explicit CLI launch) funnel through here.
fn spawn_in_pty(app: tauri::AppHandle, state: &State<PtyState>, mut cmd: CommandBuilder, cwd: &str) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    cmd.cwd(resolve_cwd(cwd));
    pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    *state.writer.lock().unwrap() = Some(pair.master.take_writer().map_err(|e| e.to_string())?);
    *state.master.lock().unwrap() = Some(pair.master);

    // Stream PTY output → frontend as "pty://data" events
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => { let _ = app.emit("pty://exit", ()); break; }
                Ok(n) => { let _ = app.emit("pty://data", String::from_utf8_lossy(&buf[..n]).to_string()); }
                Err(_) => break,
            }
        }
    });
    Ok(())
}

// Pick the system shell for the current OS. Windows: $ComSpec (usually cmd.exe) → powershell.exe.
// Unix: $SHELL → /bin/bash. This is what the chat terminal boots — NO LLM is preloaded; the user
// (or a launch chip) types `claude` / `gemini` / `opencode` to start their agent.
fn system_shell() -> String {
    if cfg!(windows) {
        std::env::var("ComSpec").unwrap_or_else(|_| "powershell.exe".to_string())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

// Open the system shell in a PTY rooted at the project root ("." → resolve_cwd → project root),
// so any CLI the user launches from it loads GARY's `.claude/` skills + agents. This is the boot path.
#[tauri::command]
fn open_terminal(app: tauri::AppHandle, state: State<PtyState>) -> Result<(), String> {
    let cmd = CommandBuilder::new(system_shell());
    spawn_in_pty(app, &state, cmd, ".")
}

// Spawn a concrete CLI (e.g. "gemini", "claude", "opencode") in a PTY rooted at `cwd`. Kept for
// explicit launches; the boot path uses `open_terminal` instead so no LLM is preloaded.
#[tauri::command]
fn spawn_cli(app: tauri::AppHandle, state: State<PtyState>, program: String, args: Vec<String>, cwd: String) -> Result<(), String> {
    let mut cmd = CommandBuilder::new(program);
    cmd.args(args);
    spawn_in_pty(app, &state, cmd, &cwd)
}

// User keystrokes / input from the chat box → CLI stdin.
#[tauri::command]
fn write_stdin(state: State<PtyState>, data: String) -> Result<(), String> {
    if let Some(w) = state.writer.lock().unwrap().as_mut() {
        w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        w.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn resize_pty(state: State<PtyState>, rows: u16, cols: u16) -> Result<(), String> {
    if let Some(m) = state.master.lock().unwrap().as_ref() {
        m.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(PtyState { writer: Mutex::new(None), master: Mutex::new(None) })
        .manage(BrowserState::default())
        .manage(EngineState::default())
        .setup(|app| {
            // Installed app: materialize GARY's context into a writable workspace (no-op in dev).
            workspace::bootstrap(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_terminal, spawn_cli, write_stdin, resize_pty,
            get_settings, set_settings, save_api_key, has_api_key,
            browser_status, start_browser, stop_browser,
            list_browsers, open_in_browser, check_login, open_path,
            read_metrics, read_offers, read_role_map, get_onboarding, set_onboarding,
            save_cv, start_ingest, notebooklm_status, connect_notebooklm,
            save_context, add_context_source,
            run_engine, stop_engine, stop_all_engines
        ])
        .run(tauri::generate_context!())
        .expect("error while running GARY");
}
