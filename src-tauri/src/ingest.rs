// GARY — NotebookLM ingest (spec 03, "Option A", user-approved). Turns onboarding into a REAL candidate
// RAG: persists the uploaded CV to disk, then drives the bundled `notebooklm-ai-plugin` CLI to create (or
// reuse) a notebook and index the CV as a source. The plugin talks to NotebookLM over its own RPC — it is
// NOT an LLM API call, so this stays consistent with "GARY never calls an LLM itself" (decision #1).
// Progress is streamed to the webview as `gary://ingest` events (the same contract `onboarding.ts`
// simulates against): {kind:"log"}, {kind:"progress"}, {kind:"notebook",id}, {kind:"error"}.
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::settings::project_root;

// The bundled NotebookLM plugin (candidate-agnostic). We run it with `npx -y bun main.ts …` from its own
// scripts dir. Cookies/library persist in %APPDATA%/notebooklm-ai (cwd-independent — see the plugin's
// paths.ts), so `login` is idempotent across runs regardless of the working directory.
fn plugin_scripts_dir() -> PathBuf {
    project_root()
        .join(".claude").join("skills").join("notebooklm-ai-plugin")
        .join("skills").join("notebooklm").join("scripts")
}

// Defense in depth: never let a caller-supplied file name escape `data/cv/base/`.
fn base_name(name: &str) -> String {
    Path::new(name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "cv".to_string())
}

// Persist the uploaded CV bytes to `data/cv/base/<name>` and return its absolute path. The webview reads
// the browser File's bytes (`arrayBuffer`) and hands them here — a webview File object never lands on disk
// by itself, so this is the prerequisite that lets the ingest do `sources add-file <path>`.
#[tauri::command]
pub fn save_cv(name: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = project_root().join("data").join("cv").join("base");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(base_name(&name));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// Build a plugin invocation (`npx -y bun main.ts <args>`) rooted at the scripts dir. On Windows `npx` is
// a .cmd shim, so it must go through cmd.exe; elsewhere invoke npx directly.
fn plugin_command(args: &[&str]) -> Result<Command, String> {
    let dir = plugin_scripts_dir();
    if !dir.join("main.ts").exists() {
        return Err(format!("plugin de NotebookLM no encontrado en {}", dir.display()));
    }
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.args(["/C", "npx", "-y", "bun", "main.ts"]);
        c
    } else {
        let mut c = Command::new("npx");
        c.args(["-y", "bun", "main.ts"]);
        c
    };
    cmd.args(args).current_dir(&dir);
    Ok(cmd)
}

// Run one plugin subcommand. Streams both stdout and stderr line-by-line to the webview as {kind:"log"}
// events and returns the full captured stdout (so the caller can parse a `--json` payload). Errors on
// spawn failure or a non-zero exit. stderr is drained on its own thread so a full pipe can't deadlock us.
fn run_plugin(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let mut cmd = plugin_command(args)?;
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("no se pudo lanzar el plugin: {e}"))?;

    if let Some(err) = child.stderr.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                let _ = app2.emit("gary://ingest", json!({ "kind": "log", "line": line }));
            }
        });
    }

    let mut out = String::new();
    if let Some(so) = child.stdout.take() {
        for line in BufReader::new(so).lines().map_while(Result::ok) {
            let _ = app.emit("gary://ingest", json!({ "kind": "log", "line": line }));
            out.push_str(&line);
            out.push('\n');
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("`{}` terminó con {}", args.join(" "), status));
    }
    Ok(out)
}

// The plugin prints PRETTY (multi-line) JSON with `--json`, so we can't match a single line — grab the
// whole `{ … }` block from stdout and parse it.
fn first_json_object(stdout: &str) -> Option<Value> {
    let start = stdout.find('{')?;
    let end = stdout.rfind('}')?;
    if end < start {
        return None;
    }
    serde_json::from_str(stdout[start..=end].trim()).ok()
}

// Extract the new notebook id from a `notebooks create --json` run (`{ "id", "url" }`).
fn parse_notebook_id(stdout: &str) -> Option<String> {
    match first_json_object(stdout)?.get("id") {
        Some(Value::String(id)) if !id.is_empty() => Some(id.clone()),
        _ => None,
    }
}

// Authoritative existence check by UUID: `notebooks exists <id> --json` → `{ "id", "exists": bool }`.
// (`sources list` can't tell "empty" from "deleted" — both return []; LIST_NOTEBOOKS membership can.)
fn notebook_exists(id: &str) -> bool {
    matches!(
        run_plugin_quiet(&["notebooks", "exists", id, "--json"]),
        Ok((true, out)) if first_json_object(&out).and_then(|o| o.get("exists").and_then(Value::as_bool)).unwrap_or(false)
    )
}

// Run a plugin subcommand WITHOUT streaming to the UI — just capture (exit-ok, stdout). The exit code is an
// existence probe: `sources list` exits non-zero when the notebook is gone (GET_NOTEBOOK fails).
fn run_plugin_quiet(args: &[&str]) -> Result<(bool, String), String> {
    let out = plugin_command(args)?
        .output()
        .map_err(|e| format!("no se pudo lanzar el plugin: {e}"))?;
    Ok((out.status.success(), String::from_utf8_lossy(&out.stdout).to_string()))
}

// Parse `sources list --json` (pretty array of `{id,title,type}`) → (id, title) pairs.
fn parse_sources(stdout: &str) -> Vec<(String, String)> {
    let (start, end) = match (stdout.find('['), stdout.rfind(']')) {
        (Some(s), Some(e)) if e >= s => (s, e),
        _ => return vec![],
    };
    let v: Value = match serde_json::from_str(&stdout[start..=end]) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    v.as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|s| {
                    let id = s.get("id")?.as_str()?.to_string();
                    let title = s.get("title").and_then(Value::as_str).unwrap_or("").to_string();
                    Some((id, title))
                })
                .collect()
        })
        .unwrap_or_default()
}

// Persist the consolidated onboarding context (technical + soft skills, role families, and the typical-
// question answers) to `data/cv/base/gary-context.md`. This is added to the SAME notebook as the CV so the
// agent has one queryable context to filter by modality/roles/salary without re-asking (the RAG contract).
#[tauri::command]
pub fn save_context(content: String) -> Result<String, String> {
    let dir = project_root().join("data").join("cv").join("base");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("gary-context.md");
    std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// Add the onboarding-context file to the user's notebook (skills/roles/answers → RAG). Quiet, one-shot (no
// streaming): called at "Terminar/Guardar" after the CV notebook already exists. Best-effort → returns bool.
#[tauri::command]
pub async fn add_context_source(notebook_id: String, context_path: String) -> Result<bool, String> {
    if notebook_id.is_empty() {
        return Ok(false);
    }
    tauri::async_runtime::spawn_blocking(move || {
        // IDEMPOTENTE: borra cualquier `gary-context.md` previo antes de agregar el nuevo, para no acumular
        // contextos repetidos en el notebook (bug: finish() re-ingestaba y se duplicaba). El CV NO se toca.
        if let Ok((true, list_out)) = run_plugin_quiet(&["sources", "list", "--notebook", &notebook_id, "--json"]) {
            for (sid, title) in parse_sources(&list_out) {
                if title.to_lowercase().contains("gary-context") {
                    let _ = run_plugin_quiet(&["sources", "delete", &sid, "--notebook", &notebook_id]);
                }
            }
        }
        let out = plugin_command(&["sources", "add-file", &context_path, "--notebook", &notebook_id])?
            .output()
            .map_err(|e| format!("no se pudo agregar el contexto: {e}"))?;
        Ok(out.status.success())
    })
    .await
    .map_err(|e| e.to_string())?
}

// The plugin persists cookies at %APPDATA%/notebooklm-ai/cookies.json (see the plugin's paths.ts —
// cwd-independent). We resolve the same path to answer "are we connected?" with a pure file read.
fn cookie_file() -> Option<PathBuf> {
    let root = std::env::var("APPDATA")
        .ok()
        .map(PathBuf::from)
        .or_else(|| std::env::var("HOME").ok().map(|h| PathBuf::from(h).join(".local").join("share")))?;
    Some(root.join("notebooklm-ai").join("cookies.json"))
}

// Cheap, one-shot connection status — NO browser, NO network, NO polling. Just checks the plugin cookie
// file for the two required Google cookies (SID, __Secure-1PSID). Called on app launch / when entering the
// ingest step so a closed browser or missing session simply surfaces "Conectar" instead of any heavy work.
#[tauri::command]
pub fn notebooklm_status() -> bool {
    let Some(path) = cookie_file() else { return false };
    let Ok(text) = std::fs::read_to_string(&path) else { return false };
    let Ok(v) = serde_json::from_str::<Value>(&text) else { return false };
    // File is `{version:1, cookieMap:{…}}`; older/flat maps are also tolerated.
    let map = v.get("cookieMap").unwrap_or(&v);
    let has = |k: &str| map.get(k).and_then(Value::as_str).map(|s| !s.is_empty()).unwrap_or(false);
    has("SID") && has("__Secure-1PSID")
}

// One-shot session verify + cookie bridge — the Connections pattern applied to NotebookLM. Reads the Google
// session from the ALREADY-RUNNING automation browser (:9333) via `engines/notebooklm-session.mjs` (one CDP
// read, no second browser, no polling), then hands the cookies to the plugin's `login --cookies` so its RPC
// calls authenticate. Returns true iff the session was captured and saved. The webview should race this with
// its own timeout (like `verify` in Sidebar.tsx) so a hung CDP read can't pin the UI.
#[tauri::command]
pub async fn connect_notebooklm() -> Result<bool, String> {
    let root = project_root();
    let engine = root.join("engines").join("notebooklm-session.mjs");
    if !engine.exists() {
        return Err("engine notebooklm-session.mjs no encontrado".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        // 1) Grab cookies from the automation browser (0 tokens, attaches to the open tab).
        let out = Command::new("node")
            .arg(&engine)
            .current_dir(&root)
            .output()
            .map_err(|e| format!("no se pudo correr el engine: {e}"))?;
        let stdout = String::from_utf8_lossy(&out.stdout);
        let header = stdout
            .lines()
            .find_map(|l| l.trim().strip_prefix("COOKIES: ").map(str::to_string));
        let Some(header) = header else {
            return Ok(false); // navegador cerrado o sesión de Google no iniciada → "Conectar"
        };
        // 2) Hand them to the plugin so it authenticates without launching its own browser.
        let login = plugin_command(&["login", "--cookies", &header])?
            .output()
            .map_err(|e| format!("no se pudo guardar la sesión: {e}"))?;
        Ok(login.status.success())
    })
    .await
    .map_err(|e| e.to_string())?
}

// Drive the full ingest pipeline: authenticate → create-or-reuse the notebook → index the CV. Returns
// `true` immediately (before the work finishes) to tell the UI a real backend is present, so it listens
// for `gary://ingest` events instead of running its local simulation. The heavy work runs on a blocking
// thread because the FIRST `login` can block on an interactive Chrome window.
#[tauri::command]
pub async fn start_ingest(
    app: AppHandle,
    cv_path: String,
    notebook_id: Option<String>,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let emit = |v: Value| {
            let _ = app.emit("gary://ingest", v);
        };
        // Emit a terminal error event so the UI settles, then stop the pipeline.
        macro_rules! bail {
            ($msg:expr) => {{
                emit(json!({ "kind": "error", "message": $msg }));
                return;
            }};
        }

        // NO auto-login here (that would launch a second Chrome + poll for 5 min → overloads the machine).
        // The session is established manually beforehand via `connect_notebooklm` (reuses the :9333 browser).
        // If cookies aren't present we stop cleanly and tell the user to connect — no browser is opened.
        if !notebooklm_status() {
            bail!("Conecta NotebookLM primero (botón Conectar → Verificar sesión).".to_string());
        }
        emit(json!({ "kind": "log", "line": "· Sesión de NotebookLM verificada" }));
        emit(json!({ "kind": "progress", "value": 0.25 }));

        // Helper: create a brand-new notebook and return its id (or bail on failure).
        macro_rules! create_notebook {
            () => {{
                emit(json!({ "kind": "log", "line": "· Creando notebook de contexto…" }));
                let out = match run_plugin(&app, &["notebooks", "create", "--name", "GARY", "--json"]) {
                    Ok(o) => o,
                    Err(e) => bail!(format!("No se pudo crear el notebook: {e}")),
                };
                match parse_notebook_id(&out) {
                    Some(id) => id,
                    None => bail!("No se pudo leer el id del notebook creado (revisa el payload CCqFvf)."),
                }
            }};
        }

        // Resolve the notebook. If we have a saved id, REUSE it only if it still exists on NotebookLM
        // (`sources list` = existence probe); if the user deleted it on the website, RECREATE. On reuse we
        // drop the OLD CV source (everything except the context file) so the new CV replaces it — "actualiza
        // el ya creado". No saved id → create fresh.
        let nb_id = match notebook_id.as_deref().filter(|s| !s.is_empty()) {
            Some(id) => {
                emit(json!({ "kind": "log", "line": "· Verificando el notebook en NotebookLM…" }));
                if notebook_exists(id) {
                    // "actualiza el ya creado": limpia TODAS las fuentes y re-ingesta (CV ahora + contexto en
                    // finish). Robusto: NotebookLM puede titular el PDF por su metadata, así que no dependemos
                    // de emparejar títulos para distinguir CV de contexto.
                    emit(json!({ "kind": "log", "line": format!("· Actualizando notebook {id}") }));
                    if let Ok((true, list_out)) = run_plugin_quiet(&["sources", "list", "--notebook", id, "--json"]) {
                        for (sid, _title) in parse_sources(&list_out) {
                            let _ = run_plugin_quiet(&["sources", "delete", &sid, "--notebook", id]);
                        }
                    }
                    id.to_string()
                } else {
                    // borrado en la web (o id inválido) → recrear (el UUID nuevo se reporta abajo).
                    emit(json!({ "kind": "log", "line": "· El notebook ya no existe en NotebookLM → recreando…" }));
                    create_notebook!()
                }
            }
            None => create_notebook!(),
        };
        // Siempre reporta el id (posiblemente nuevo) para que la UI lo persista y "Abrir NotebookLM" apunte bien.
        emit(json!({ "kind": "notebook", "id": nb_id }));
        emit(json!({ "kind": "progress", "value": 0.5 }));

        emit(json!({ "kind": "log", "line": "⟳ Indexando CV en NotebookLM…" }));
        if let Err(e) = run_plugin(&app, &["sources", "add-file", &cv_path, "--notebook", &nb_id]) {
            bail!(format!("No se pudo indexar el CV: {e}"));
        }
        emit(json!({ "kind": "log", "line": "✓ CV indexado en NotebookLM" }));
        emit(json!({ "kind": "progress", "value": 1.0 }));
    });

    Ok(true) // backend present → UI listens for events instead of simulating
}
