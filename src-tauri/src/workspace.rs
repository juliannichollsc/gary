// GARY — installed-app workspace bootstrap.
// A dev checkout runs with CWD = the repo, so the spawned CLI + engines find `.claude/`, `docs/`,
// `engines/`, templates, etc. An INSTALLED build (the .exe) has no repo: the context is bundled as an
// app resource (`context/`, staged by scripts/bundle-context.mjs). On first run we copy that context
// into a WRITABLE per-user workspace (Program Files is read-only, and GARY must write offers-master.md,
// generated configs, output/, CVs…), then point every `project_root()` consumer at it via GARY_ROOT.
//
// In `tauri dev` the bundled `context/` resource is absent → repo-root behavior is preserved; if a
// workspace already exists (left by an earlier build), dev keeps using it for the user's data but refreshes
// its product code from the repo on every launch (see sync_dev_workspace). User data in the workspace is never clobbered on update: only the product dirs
// (.claude/docs/engines/templates) are refreshed when the app version changes.
use std::path::Path;
use tauri::Manager;

fn copy_dir_all(src: &Path, dst: &Path, overwrite: bool) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&from, &to, overwrite)?;
        } else if overwrite || !to.exists() {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

// Product dirs that carry NO user edits → safe to refresh wholesale on version bump.
// `node_modules` = las deps de runtime de los engines (playwright), staged por bundle-context.mjs.
const PRODUCT_DIRS: [&str; 5] = [".claude", "docs", "engines", "templates", "node_modules"];

// Product files that live OUTSIDE the product dirs: the agent entry docs at the root, and the `*.example`
// templates sitting next to user data in data/ and config/ (only the templates — never the user's files).
fn copy_examples(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !src.is_dir() { return Ok(()); }
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_examples(&from, &to)?;
        } else if from.extension().map(|e| e == "example").unwrap_or(false) {
            std::fs::create_dir_all(dst)?;
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

// `tauri dev` after a previous `tauri build`: a real staged `context/` is left in target/, so the dev app
// roots at the per-user workspace — where the user's hunt data now lives — but that workspace's product code
// is a STALE build snapshot (same version → never refreshed), so repo edits to engines/skills never show up.
// In debug builds, refresh the workspace's product code from the REPO on every launch (user data untouched;
// node_modules kept — the workspace has its own runtime deps). No workspace yet → plain repo-root dev.
fn sync_dev_workspace(repo: &Path, ws: &Path) {
    for d in [".claude", "docs", "engines", "templates"] {
        let (s, t) = (repo.join(d), ws.join(d));
        if s.exists() {
            let _ = std::fs::remove_dir_all(&t);
            let _ = copy_dir_all(&s, &t, true);
        }
    }
    for f in ["AGENTS.md", "CLAUDE.md"] {
        let _ = std::fs::copy(repo.join(f), ws.join(f));
    }
    for d in ["data", "config"] {
        let _ = copy_examples(&repo.join(d), &ws.join(d));
    }
}

pub fn bootstrap(app: &tauri::App) {
    if cfg!(debug_assertions) {
        let Ok(ws) = app.path().app_data_dir().map(|d| d.join("workspace")) else { return };
        if ws.join(".gary-version").exists() {
            sync_dev_workspace(&crate::settings::project_root(), &ws);
            std::env::set_var("GARY_ROOT", &ws);
        }
        return;
    }
    // Bundled context present? (absent in `tauri dev` → keep repo-root behavior)
    let ctx = match app.path().resource_dir() {
        Ok(d) => d.join("context"),
        Err(_) => return,
    };
    // An empty placeholder (scripts/ensure-context.mjs, for `tauri dev`) has no `.claude/` → not a
    // real staged context → keep repo-root behavior.
    if !ctx.join(".claude").exists() {
        return;
    }
    let ws = match app.path().app_data_dir() {
        Ok(d) => d.join("workspace"),
        Err(_) => return,
    };

    let version = app.package_info().version.to_string();
    let marker = ws.join(".gary-version");
    let installed = std::fs::read_to_string(&marker).unwrap_or_default();
    let fresh = !ws.exists();
    let updated = installed.trim() != version;

    if fresh {
        let _ = copy_dir_all(&ctx, &ws, true);
    } else if updated {
        // Refresh product code without touching the user's hunt data / generated files.
        for d in PRODUCT_DIRS {
            let (s, t) = (ctx.join(d), ws.join(d));
            if s.exists() {
                let _ = std::fs::remove_dir_all(&t);
                let _ = copy_dir_all(&s, &t, true);
            }
        }
        // Add any newly-shipped files without overwriting existing (user-owned) ones.
        let _ = copy_dir_all(&ctx, &ws, false);
    }
    if fresh || updated {
        let _ = std::fs::create_dir_all(&ws);
        let _ = std::fs::write(&marker, &version);
    }

    // Every project_root() reader honors GARY_ROOT first → the whole app now roots at the workspace.
    std::env::set_var("GARY_ROOT", &ws);
}
