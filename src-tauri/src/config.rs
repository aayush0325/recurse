use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Persisted user configuration at `~/.recurse/config.json`.
/// Only fields the user sets explicitly are written; everything else is
/// preserved across updates.
#[derive(Default, Clone, Serialize, Deserialize)]
pub struct ConfigFile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub openrouter_api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
}

fn config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "could not determine home directory".to_string())?;
    Ok(home.join(".recurse").join("config.json"))
}

/// Load the config file; returns an empty config if the file is missing or
/// unreadable (never errors — config is best-effort).
pub fn load() -> ConfigFile {
    config_path()
        .ok()
        .and_then(|p| fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write(cfg: &ConfigFile) -> Result<(), String> {
    let p = config_path()?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let s = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&p, s).map_err(|e| e.to_string())?;
    Ok(())
}

fn update<F>(f: F) -> Result<(), String>
where
    F: FnOnce(&mut ConfigFile),
{
    let mut cfg = load();
    f(&mut cfg);
    write(&cfg)
}

pub fn set_api_key(key: Option<String>) -> Result<(), String> {
    update(|c| c.openrouter_api_key = key)
}

pub fn set_model(model: String) -> Result<(), String> {
    update(|c| c.model = Some(model))
}
