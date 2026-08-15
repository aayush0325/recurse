use std::fs;
use std::path::PathBuf;

use crate::project;

/// Per-project agent memory. Findings are stored as markdown files under
/// `~/.recurse/<project>/memory/<key>.md` and injected back into the agent's
/// system prompt on subsequent sessions, so knowledge survives reopen.
///
/// `project` is the current project name (or a default when no project is
/// active).

const DEFAULT_PROJECT: &str = "default";

fn memory_dir(project: &str) -> Result<PathBuf, String> {
    Ok(project::project_dir(project)?.join("memory"))
}

/// Sanitize a memory key into a safe single file-name component.
fn sanitize_key(key: &str) -> String {
    let slug: String = key
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let slug = slug.trim_matches('_').to_string();
    if slug.is_empty() {
        "note".to_string()
    } else {
        slug
    }
}

fn key_path(project: &str, key: &str) -> Result<PathBuf, String> {
    Ok(memory_dir(project)?.join(format!("{}.md", sanitize_key(key))))
}

fn effective_project(project: Option<&str>) -> &str {
    project.unwrap_or(DEFAULT_PROJECT)
}

pub fn save(project: Option<&str>, key: &str, value: &str) -> Result<(), String> {
    let project = effective_project(project);
    let path = key_path(project, key)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = format!("# {key}\n\n{value}\n");
    fs::write(&path, content).map_err(|e| e.to_string())
}

pub fn load(project: Option<&str>, key: &str) -> Result<String, String> {
    let project = effective_project(project);
    let path = key_path(project, key)?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

pub fn remove(project: Option<&str>, key: &str) -> Result<(), String> {
    let project = effective_project(project);
    let path = key_path(project, key)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// List memory keys (file stems, without `.md`).
pub fn list(project: Option<&str>) -> Result<Vec<String>, String> {
    let project = effective_project(project);
    let dir = memory_dir(project)?;
    let mut out = Vec::new();
    if dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "md").unwrap_or(false) {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        out.push(stem.to_string());
                    }
                }
            }
        }
    }
    out.sort();
    Ok(out)
}

/// Concatenated memory, used to seed the system prompt on session start.
pub fn summary(project: Option<&str>) -> String {
    let keys = list(project).unwrap_or_default();
    let mut out = String::new();
    for key in keys {
        if let Ok(content) = load(project, &key) {
            out.push_str(&content);
            out.push('\n');
        }
    }
    out
}

fn history_path(project: Option<&str>) -> Result<PathBuf, String> {
    Ok(project::project_dir(effective_project(project))?
        .join("history")
        .join("chat.json"))
}

/// Persist the serialized conversation history for a project.
pub fn save_history(project: Option<&str>, json: &str) -> Result<(), String> {
    let path = history_path(project)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// Load a previously persisted conversation history, if any.
pub fn load_history(project: Option<&str>) -> Option<String> {
    let path = history_path(project).ok()?;
    fs::read_to_string(path).ok()
}

/// Remove a project's persisted conversation history.
pub fn clear_history(project: Option<&str>) {
    if let Ok(path) = history_path(project) {
        let _ = fs::remove_file(path);
    }
}
