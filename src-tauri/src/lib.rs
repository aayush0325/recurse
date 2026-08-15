mod agent;
mod commands;
mod config;
mod debugger;
mod engine;
mod memory;
mod project;
mod session;
mod shell;
mod tools;

use std::sync::{Arc, Mutex};

use agent::{Agent, LlmConfig, ModelInfo};

pub struct AppState {
    pub session: Arc<Mutex<Option<session::R2Session>>>,
    pub debug: Arc<Mutex<Option<session::R2Session>>>,
    pub agent: Arc<Mutex<Agent>>,
    pub llm: Mutex<LlmConfig>,
    pub models: Mutex<Option<Vec<ModelInfo>>>,
    pub project: Mutex<Option<project::Project>>,
    pub shell: shell::ShellManager,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            session: Arc::new(Mutex::new(None)),
            debug: Arc::new(Mutex::new(None)),
            agent: Arc::new(Mutex::new(Agent::new())),
            llm: Mutex::new(LlmConfig::default()),
            models: Mutex::new(None),
            project: Mutex::new(None),
            shell: shell::ShellManager::new(),
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_binary,
            commands::analyze,
            commands::close_binary,
            commands::binary_info,
            commands::functions,
            commands::disassemble,
            commands::function_at,
            commands::function_disasm,
            commands::strings,
            commands::imports,
            commands::xrefs_to,
            commands::decompile,
            commands::raw,
            commands::set_zoom,
            commands::agent_chat,
            commands::agent_reset,
            commands::agent_history,
            commands::debug_start,
            commands::debug_command,
            commands::debug_stop,
            commands::debug_registers,
            commands::debug_disassemble,
            commands::debug_breakpoints,
            commands::llm_status,
            commands::set_model,
            commands::save_api_key,
            commands::list_models,
            commands::list_projects,
            commands::create_project,
            commands::open_project,
            commands::delete_project,
            commands::project_read_file,
            commands::project_write_file,
            commands::project_list_files,
            commands::shell_spawn,
            commands::shell_write,
            commands::shell_resize,
            commands::shell_kill,
            commands::shell_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
