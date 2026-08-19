mod agent;
mod commands;
mod config;
mod debugger;
mod engine;
mod memory;
mod project;
mod session;
mod sessions;
mod shell;
mod tools;

use std::sync::{Arc, Mutex};

use agent::{Agent, LlmConfig, ModelInfo};

/// WebKitGTK registers a `GtkGestureZoom` on the web view under the data key
/// `"wk-view-zoom-gesture"` that scales the whole page on trackpad pinch. Tauri
/// exposes no setting to disable it (upstream limitation) and JS/CSS cannot
/// cancel it, so we destroy that gesture's signal handlers. The app keeps its
/// own Ctrl+/−/0 keyboard zoom via the `set_zoom` command.
#[cfg(target_os = "linux")]
fn disable_pinch_zoom(app: &tauri::App) {
    use glib::prelude::ObjectExt;
    use tauri::Manager;

    let Some(webview) = app.get_webview_window("main") else {
        eprintln!("[recurse] no main webview; skipping pinch-zoom disable");
        return;
    };
    let _ = webview.with_webview(|wv| unsafe {
        let inner = wv.inner();
        if let Some(gesture) = inner.data::<()>("wk-view-zoom-gesture") {
            glib::gobject_ffi::g_signal_handlers_destroy(
                gesture.as_ptr() as *mut glib::gobject_ffi::GObject
            );
            eprintln!("[recurse] disabled WebKitGTK pinch-zoom gesture");
        } else {
            eprintln!("[recurse] wk-view-zoom-gesture not found");
        }
    });
}

#[cfg(not(target_os = "linux"))]
fn disable_pinch_zoom(_app: &tauri::App) {}

pub struct AppState {
    pub session: Arc<Mutex<Option<session::R2Session>>>,
    pub debug: Arc<Mutex<Option<session::R2Session>>>,
    pub debug_stdin: Arc<Mutex<Option<std::fs::File>>>,
    pub agent: Arc<Mutex<Agent>>,
    pub llm: Mutex<LlmConfig>,
    pub models: Mutex<Option<Vec<ModelInfo>>>,
    pub project: Mutex<Option<project::Project>>,
    pub current_session: Mutex<Option<String>>,
    pub shell: shell::ShellManager,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            sessions::cleanup_legacy();
            disable_pinch_zoom(app);
            Ok(())
        })
        .manage(AppState {
            session: Arc::new(Mutex::new(None)),
            debug: Arc::new(Mutex::new(None)),
            debug_stdin: Arc::new(Mutex::new(None)),
            agent: Arc::new(Mutex::new(Agent::new())),
            llm: Mutex::new(LlmConfig::default()),
            models: Mutex::new(None),
            project: Mutex::new(None),
            current_session: Mutex::new(None),
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
            commands::function_graph,
            commands::strings,
            commands::imports,
            commands::xrefs_to,
            commands::decompile,
            commands::raw,
            commands::set_zoom,
            commands::agent_chat,
            commands::agent_reset,
            commands::agent_history,
            commands::sessions_list,
            commands::sessions_create,
            commands::sessions_select,
            commands::sessions_delete,
            commands::sessions_rename,
            commands::debug_start,
            commands::debug_command,
            commands::debug_stop,
            commands::debug_stdin,
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
