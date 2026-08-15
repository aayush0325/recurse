use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::agent::{self, AgentEvent, ModelInfo, ToolCall};
use crate::config;
use crate::debugger;
use crate::engine;
use crate::memory;
use crate::project::{self, Project};
use crate::session::R2Session;
use crate::tools::ToolContext;
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

fn current_project(state: &State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state
        .project
        .lock()
        .map_err(|e| format!("project lock poisoned: {e}"))?
        .as_ref()
        .map(|p| p.name.clone()))
}

fn persist_history(project: Option<&str>, messages: &[agent::ChatMessage]) {
    if let Ok(json) = serde_json::to_string(messages) {
        let _ = memory::save_history(project, &json);
    }
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
    restore_agent(&state)?;
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
    {
        let mut debug = state
            .debug
            .lock()
            .map_err(|e| format!("debug lock poisoned: {e}"))?;
        debug.take();
    }
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

/// Start an agent turn. Returns immediately with a run id; progress streams
/// over the `agent-event` channel. The worker thread owns the LLM streaming
/// and tool loop so the UI (and r2 commands) never block.
#[tauri::command]
pub async fn agent_chat(
    message: String,
    on_event: tauri::ipc::Channel<AgentEvent>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (path, info) = {
        let guard = state
            .session
            .lock()
            .map_err(|e| format!("session lock poisoned: {e}"))?;
        let sess = guard
            .as_ref()
            .ok_or_else(|| "no binary loaded".to_string())?;
        (sess.path.to_string_lossy().to_string(), engine::info(sess))
    };
    let config = state
        .llm
        .lock()
        .map_err(|e| format!("llm lock poisoned: {e}"))?
        .clone();
    let agent = state.agent.clone();
    let session = state.session.clone();
    let debug = state.debug.clone();
    let project = current_project(&state)?;
    let project_for_history = project.clone();

    // The blocking agent loop (LLM streaming + r2 tool calls) runs on the
    // Tauri blocking pool so it never blocks the IPC / main thread. Tokens
    // stream back over the per-request channel.
    tauri::async_runtime::spawn_blocking(move || {
        let tools = crate::tools::schema();
        let memory = memory::summary(project.as_deref());
        let ctx = ToolContext {
            session,
            debug,
            project,
        };

        // Wrapped so any panic still surfaces an Error event to the frontend
        // (the chat would otherwise hang on the pending indicator forever).
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(
            || -> Result<Vec<agent::ChatMessage>, String> {
                let mut guard = agent
                    .lock()
                    .map_err(|_| "agent lock poisoned".to_string())?;
                let mut exec = |tc: &ToolCall| crate::tools::execute(tc, &ctx);
                let mut emit = |ev: AgentEvent| {
                    let _ = on_event.send(ev);
                };
                guard
                    .run(
                        "run",
                        &config,
                        &path,
                        &info,
                        &memory,
                        &message,
                        &tools,
                        &mut exec,
                        &mut emit,
                    )
                    .map(|_| guard.messages().to_vec())
            }),
        );

        match outcome {
            Ok(Ok(messages)) => {
                persist_history(project_for_history.as_deref(), &messages);
            }
            Ok(Err(e)) => {
                let _ = on_event.send(AgentEvent::Error {
                    run_id: "run".into(),
                    message: e,
                });
            }
            Err(_) => {
                let _ = on_event.send(AgentEvent::Error {
                    run_id: "run".into(),
                    message: "agent worker panicked".into(),
                });
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn agent_reset(state: State<'_, AppState>) -> Result<(), String> {
    let mut agent = state
        .agent
        .lock()
        .map_err(|e| format!("agent lock poisoned: {e}"))?;
    agent.reset();
    let project = current_project(&state)?;
    memory::clear_history(project.as_deref());
    Ok(())
}

/// Load persisted conversation history into the agent (called on binary open)
/// and return the restored messages.
#[tauri::command]
pub fn agent_history(state: State<'_, AppState>) -> Result<Vec<agent::ChatMessage>, String> {
    restore_agent(&state)
}

fn restore_agent(state: &State<'_, AppState>) -> Result<Vec<agent::ChatMessage>, String> {
    let project = current_project(state)?;
    let mut agent = state
        .agent
        .lock()
        .map_err(|e| format!("agent lock poisoned: {e}"))?;
    if let Some(json) = memory::load_history(project.as_deref()) {
        if let Ok(msgs) = serde_json::from_str::<Vec<agent::ChatMessage>>(&json) {
            agent.load(msgs);
        }
    }
    Ok(agent.messages().to_vec())
}

/// Start a debug session for the currently loaded binary (`r2 -d`).
#[tauri::command]
pub fn debug_start(state: State<'_, AppState>) -> Result<(), String> {
    let path = {
        let guard = session(&state)?;
        with_sess(&guard)?.path.clone()
    };
    let mut debug = state
        .debug
        .lock()
        .map_err(|e| format!("debug lock poisoned: {e}"))?;
    if debug.is_none() {
        let sess = R2Session::open_with_args(path, debugger::SPAWN_ARGS.to_vec())?;
        *debug = Some(sess);
    }
    Ok(())
}

/// Pass a raw r2 debugger command through to the debug session.
#[tauri::command]
pub fn debug_command(cmd: String, state: State<'_, AppState>) -> Result<Value, String> {
    let debug = state
        .debug
        .lock()
        .map_err(|e| format!("debug lock poisoned: {e}"))?;
    let sess = debug.as_ref().ok_or_else(|| "debugger not started".to_string())?;
    sess.run(&cmd)
}

#[tauri::command]
pub fn debug_stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut debug = state
        .debug
        .lock()
        .map_err(|e| format!("debug lock poisoned: {e}"))?;
    if let Some(sess) = debug.as_ref() {
        let _ = debugger::kill(sess);
    }
    debug.take();
    Ok(())
}

#[tauri::command]
pub fn debug_registers(state: State<'_, AppState>) -> Result<Value, String> {
    let debug = state
        .debug
        .lock()
        .map_err(|e| format!("debug lock poisoned: {e}"))?;
    let sess = debug.as_ref().ok_or_else(|| "debugger not started".to_string())?;
    debugger::registers(sess)
}

#[tauri::command]
pub fn debug_disassemble(count: u64, state: State<'_, AppState>) -> Result<Value, String> {
    let debug = state
        .debug
        .lock()
        .map_err(|e| format!("debug lock poisoned: {e}"))?;
    let sess = debug.as_ref().ok_or_else(|| "debugger not started".to_string())?;
    debugger::current_disasm(sess, count)
}

#[tauri::command]
pub fn debug_breakpoints(state: State<'_, AppState>) -> Result<Value, String> {
    let debug = state
        .debug
        .lock()
        .map_err(|e| format!("debug lock poisoned: {e}"))?;
    let sess = debug.as_ref().ok_or_else(|| "debugger not started".to_string())?;
    debugger::breakpoints(sess)
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
    restore_agent(&state)?;
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
    restore_agent(&state)?;
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

#[tauri::command]
pub fn shell_spawn(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<crate::shell::SpawnedShell, String> {
    state.shell.spawn(app)
}

#[tauri::command]
pub fn shell_write(id: u32, data: String, state: State<'_, AppState>) -> Result<(), String> {
    state.shell.write(id, &data)
}

#[tauri::command]
pub fn shell_resize(
    id: u32,
    rows: u16,
    cols: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.shell.resize(id, rows, cols)
}

#[tauri::command]
pub fn shell_kill(id: u32, state: State<'_, AppState>) -> Result<(), String> {
    state.shell.kill(id)
}

#[tauri::command]
pub fn shell_list(state: State<'_, AppState>) -> Vec<u32> {
    state.shell.list()
}
