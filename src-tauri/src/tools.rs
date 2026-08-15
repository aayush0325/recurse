use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use crate::agent::ToolCall;
use crate::debugger;
use crate::engine;
use crate::memory;
use crate::session::R2Session;

/// Shared state the tool executor needs to reach the live analysis session,
/// the debug session, and the active project's memory.
pub struct ToolContext {
    pub session: Arc<Mutex<Option<R2Session>>>,
    pub debug: Arc<Mutex<Option<R2Session>>>,
    pub project: Option<String>,
}

const MAX_RESULT_CHARS: usize = 12_000;

fn tool(name: &str, description: &str, params: Value) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": params,
        }
    })
}

fn props(entries: &[(&str, &str, &str, bool)]) -> Value {
    let mut properties = serde_json::Map::new();
    let mut required = Vec::new();
    for (name, ty, desc, req) in entries {
        properties.insert(
            (*name).to_string(),
            json!({ "type": ty, "description": desc }),
        );
        if *req {
            required.push(Value::String((*name).to_string()));
        }
    }
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
    })
}

/// The full tool schema sent to the model.
pub fn schema() -> Vec<Value> {
    vec![
        tool("disassemble", "Disassemble `count` instructions at `addr`.", props(&[
            ("addr", "integer", "Address to disassemble", true),
            ("count", "integer", "Number of instructions (default 32)", false),
        ])),
        tool("decompile", "Decompile the function containing `addr` (r2ghidra).", props(&[
            ("addr", "integer", "Address inside the function", true),
        ])),
        tool("functions", "List all analyzed functions.", props(&[])),
        tool("strings", "List all strings referenced in the binary.", props(&[])),
        tool("imports", "List imported symbols.", props(&[])),
        tool("xrefs_to", "List cross-references pointing to `addr`.", props(&[
            ("addr", "integer", "Target address", true),
        ])),
        tool("search", "Search strings for a substring (case-insensitive).", props(&[
            ("pattern", "string", "Substring to find", true),
        ])),
        tool("debug_start", "Start (or restart) the program under the debugger, optionally with arguments.", props(&[
            ("args", "array", "Program arguments", false),
        ])),
        tool("debug_breakpoint", "Set a breakpoint at `addr`.", props(&[
            ("addr", "integer", "Breakpoint address", true),
        ])),
        tool("debug_breakpoints", "List current breakpoints.", props(&[])),
        tool("debug_continue", "Continue execution until breakpoint or exit.", props(&[])),
        tool("debug_step", "Single-step into the next instruction.", props(&[])),
        tool("debug_step_over", "Single-step over the next instruction.", props(&[])),
        tool("debug_registers", "Dump all registers.", props(&[])),
        tool("debug_read_memory", "Read `len` bytes at `addr`.", props(&[
            ("addr", "integer", "Address to read", true),
            ("len", "integer", "Number of bytes (default 16)", false),
        ])),
        tool("debug_write_memory", "Write raw bytes (hex string) at `addr`.", props(&[
            ("addr", "integer", "Address to write", true),
            ("bytes", "string", "Hex bytes, e.g. \"9090\"", true),
        ])),
        tool("debug_write_register", "Set a register to a value.", props(&[
            ("reg", "string", "Register name, e.g. \"pc\" or \"eax\"", true),
            ("value", "integer", "Value to set", true),
        ])),
        tool("debug_disassemble", "Disassemble `count` instructions at the current program counter.", props(&[
            ("count", "integer", "Number of instructions (default 16)", false),
        ])),
        tool("debug_kill", "Kill the debuggee.", props(&[])),
        tool("save_memory", "Persist a finding to project memory under a key.", props(&[
            ("key", "string", "Short key, e.g. \"password_check\"", true),
            ("value", "string", "The finding to remember", true),
        ])),
        tool("load_memory", "Read a previously saved memory entry.", props(&[
            ("key", "string", "Key to load", true),
        ])),
        tool("list_memory", "List saved memory keys.", props(&[])),
        tool("delete_memory", "Delete a saved memory entry.", props(&[
            ("key", "string", "Key to delete", true),
        ])),
    ]
}

fn get_str(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("missing string argument '{key}'"))
}

fn get_u64(args: &Value, key: &str) -> Result<u64, String> {
    args.get(key)
        .and_then(|v| v.as_u64())
        .ok_or_else(|| format!("missing integer argument '{key}'"))
}

fn get_u64_opt(args: &Value, key: &str, default: u64) -> u64 {
    args.get(key).and_then(|v| v.as_u64()).unwrap_or(default)
}

fn render(value: Value) -> String {
    match value {
        Value::String(s) => s,
        other => serde_json::to_string(&other).unwrap_or_else(|_| other.to_string()),
    }
}

fn truncate(s: &str) -> String {
    if s.len() <= MAX_RESULT_CHARS {
        s.to_string()
    } else {
        format!(
            "{}\n...\n[truncated {} characters]",
            &s[..MAX_RESULT_CHARS],
            s.len() - MAX_RESULT_CHARS
        )
    }
}

fn with_sess<F>(ctx: &ToolContext, f: F) -> Result<Value, String>
where
    F: FnOnce(&R2Session) -> Result<Value, String>,
{
    let guard = ctx
        .session
        .lock()
        .map_err(|e| format!("session lock poisoned: {e}"))?;
    let sess = guard.as_ref().ok_or_else(|| "no binary loaded".to_string())?;
    f(sess)
}

fn with_debug<F>(ctx: &ToolContext, f: F) -> Result<Value, String>
where
    F: FnOnce(&R2Session) -> Result<Value, String>,
{
    let guard = ctx
        .debug
        .lock()
        .map_err(|e| format!("debug lock poisoned: {e}"))?;
    let sess = guard.as_ref().ok_or_else(|| "debugger not started".to_string())?;
    f(sess)
}

/// Ensure a debug session exists (spawned on the currently loaded binary) so
/// the agent can start the debugger autonomously, then run `f` against it.
fn with_debug_mut<F>(ctx: &ToolContext, f: F) -> Result<Value, String>
where
    F: FnOnce(&R2Session) -> Result<Value, String>,
{
    let mut guard = ctx
        .debug
        .lock()
        .map_err(|e| format!("debug lock poisoned: {e}"))?;
    if guard.is_none() {
        let path = {
            let s = ctx
                .session
                .lock()
                .map_err(|e| format!("session lock poisoned: {e}"))?;
            s.as_ref()
                .ok_or_else(|| "no binary loaded".to_string())?
                .path
                .clone()
        };
        *guard = Some(
            crate::session::R2Session::open_with_args(
                path,
                crate::debugger::SPAWN_ARGS.to_vec(),
            )
            .map_err(|e| format!("failed to start debugger: {e}"))?,
        );
    }
    let sess = guard.as_ref().unwrap();
    f(sess)
}

/// Execute a single tool call against the live sessions and return its result
/// text (truncated for the token budget).
pub fn execute(tc: &ToolCall, ctx: &ToolContext) -> Result<String, String> {
    let args: Value = serde_json::from_str(&tc.function.arguments).unwrap_or(Value::Null);
    let project = ctx.project.as_deref();

    let result: Result<Value, String> = match tc.function.name.as_str() {
        "disassemble" => {
            let addr = get_u64(&args, "addr")?;
            let count = get_u64_opt(&args, "count", 32);
            with_sess(ctx, |s| engine::disassemble(s, addr, count))
        }
        "decompile" => {
            let addr = get_u64(&args, "addr")?;
            with_sess(ctx, |s| engine::decompile(s, addr))
        }
        "functions" => with_sess(ctx, engine::functions),
        "strings" => with_sess(ctx, engine::strings),
        "imports" => with_sess(ctx, engine::imports),
        "xrefs_to" => {
            let addr = get_u64(&args, "addr")?;
            with_sess(ctx, |s| engine::xrefs_to(s, addr))
        }
        "search" => {
            let pattern = get_str(&args, "pattern")?.to_lowercase();
            with_sess(ctx, |s| {
                let strings = engine::strings(s)?;
                let matches: Vec<Value> = strings
                    .as_array()
                    .map(|a| a.as_slice())
                    .unwrap_or(&[])
                    .iter()
                    .filter(|x| {
                        x["string"]
                            .as_str()
                            .map(|st| st.to_lowercase().contains(&pattern))
                            .unwrap_or(false)
                    })
                    .take(200)
                    .cloned()
                    .collect();
                Ok(Value::Array(matches))
            })
        }
        "debug_start" => {
            let argv: Vec<&str> = args
                .get("args")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str())
                        .collect::<Vec<&str>>()
                })
                .unwrap_or_default();
            with_debug_mut(ctx, |s| debugger::start(s, &argv))
        }
        "debug_breakpoint" => {
            let addr = get_u64(&args, "addr")?;
            with_debug(ctx, |s| debugger::breakpoint(s, addr))
        }
        "debug_breakpoints" => with_debug(ctx, debugger::breakpoints),
        "debug_continue" => with_debug(ctx, debugger::continue_run),
        "debug_step" => with_debug(ctx, debugger::step),
        "debug_step_over" => with_debug(ctx, debugger::step_over),
        "debug_registers" => with_debug(ctx, debugger::registers),
        "debug_read_memory" => {
            let addr = get_u64(&args, "addr")?;
            let len = get_u64_opt(&args, "len", 16);
            with_debug(ctx, |s| debugger::read_memory(s, addr, len))
        }
        "debug_write_memory" => {
            let addr = get_u64(&args, "addr")?;
            let bytes = get_str(&args, "bytes")?;
            with_debug(ctx, |s| debugger::write_memory(s, addr, &bytes))
        }
        "debug_write_register" => {
            let reg = get_str(&args, "reg")?;
            let value = get_u64(&args, "value")?;
            with_debug(ctx, |s| debugger::set_register(s, &reg, value))
        }
        "debug_disassemble" => {
            let count = get_u64_opt(&args, "count", 16);
            with_debug(ctx, |s| debugger::current_disasm(s, count))
        }
        "debug_kill" => with_debug(ctx, debugger::kill),
        "save_memory" => {
            let key = get_str(&args, "key")?;
            let value = get_str(&args, "value")?;
            memory::save(project, &key, &value)?;
            Ok(json!({ "saved": key }))
        }
        "load_memory" => {
            let key = get_str(&args, "key")?;
            Ok(Value::String(memory::load(project, &key)?))
        }
        "list_memory" => Ok(Value::Array(
            memory::list(project)?
                .into_iter()
                .map(Value::String)
                .collect(),
        )),
        "delete_memory" => {
            let key = get_str(&args, "key")?;
            memory::remove(project, &key)?;
            Ok(json!({ "deleted": key }))
        }
        other => Err(format!("unknown tool: {other}")),
    };

    result.map(|v| truncate(&render(v)))
}
