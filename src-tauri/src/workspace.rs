// GARY — installed-app workspace bootstrap.
// A dev checkout runs with CWD = the repo, so the spawned CLI + engines find `.claude/`, `docs/`,
// `engines/`, templates, etc. An INSTALLED build (the .exe) has no repo: the context is bundled as an
// app resource (`context/`, staged by scripts/bundle-context.mjs). On first run we copy that context
// into a WRITABLE per-user workspace (Program Files is read-only, and GARY must write offers-master.md,
// generated configs, output/, CVs…), then point every `project_root()` consumer at it via GARY_ROOT.
//
// In `tauri dev` the bundled `context/` resource is absent → bootstrap is a no-op → repo-root behavior
// is preserved. User data in the workspace is never clobbered on update: only the product dirs
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

pub fn bootstrap(app: &tauri::App) {
    // Bundled context present? (absent in `tauri dev` → keep repo-root behavior)
    let ctx = match app.path().resource_dir() {
        Ok(d) => d.join("context"),
        Err(_) => return,
    };
    if !ctx.exists() {
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
