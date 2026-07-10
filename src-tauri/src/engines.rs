// GARY — engine orchestrator (spec 07).
// The deterministic bots live in `engines/*.mjs` (Playwright/CDP scrapers, apply-to-Submit filler,
// CV builder). GARY NEVER calls an LLM API — these engines are token-free; the terminal LM (spawned
// in the PTY, see main.rs) is only a SUPERVISOR. This module lets the supervisor/frontend spawn an
// engine with CWD = project root, stream its stdout+stderr line-buffered to the webview as
// `engine://data` events, and stop it immediately on request (`stop_engine` / `stop_all_engines`).
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};

use crate::proc::hide_console;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{Emitter, Manager, State};

// --- Shared project-root resolution (the single source of truth for both the PTY bridge and the
// engines). The spawned CLI *and* the bots must run with CWD = project root so the `.claude/` skills
// and the engines' CWD-relative `output/`, `config/`, `cv-data.md`, `templates/` all resolve.
// Priority: $GARY_ROOT → strip a trailing `src-tauri` from CWD (dev) → CWD as-is.
pub fn project_root() -> PathBuf {
    if let Ok(r) = std::env::var("GARY_ROOT") {
        return PathBuf::from(r);
    }
    let cur = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if cur.file_name().map(|n| n == "src-tauri").unwrap_or(false) {
        cur.parent().map(PathBuf::from).unwrap_or(cur)
    } else {
        cur
    }
}

// A relative `cwd` ("." or "") means "the project root"; an absolute `cwd` is honored verbatim.
pub fn resolve_cwd(cwd: &str) -> PathBuf {
    let requested = PathBuf::from(cwd);
    if requested.is_absolute() {
        return requested;
    }
    let root = project_root();
    if cwd.is_empty() || cwd == "." {
        root
    } else {
        root.join(cwd)
    }
}

// Managed state: the live engine children, keyed by run id, so `stop_engine` can kill them.
#[derive(Default)]
pub struct EngineState {
    children: Mutex<HashMap<u32, Child>>,
    next_id: AtomicU32,
}

// One streamed line from a running engine. `stream` is "stdout" | "stderr".
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineData {
    run_id: u32,
    name: String,
    stream: &'static str,
    line: String,
}

// Emitted once, when an engine process terminates. `code` is None if killed / signalled.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineExit {
    run_id: u32,
    name: String,
    code: Option<i32>,
}

// Reject anything that could escape the `engines/` dir; normalize an optional `.mjs` suffix.
fn engine_script(name: &str) -> Result<PathBuf, String> {
    let bare = name.strip_suffix(".mjs").unwrap_or(name);
    if bare.is_empty()
        || bare.contains('/')
        || bare.contains('\\')
        || bare.contains("..")
        || bare.contains(':')
    {
        return Err(format!("nombre de engine inválido: {name:?}"));
    }
    let script = project_root().join("engines").join(format!("{bare}.mjs"));
    if !script.exists() {
        return Err(format!("no se encontró el engine {}", script.display()));
    }
    Ok(script)
}

// Best-effort probe of the debug Chrome (settings.rs owns start/stop on :9333). We DON'T block the
// run on it — engines that need CDP will surface their own error, which the supervisor then handles.
fn browser_up(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
}

// Spawn `node engines/<name>.mjs <args...>` with CWD = project root, inheriting the environment.
// Streams stdout+stderr line-buffered as `engine://data` and emits `engine://exit` on termination.
// Returns a run id the frontend uses to `stop_engine`.
#[tauri::command]
pub fn run_engine(
    app: tauri::AppHandle,
    state: State<EngineState>,
    name: String,
    args: Vec<String>,
) -> Result<u32, String> {
    let script = engine_script(&name)?;
    let root = project_root();

    // Light, non-blocking browser check — a warning line, never a hard failure (spec: don't block).
    let port = crate::settings::get_settings(app.clone())
        .map(|s| s.browser_port)
        .unwrap_or(9333);
    if !browser_up(port) {
        let _ = app.emit(
            "engine://data",
            EngineData {
                run_id: 0,
                name: name.clone(),
                stream: "stderr",
                line: format!(
                    "[gary] aviso: Chrome debug no responde en :{port} — inícialo si este engine usa CDP"
                ),
            },
        );
    }

    let mut cmd = Command::new("node");
    hide_console(&mut cmd);
    cmd.arg(&script)
        .args(&args)
        .current_dir(&root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("no se pudo lanzar node: {e}"))?;

    let run_id = state.next_id.fetch_add(1, Ordering::SeqCst) + 1;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    state.children.lock().unwrap().insert(run_id, child);

    // stderr → data (fire-and-forget; the stdout thread owns finalization/exit).
    if let Some(err) = stderr {
        let app = app.clone();
        let name = name.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(err);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app.emit(
                    "engine://data",
                    EngineData { run_id, name: name.clone(), stream: "stderr", line },
                );
            }
        });
    }

    // stdout → data, then reap the child (removing it from the map) and emit the single exit event.
    let stdout = stdout.ok_or_else(|| "no se pudo capturar stdout del engine".to_string())?;
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            let _ = app.emit(
                "engine://data",
                EngineData { run_id, name: name.clone(), stream: "stdout", line },
            );
        }
        // stdout EOF ⇒ the process is exiting (or was killed). Reap it for the exit code. If
        // `stop_engine` already removed+reaped it, `remove` yields None and we skip a duplicate exit.
        let state = app.state::<EngineState>();
        let child = state.children.lock().unwrap().remove(&run_id);
        if let Some(mut child) = child {
            let code = child.wait().ok().and_then(|s| s.code());
            let _ = app.emit("engine://exit", EngineExit { run_id, name, code });
        }
    });

    Ok(run_id)
}

// Kill a running engine immediately (spec: "Stop is immediate on request"). We only signal the kill
// here; the stdout reader thread observes EOF, reaps the child, and emits the `engine://exit` event.
#[tauri::command]
pub fn stop_engine(state: State<EngineState>, run_id: u32) -> Result<bool, String> {
    let mut map = state.children.lock().unwrap();
    match map.get_mut(&run_id) {
        Some(child) => {
            child.kill().map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false), // already exited / unknown id
    }
}

// Kill every running engine (e.g. a global "stop everything" from the UI). Returns how many were
// signalled. Reaping + exit events are handled by each run's stdout thread, as with `stop_engine`.
#[tauri::command]
pub fn stop_all_engines(state: State<EngineState>) -> Result<usize, String> {
    let mut map = state.children.lock().unwrap();
    let mut killed = 0usize;
    for child in map.values_mut() {
        if child.kill().is_ok() {
            killed += 1;
        }
    }
    Ok(killed)
}
