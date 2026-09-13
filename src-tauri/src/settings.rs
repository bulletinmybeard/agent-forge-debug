use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "settings.json";
const DEFAULT_BASE_URL: &str = "";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub base_url: String,
    pub api_key: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            base_url: DEFAULT_BASE_URL.into(),
            api_key: String::new(),
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .context("app config dir")?;
    fs::create_dir_all(&dir).ok();
    Ok(dir.join(FILE_NAME))
}

pub fn load_settings(app: &AppHandle) -> Result<AppSettings> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let raw = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    let mut settings: AppSettings =
        serde_json::from_str(&raw).unwrap_or_else(|_| AppSettings::default());
    if settings.base_url.trim().is_empty() {
        settings.base_url = DEFAULT_BASE_URL.into();
    }
    settings.base_url = settings.base_url.trim().trim_end_matches('/').to_string();
    Ok(settings)
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<()> {
    let path = settings_path(app)?;
    let raw = serde_json::to_string_pretty(settings)?;
    fs::write(&path, raw).with_context(|| format!("write {}", path.display()))?;
    Ok(())
}
