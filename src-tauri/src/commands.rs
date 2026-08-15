use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::agent::{self, ModelInfo};
use crate::config;
use crate::engine;
use crate::project::{self, Project};
use crate::session::R2Session;
use crate::AppState;

fn session<'a>(
    state: &'a State<'_, AppState>,
) -> Result<std::sync::MutexGuard<'a, Option<R2Session>>, String> {
    state
        .session
        .lock()
        .map_err(|e| format!("session lock poisoned: {e}"))
}

fn with_sess<'a>(
    guard: &'a std::sync::MutexGuard<'a, Option<R2Session>>,
) -> Result<&'a R2Session, String> {
    guard.as_ref().ok_or_else(|| "no binary loaded".into())
}

#[tauri::command]
pub fn open_binary(path: String, state: State<'_, AppState>) -> Result<Value, String> {
    eprintln!("[recurse] open_binary: {path}");
    let mut guard = session(&state)?;
    let sess = R2Session::open(path)?;
    let summary = engine::summary(&sess);
    eprintln!(
        "[recurse] open_binary: funcs={} strings={}",
        summary["function_count"], summary["string_count"]
    );
    *guard = Some(sess);
    Ok(summary)
}

#[tauri::command]
pub fn analyze(state: State<'_, AppState>) -> Result<(), String> {
    eprintln!("[recurse] analyze: starting `aaa`");
    let guard = session(&state)?;
    with_sess(&guard)?.analyze()?;
    eprintln!("[recurse] analyze: done");
    Ok(())
}

#[tauri::command]
pub fn close_binary(state: State<'_, AppState>) -> Result<(), String> {
    session(&state)?.take();
    *state
        .project
        .lock()
        .map_err(|e| format!("project lock poisoned: {e}"))? = None;
    Ok(())
}

#[tauri::command]
pub fn binary_info(state: State<'_, AppState>) -> Result<Value, String> {
    let guard = session(&state)?;
    Ok(engine::info(with_sess(&guard)?))
}

#[tauri::command]
pub fn functions(state: State<'_, AppState>) -> Result<Value, String> {
    let guard = session(&state)?;
    let v = engine::functions(with_sess(&guard)?)?;
    eprintln!(
        "[recurse] functions: {}",
        v.as_array().map(|a| a.len()).unwrap_or(0)
    );
    Ok(v)
}

#[tauri::command]
pub fn disassemble(addr: u64, count: u64, state: State<'_, AppState>) -> Result<Value, String> {
    let guard = session(&state)?;
    engine::disassemble(with_sess(&guard)?, addr, count)
}

#[tauri::command]
pub fn function_at(addr: u64, state: State<'_, AppState>) -> Result<Value, String> {
    let guard = session(&state)?;
    engine::function_at(with_sess(&guard)?, addr)
}

#[tauri::command]
pub fn function_disasm(addr: u64, state: State<'_, AppState>) -> Result<Value, String> {
    let guard = session(&state)?;
    engine::function_disasm(with_sess(&guard)?, addr)
}

#[tauri::command]
pub fn strings(state: State<'_, AppState>) -> Result<Value, String> {
    let guard = session(&state)?;
    let v = engine::strings(with_sess(&guard)?)?;
    eprintln!(
        "[recurse] strings: {}",
        v.as_array().map(|a| a.len()).unwrap_or(0)
    );
    Ok(v)
}

#[tauri::command]
pub fn imports(state: State<'_, AppState>) -> Result<Value, String> {
    let guard = session(&state)?;
    let v = engine::imports(with_sess(&guard)?)?;
    eprintln!(
        "[recurse] imports: {}",
        v.as_array().map(|a| a.len()).unwrap_or(0)
    );
    Ok(v)
}

#[tauri::command]
pub fn xrefs_to(addr: u64, state: State<'_, AppState>) -> Result<Value, String> {
    let guard = session(&state)?;
    engine::xrefs_to(with_sess(&guard)?, addr)
}

#[tauri::command]
pub fn decompile(addr: u64, state: State<'_, AppState>) -> Result<Value, String> {
    let guard = session(&state)?;
    engine::decompile(with_sess(&guard)?, addr)
}

#[tauri::command]
pub fn raw(cmd: String, state: State<'_, AppState>) -> Result<Value, String> {
    let guard = session(&state)?;
    engine::raw(with_sess(&guard)?, &cmd)
}

/// Zoom the whole window (native webview zoom, like VS Code's Ctrl +/-).
#[tauri::command]
pub fn set_zoom(scale: f64, window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .set_zoom(scale)
        .map_err(|e| format!("set_zoom failed: {e}"))
}

#[tauri::command]
pub fn agent_chat(message: String, state: State<'_, AppState>) -> Result<String, String> {
    // Capture binary context, then drop the session lock so the (potentially
    // slow) LLM call never blocks r2 commands.
    let context = {
        let guard = session(&state)?;
        let sess = with_sess(&guard)?;
        (sess.path.to_string_lossy().to_string(), engine::info(sess))
    };
    let config = state
        .llm
        .lock()
        .map_err(|e| format!("llm lock poisoned: {e}"))?
        .clone();
    let mut agent = state
        .agent
        .lock()
        .map_err(|e| format!("agent lock poisoned: {e}"))?;
    agent.chat(&config, &context.0, &context.1, &message)
}

#[tauri::command]
pub fn agent_reset(state: State<'_, AppState>) -> Result<(), String> {
    let mut agent = state
        .agent
        .lock()
        .map_err(|e| format!("agent lock poisoned: {e}"))?;
    agent.reset();
    Ok(())
}

#[derive(Serialize)]
pub struct LlmStatus {
    pub provider: String,
    pub configured: bool,
    pub model: String,
}

#[tauri::command]
pub fn llm_status(state: State<'_, AppState>) -> Result<LlmStatus, String> {
    let config = state
        .llm
        .lock()
        .map_err(|e| format!("llm lock poisoned: {e}"))?;
    Ok(LlmStatus {
        provider: "openrouter".into(),
        configured: config
            .api_key
            .as_ref()
            .map(|k| !k.is_empty())
            .unwrap_or(false),
        model: config.model.clone(),
    })
}

#[tauri::command]
pub fn set_model(id: String, state: State<'_, AppState>) -> Result<(), String> {
    config::set_model(id.clone())?;
    let mut config = state
        .llm
        .lock()
        .map_err(|e| format!("llm lock poisoned: {e}"))?;
    config.model = id;
    Ok(())
}

#[tauri::command]
pub fn save_api_key(key: String, state: State<'_, AppState>) -> Result<(), String> {
    let trimmed = key.trim();
    let key_opt = if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    };
    config::set_api_key(key_opt.clone())?;
    let mut config = state
        .llm
        .lock()
        .map_err(|e| format!("llm lock poisoned: {e}"))?;
    config.api_key = key_opt;
    Ok(())
}

#[tauri::command]
pub fn list_models(refresh: bool, state: State<'_, AppState>) -> Result<Vec<ModelInfo>, String> {
    {
        let guard = state
            .models
            .lock()
            .map_err(|e| format!("models lock poisoned: {e}"))?;
        if !refresh {
            if let Some(cached) = guard.as_ref() {
                return Ok(cached.clone());
            }
        }
    }
    let models = agent::fetch_models()?;
    let mut guard = state
        .models
        .lock()
        .map_err(|e| format!("models lock poisoned: {e}"))?;
    *guard = Some(models.clone());
    Ok(models)
}

#[tauri::command]
pub fn list_projects() -> Result<Vec<Project>, String> {
    project::list()
}

#[tauri::command]
pub fn create_project(
    name: String,
    binary_path: String,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    let p = project::create(&name, &binary_path)?;
    *state
        .project
        .lock()
        .map_err(|e| format!("project lock poisoned: {e}"))? = Some(p.clone());
    Ok(p)
}

#[tauri::command]
pub fn open_project(name: String, state: State<'_, AppState>) -> Result<Project, String> {
    let p = project::get(&name)?;
    project::touch(&name)?;
    *state
        .project
        .lock()
        .map_err(|e| format!("project lock poisoned: {e}"))? = Some(p.clone());
    Ok(p)
}

#[tauri::command]
pub fn delete_project(name: String) -> Result<(), String> {
    project::remove(&name)
}

#[tauri::command]
pub fn project_read_file(name: String, path: String) -> Result<String, String> {
    project::read_file(&name, &path)
}

#[tauri::command]
pub fn project_write_file(name: String, path: String, content: String) -> Result<(), String> {
    project::write_file(&name, &path, &content)
}

#[tauri::command]
pub fn project_list_files(name: String) -> Result<Vec<String>, String> {
    project::list_files(&name)
}
