mod settings;

use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;

use crate::settings::{load_settings, save_settings, AppSettings};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

struct AppState {
    settings: Mutex<AppSettings>,
}

fn normalize_base(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())
}

async fn get_json(
    settings: &AppSettings,
    path: &str,
) -> Result<serde_json::Value, String> {
    let base = normalize_base(&settings.base_url);
    if base.is_empty() {
        return Err("set the AgentForge URL in Settings".into());
    }
    let url = format!("{base}{path}");
    let mut req = client()?.get(&url);
    let key = settings.api_key.trim();
    if !key.is_empty() {
        req = req.bearer_auth(key);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if status.as_u16() == 404 {
        return Err("session not found".into());
    }
    if !status.is_success() {
        let detail = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| {
                v.get("detail")
                    .and_then(|d| d.as_str())
                    .map(str::to_string)
            })
            .unwrap_or(body);
        return Err(format!("HTTP {} {detail}", status.as_u16()));
    }
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppState>) -> AppSettings {
    state.settings.lock().expect("settings lock").clone()
}

#[tauri::command]
fn set_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let next = AppSettings {
        base_url: normalize_base(&settings.base_url),
        api_key: settings.api_key.trim().to_string(),
    };
    save_settings(&app, &next).map_err(|e| e.to_string())?;
    *state.settings.lock().expect("settings lock") = next.clone();
    Ok(next)
}

#[tauri::command]
async fn list_sessions(
    state: tauri::State<'_, AppState>,
    source: Option<String>,
) -> Result<serde_json::Value, String> {
    let settings = state.settings.lock().expect("settings lock").clone();
    let source = source
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("all");
    get_json(&settings, &format!("/api/sessions?source={source}&limit=200")).await
}

#[tauri::command]
async fn get_debug_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    let settings = state.settings.lock().expect("settings lock").clone();
    let id = session_id.trim();
    if id.is_empty() {
        return Err("session id is required".into());
    }
    get_json(&settings, &format!("/api/debug/sessions/{id}")).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let settings = load_settings(app.handle()).unwrap_or_default();
            app.manage(AppState {
                settings: Mutex::new(settings),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_settings,
            list_sessions,
            get_debug_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgentForge Debug");
}
