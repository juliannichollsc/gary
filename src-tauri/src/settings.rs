// GARY — settings store, OS keychain, and automation-browser control (spec 02).
// Non-secret prefs live in a JSON file under the app config dir; the API key lives ONLY in the OS
// keychain (never on disk). The browser is the dedicated debug Chrome for CDP sourcing/applying.
use std::path::{Path, PathBuf};
use std::process::{Child, Command};

use crate::proc::hide_console;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    // GARY NO guarda modelo/CLI ni API key (el chat es terminal libre). Solo: navegador + puerto + rendimiento.
    #[serde(default = "default_browser")]
    pub browser: String,          // navegador de automatización elegido (chrome/edge/brave/chromium)
    #[serde(default = "default_port")]
    pub browser_port: u16,
    #[serde(default = "default_perf")]
    pub performance: String,      // fuentes distintas en paralelo (very_low..very_high)
}
fn default_browser() -> String { "chrome".into() }
fn default_port() -> u16 { 9333 }
fn default_perf() -> String { "medium".into() }
impl Default for Settings {
    fn default() -> Self {
        Settings { browser: default_browser(), browser_port: default_port(), performance: default_perf() }
    }
}

#[derive(Default)]
pub struct BrowserState { pub child: Mutex<Option<Child>> }

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    let path = settings_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(Settings::default()), // first run
    }
}

#[tauri::command]
pub fn set_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

// --- API key in the OS keychain (service "gary", account "api-key-<cli>") ---
fn key_entry(cli: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("gary", &format!("api-key-{cli}")).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_api_key(cli: String, key: String) -> Result<bool, String> {
    key_entry(&cli)?.set_password(&key).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn has_api_key(cli: String) -> Result<bool, String> {
    match key_entry(&cli)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

// --- Automation browser (dedicated debug Chrome, isolated profile) ---
#[derive(Serialize)]
pub struct BrowserStatus { pub running: bool, pub port: u16 }

// Project root: the writable workspace in an installed build ($GARY_ROOT, set by workspace::bootstrap),
// else the parent of src-tauri in dev — engines/data/.claude live here.
pub fn project_root() -> PathBuf {
    if let Ok(r) = std::env::var("GARY_ROOT") {
        return PathBuf::from(r);
    }
    let cur = std::env::current_dir().unwrap_or_else(|_| ".".into());
    if cur.file_name().map(|n| n == "src-tauri").unwrap_or(false) {
        cur.parent().map(PathBuf::from).unwrap_or(cur)
    } else { cur }
}
fn engine_script() -> PathBuf { project_root().join("engines").join("start-chrome-debug.cmd") }

// Perfil dedicado y PERSISTENTE (las sesiones de login se conservan entre reinicios/días). Chrome usa
// el MISMO dir que career-ops (`%USERPROFILE%\chrome-automation-profile`) para reutilizar los logins ya
// establecidos; los demás navegadores usan su propio dir hermano (perfiles no compatibles entre sí).
fn browser_profile_dir(browser: &str) -> PathBuf {
    let base = std::env::var("USERPROFILE").ok().map(PathBuf::from)
        .or_else(|| std::env::var("HOME").ok().map(PathBuf::from))
        .unwrap_or_else(std::env::temp_dir);
    base.join(format!("{browser}-automation-profile"))
}

// Resuelve el ejecutable del navegador elegido. Windows: rutas de instalación conocidas (solo devuelve
// las que existen). Otros SO: nombre del comando (se resuelve en PATH al lanzar).
fn resolve_browser_exe(browser: &str) -> Option<PathBuf> {
    if cfg!(windows) {
        let pf = std::env::var("ProgramFiles").ok();
        let pf86 = std::env::var("ProgramFiles(x86)").ok();
        let lad = std::env::var("LOCALAPPDATA").ok();
        let j = |base: &Option<String>, rest: &str| base.as_ref().map(|p| Path::new(p).join(rest));
        let cands: Vec<Option<PathBuf>> = match browser {
            "chrome" => vec![
                j(&pf, r"Google\Chrome\Application\chrome.exe"),
                j(&pf86, r"Google\Chrome\Application\chrome.exe"),
                j(&lad, r"Google\Chrome\Application\chrome.exe"),
            ],
            "edge" => vec![
                j(&pf86, r"Microsoft\Edge\Application\msedge.exe"),
                j(&pf, r"Microsoft\Edge\Application\msedge.exe"),
            ],
            "brave" => vec![
                j(&pf, r"BraveSoftware\Brave-Browser\Application\brave.exe"),
                j(&pf86, r"BraveSoftware\Brave-Browser\Application\brave.exe"),
                j(&lad, r"BraveSoftware\Brave-Browser\Application\brave.exe"),
            ],
            "chromium" => vec![
                j(&lad, r"Chromium\Application\chrome.exe"),
                j(&pf, r"Chromium\Application\chrome.exe"),
            ],
            _ => vec![],
        };
        cands.into_iter().flatten().find(|p| p.exists())
    } else {
        let name = match browser {
            "chrome" => "google-chrome",
            "edge" => "microsoft-edge",
            "brave" => "brave-browser",
            "chromium" => "chromium",
            _ => return None,
        };
        Some(PathBuf::from(name))
    }
}

// Lanza el navegador elegido con el puerto de depuración (CDP) y perfil aislado. Si `url` viene, abre esa
// URL: como comparte user-data-dir, abre una pestaña en la instancia ya corriendo (single-instance).
fn launch_browser(browser: &str, port: u16, url: Option<&str>) -> Result<Child, String> {
    let exe = resolve_browser_exe(browser)
        .ok_or_else(|| format!("no encontré el navegador '{browser}' instalado"))?;
    let profile = browser_profile_dir(browser);
    let _ = std::fs::create_dir_all(&profile);
    // Mismos flags que career-ops: CDP estable (remote-allow-origins), perfil persistente, sin throttling
    // en segundo plano (websocket estable), sin first-run. NO hacemos taskkill del navegador personal.
    let mut cmd = Command::new(exe);
    cmd.arg(format!("--remote-debugging-port={port}"))
        .arg("--remote-allow-origins=*")
        .arg(format!("--user-data-dir={}", profile.display()))
        .arg("--disable-background-timer-throttling")
        .arg("--disable-backgrounding-occluded-windows")
        .arg("--disable-renderer-backgrounding")
        .arg("--no-first-run")
        .arg("--no-default-browser-check");
    if let Some(u) = url { cmd.arg(u); }
    cmd.spawn().map_err(|e| e.to_string())
}

// ¿El navegador de automatización está escuchando en el puerto CDP? Es la fuente de verdad de "corriendo":
// si el usuario cierra la ventana (o el proceso hace hand-off a otra instancia), el puerto se cierra.
fn cdp_up(port: u16) -> bool {
    use std::net::{TcpStream, SocketAddr, Ipv4Addr, IpAddr};
    use std::time::Duration;
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

#[tauri::command]
pub fn browser_status(state: State<BrowserState>, app: tauri::AppHandle) -> BrowserStatus {
    let port = get_settings(app).map(|s| s.browser_port).unwrap_or(9333);
    // Cosecha el hijo si ya salió, pero el estado real lo da el puerto CDP (maneja el cierre manual).
    {
        let mut guard = state.child.lock().unwrap();
        if let Some(c) = guard.as_mut() {
            if matches!(c.try_wait(), Ok(Some(_))) { *guard = None; }
        }
    }
    BrowserStatus { running: cdp_up(port), port }
}

#[tauri::command]
pub fn start_browser(state: State<BrowserState>, app: tauri::AppHandle, browser: Option<String>, port: u16) -> Result<BrowserStatus, String> {
    let mut guard = state.child.lock().unwrap();
    if guard.as_mut().map(|c| matches!(c.try_wait(), Ok(None))).unwrap_or(false) {
        return Ok(BrowserStatus { running: true, port }); // already running
    }
    // Navegador elegido (del arg o de settings); fallback "chrome".
    let browser = browser
        .or_else(|| get_settings(app).ok().map(|s| s.browser))
        .unwrap_or_else(|| "chrome".into());
    let child = match launch_browser(&browser, port, None) {
        Ok(c) => c,
        Err(e) => {
            // Fallback solo para chrome: el .cmd legacy si el exe no se resolvió.
            let script = engine_script();
            if browser == "chrome" && script.exists() {
                hide_console(&mut Command::new("cmd")).arg("/C").arg(&script)
                    .env("GARY_BROWSER_PORT", port.to_string())
                    .spawn().map_err(|e| e.to_string())?
            } else {
                return Err(e);
            }
        }
    };
    *guard = Some(child);
    Ok(BrowserStatus { running: true, port })
}

// Navegadores instalados (para el selector de Ajustes).
#[tauri::command]
pub fn list_browsers() -> Vec<String> {
    ["chrome", "edge", "brave", "chromium"].iter()
        .filter(|b| resolve_browser_exe(b).is_some())
        .map(|s| s.to_string())
        .collect()
}

// Abre una URL en el navegador de automatización (para login manual del sitio). Comparte el perfil, así
// abre pestaña en la instancia ya corriendo.
#[tauri::command]
pub fn open_in_browser(app: tauri::AppHandle, url: String) -> Result<bool, String> {
    let s = get_settings(app).unwrap_or_default();
    launch_browser(&s.browser, s.browser_port, Some(&url)).map(|_| true)
}

// Verifica si la sesión del sitio está iniciada, vía el bot determinista (0 tokens) sobre CDP.
// `inspect-session-site.mjs <url>` abre la URL en el navegador debug e imprime "logged in: likely YES"
// cuando NO ve un muro de login. **async + spawn_blocking**: la espera de node/Playwright (20–60s) corre
// FUERA del hilo principal → la UI NO se congela (verificación silenciosa). Best-effort: sin engine → false.
#[tauri::command]
pub async fn check_login(url: String) -> Result<bool, String> {
    let root = project_root();
    // Prefer the lightweight check (attaches to the open tab, one DOM read). Fallback to the heavier
    // inspect-session-site.mjs if the light engine isn't present.
    let light = root.join("engines").join("check-login.mjs");
    let script = if light.exists() { light } else { root.join("engines").join("inspect-session-site.mjs") };
    if !script.exists() { return Ok(false); }
    let out = tauri::async_runtime::spawn_blocking(move || {
        hide_console(&mut Command::new("node")).arg(&script).arg(&url).current_dir(&root).output()
    }).await.map_err(|e| e.to_string())?;
    Ok(matches!(out, Ok(o) if String::from_utf8_lossy(&o.stdout).contains("logged in: likely YES")))
}

// Abre un archivo/ruta local (Ver PDF / Ver CV) o una URL (Ver oferta) con la app por defecto del SO.
// Rutas relativas → raíz del proyecto; URLs http(s) → navegador por defecto.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let is_url = path.starts_with("http://") || path.starts_with("https://");
    let full_s = if is_url {
        path.clone()
    } else {
        let p = Path::new(&path);
        let full = if p.is_absolute() { p.to_path_buf() } else { project_root().join(p) };
        full.to_string_lossy().to_string()
    };
    let spawned = if cfg!(windows) {
        hide_console(&mut Command::new("cmd")).args(["/C", "start", "", &full_s]).spawn()
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(&full_s).spawn()
    } else {
        Command::new("xdg-open").arg(&full_s).spawn()
    };
    spawned.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_browser(state: State<BrowserState>, app: tauri::AppHandle) -> Result<BrowserStatus, String> {
    let port = get_settings(app).map(|s| s.browser_port).unwrap_or(9333);
    if let Some(mut c) = state.child.lock().unwrap().take() {
        let _ = c.kill();
        let _ = c.wait();
    }
    Ok(BrowserStatus { running: false, port })
}
