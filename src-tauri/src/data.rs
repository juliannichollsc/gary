// GARY — deterministic data bridge (spec 07). Parses the LOCAL data files (offers + metrics) into the
// shapes the React views expect, and persists onboarding context. NO LLM, ~0 tokens. Offers/metrics live
// LOCAL; the user's candidate context (CV + Q&A) lives in NotebookLM (handled by the terminal agent).
use serde_json::{json, Value};
use tauri::Manager;

use crate::settings::project_root;

const SOURCES: [&str; 6] = ["LinkedIn", "Gmail", "Indeed", "GetOnBoard", "Himalayas", "Computrabajo"];

// Parse `data/metrics.md` "## Hunts" rows → { hunts: Hunt[] } (matches src/metrics.ts). Empty if no rows.
// Row: `- {date} — {model} — tokens={T} — total={N} — real={M} — LinkedIn:a, Gmail:b, …`
#[tauri::command]
pub fn read_metrics() -> Value {
    let text = std::fs::read_to_string(project_root().join("data").join("metrics.md")).unwrap_or_default();
    let mut hunts: Vec<Value> = vec![];
    let mut in_hunts = false;
    for line in text.lines() {
        let t = line.trim();
        if t.starts_with("## ") { in_hunts = t.eq_ignore_ascii_case("## hunts"); continue; }
        if !in_hunts || !t.starts_with("- ") { continue; }
        let parts: Vec<&str> = t.trim_start_matches("- ").split(" — ").map(|s| s.trim()).collect();
        if parts.len() < 6 { continue; }
        let num = |p: &str, pre: &str| p.strip_prefix(pre).and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
        let mut by = serde_json::Map::new();
        for s in SOURCES { by.insert(s.to_string(), json!(0)); }
        for kv in parts[5].split(',') {
            if let Some((k, v)) = kv.trim().split_once(':') {
                if let Ok(n) = v.trim().parse::<i64>() { by.insert(k.trim().to_string(), json!(n)); }
            }
        }
        hunts.push(json!({
            "date": parts[0], "model": parts[1],
            "tokens": num(parts[2], "tokens="), "total": num(parts[3], "total="), "real": num(parts[4], "real="),
            "bySource": Value::Object(by),
        }));
    }
    json!({ "hunts": hunts })
}

// Map any text (a URL host or a section header) to one of the 6 UI channels. Order matters so a
// "LinkedIn via Gmail alerts" header/URL resolves to LinkedIn (checked before Gmail). Returns None if
// nothing matches so the caller can fall back to the section header.
fn channel_of(s: &str) -> Option<&'static str> {
    let l = s.to_lowercase();
    if l.contains("computrabajo") { Some("Computrabajo") }
    else if l.contains("himalayas") { Some("Himalayas") }
    else if l.contains("getonbrd") || l.contains("getonboard") { Some("GetOnBoard") }
    else if l.contains("indeed") { Some("Indeed") }
    else if l.contains("linkedin") { Some("LinkedIn") }
    else if l.contains("gmail") { Some("Gmail") }
    // ATS = zero-token 16-provider scanner (engines/scan.mjs). Resolve by ATS host, or the `## CANAL ATS` header.
    else if l.contains("greenhouse.io") || l.contains("ashbyhq.com") || l.contains("lever.co")
         || l.contains("workable.com") || l.contains("smartrecruiters.com") || l.contains("recruitee.com")
         || l.contains("myworkdayjobs.com") || l.contains("workday") || l.contains("canal ats") { Some("ATS") }
    else { None }
}

// Parse `data/offers-master.md` → Offer[] (matches src/views/OffersView.tsx). Empty if skeleton.
//
// The file is SECTION-ORGANIZED (## CANAL X — LinkedIn/Computrabajo/Himalayas…), and rows do NOT carry a
// channel column. Real row shape (fields ` — `-separated, score sometimes absent, notes may contain ` — `):
//   - [ ] **{Company}** — {Role} — [{score 0–5}] — {url} — {notes…}   ([x]=applied, [~]=flag)
// So we resolve the channel from the row's URL host first (most reliable), falling back to the nearest
// `##`/`###` section header; score = the first numeric field before the URL (else 0); notes = everything
// after the URL. This tolerates the score-less Himalayas shortlist rows and em-dashes inside notes.
#[tauri::command]
pub fn read_offers() -> Value {
    let text = std::fs::read_to_string(project_root().join("data").join("offers-master.md")).unwrap_or_default();
    let mut offers: Vec<Value> = vec![];
    let mut section_channel: Option<&'static str> = None;
    for line in text.lines() {
        let t = line.trim();
        // Track the current channel from headers; a channel-less subheader (### B · APPLY) keeps the parent.
        if t.starts_with('#') { if let Some(c) = channel_of(t) { section_channel = Some(c); } continue; }
        if !t.starts_with("- [") { continue; }
        let status = if t.starts_with("- [x]") { "aplicada" } else if t.starts_with("- [~]") { "flag" } else { "pendiente" };
        let close = match t.find(']') { Some(i) => i + 1, None => continue };
        let parts: Vec<&str> = t[close..].split(" — ").map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        if parts.len() < 3 { continue; } // need at least company, role, url
        let company = parts[0].trim_matches('*').trim();
        if company.is_empty() { continue; }
        // Locate the URL; score = first numeric field before it; notes = everything after it.
        let url_idx = parts.iter().position(|p| p.starts_with("http")).unwrap_or(parts.len());
        let score = parts.get(2..url_idx).unwrap_or(&[]).iter()
            .find_map(|p| p.parse::<f64>().ok()).unwrap_or(0.0);
        let url = parts.get(url_idx).copied().unwrap_or("");
        let notes = parts.get(url_idx + 1..).map(|s| s.join(" — ")).unwrap_or_default();
        let channel = channel_of(url).or(section_channel).unwrap_or("");
        offers.push(json!({
            "id": format!("o{}", offers.len() + 1),
            "company": company,
            "role": parts.get(1).copied().unwrap_or(""),
            "score": score,
            "url": url,
            "channel": channel,
            "status": status,
            "meta": if notes.is_empty() { Value::Null } else { json!(notes) },
        }));
    }
    json!(offers)
}

// Parse the role/skill map the LM AGENT writes into `data/cv/base/gary-context.md` (buildContextMd in
// src/onboarding.ts is the template; the agent fills the `> _Pendiente…_` TODO blockquotes on the first
// chat run). The onboarding "Mapa de roles" reads this so it reflects what the agent mapped — candidate
// data stays in gary-context.md (the allowed local input area, ingested into NotebookLM), not in code.
// Returns { roles: [{id,label,stack[]}], softSkills: string[] }; empty arrays while still `Pendiente`.
// Acepta DOS formatos para la sección de roles (el agente LM tiende a escribir tablas ricas):
//   TABLA:   | Familia | Fit | Stack núcleo | Evidencia |   →  label = col "Familia", stack = col "Stack"
//   VIÑETA:  - **Frontend**: React, TypeScript, CSS         (compat con buildContextMd)
//   "## Skills blandas" → `- **Liderazgo técnico:** …` → chip "Liderazgo técnico" (sólo la etiqueta).
#[tauri::command]
pub fn read_role_map() -> Value {
    let text = std::fs::read_to_string(
        project_root().join("data").join("cv").join("base").join("gary-context.md"),
    ).unwrap_or_default();
    let mut roles: Vec<Value> = vec![];
    let mut soft: Vec<String> = vec![];
    let mut section = ""; // "roles" | "soft" | ""
    let mut stack_col: usize = 2; // índice de la columna "Stack" en la tabla de roles (default)
    for line in text.lines() {
        let t = line.trim();
        if t.starts_with("## ") {
            section = if t.contains("Familias de roles") { "roles" }
                      else if t.contains("blandas") { "soft" }
                      else { "" };
            continue;
        }
        // --- Formato TABLA markdown (lo que el agente LM escribe de forma natural) ---
        if section == "roles" && t.starts_with('|') {
            let cells: Vec<&str> = t.trim_matches('|').split('|').map(|c| c.trim()).collect();
            // Fila separadora `|---|---|` → saltar.
            if cells.iter().all(|c| !c.is_empty() && c.chars().all(|ch| ch == '-' || ch == ':')) {
                continue;
            }
            // Fila de encabezado → localizar la columna de "Stack" y saltar.
            if cells.iter().any(|c| c.to_lowercase().contains("familia")) {
                if let Some(i) = cells.iter().position(|c| c.to_lowercase().contains("stack")) {
                    stack_col = i;
                }
                continue;
            }
            // Fila de datos: label = primera celda, stack = celda "Stack".
            let label = cells.get(0).map(|c| c.trim_matches('*').trim()).unwrap_or("");
            if label.is_empty() { continue; }
            let stack: Vec<Value> = cells.get(stack_col).copied().unwrap_or("")
                .split(|c| c == ',' || c == ';' || c == '+')
                .map(|s| s.trim()).filter(|s| !s.is_empty() && *s != "—")
                .map(|s| json!(s)).collect();
            roles.push(json!({ "id": label.to_lowercase(), "label": label, "stack": stack }));
            continue;
        }
        if t.starts_with('>') || !t.starts_with("- ") { continue; } // TODO blockquote or non-item → skip
        let item = t.trim_start_matches("- ").trim();
        match section {
            "roles" => {
                // Formato VIÑETA (compat): `- **Label**: a, b, c`  (stack optional)
                if let Some((label, stack)) = item.split_once(':') {
                    let label = label.trim().trim_matches('*').trim();
                    if label.is_empty() { continue; }
                    let stack: Vec<Value> = stack.split(',')
                        .map(|s| s.trim()).filter(|s| !s.is_empty() && *s != "—")
                        .map(|s| json!(s)).collect();
                    roles.push(json!({ "id": label.to_lowercase(), "label": label, "stack": stack }));
                }
            }
            "soft" => {
                // Extrae SÓLO la etiqueta para el chip (descarta la descripción tras los dos puntos).
                let label = clean_soft_label(item);
                if !label.is_empty() && label != "—" { soft.push(label); }
            }
            _ => {}
        }
    }
    json!({ "roles": roles, "softSkills": soft })
}

// De una viñeta de soft-skill (`**Liderazgo técnico:** …` o `Comunicación: …`) extrae sólo la etiqueta
// corta para el chip, descartando la descripción que va tras los dos puntos.
fn clean_soft_label(item: &str) -> String {
    let s = item.trim();
    // `**Label:**` o `**Label**:` → contenido en negrita.
    if let Some(rest) = s.strip_prefix("**") {
        if let Some(end) = rest.find("**") {
            return rest[..end].trim().trim_end_matches(':').trim().to_string();
        }
    }
    // `Label: descripción` → lo previo a los dos puntos.
    if let Some((label, _)) = s.split_once(':') {
        return label.trim().trim_matches('*').trim().to_string();
    }
    s.trim_matches('*').trim().to_string()
}

// Onboarding context store (JSON in the app config dir). The React onboarding writes here; the terminal
// agent (notebooklm-ai-plugin) ingests it into NotebookLM and can report the created notebook id back.
fn onboarding_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("onboarding.json"))
}

#[tauri::command]
pub fn get_onboarding(app: tauri::AppHandle) -> Option<Value> {
    let path = onboarding_path(&app).ok()?;
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

#[tauri::command]
pub fn set_onboarding(app: tauri::AppHandle, onboarding: Value) -> Result<(), String> {
    let path = onboarding_path(&app)?;
    let json = serde_json::to_string_pretty(&onboarding).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}
