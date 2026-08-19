use std::fs::{self, File, OpenOptions};
use std::process::Command;

use serde_json::Value;

use crate::session::R2Session;

/// Typed wrappers over radare2's native debugger (`r2 -d`). These run against
/// a dedicated debug session (a second `R2Session` spawned with `-d`) so the
/// analysis session stays clean.
pub const DEBUG_PROFILE: &str = "/tmp/recurse-debug.rr2";
pub const DEBUG_STDIN: &str = "/tmp/recurse-debug.stdin";
pub const SPAWN_ARGS: &[&str] = &["-d", "-e", "bin.cache=true", "-r", DEBUG_PROFILE];

/// Give the debuggee a persistent FIFO stdin so the UI can provide input while
/// a continue command is waiting inside radare2.
pub fn prepare_profile() -> Result<(), String> {
    let _ = fs::remove_file(DEBUG_STDIN);
    let status = Command::new("mkfifo")
        .arg(DEBUG_STDIN)
        .status()
        .map_err(|e| format!("failed to create debugger stdin pipe: {e}"))?;
    if !status.success() {
        return Err("mkfifo failed for debugger stdin".to_string());
    }
    fs::write(DEBUG_PROFILE, format!("stdin={DEBUG_STDIN}\n")).map_err(|e| e.to_string())
}

pub fn open_stdin() -> Result<File, String> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(DEBUG_STDIN)
        .map_err(|e| format!("failed to open debugger stdin: {e}"))
}

/// (Re)open the debuggee, optionally with program arguments.
pub fn start(s: &R2Session, args: &[&str]) -> Result<Value, String> {
    let cmd = if args.is_empty() {
        "ood".to_string()
    } else {
        format!("ood {}", args.join(" "))
    };
    s.run(&cmd)
}

/// Set a breakpoint at `addr`.
pub fn breakpoint(s: &R2Session, addr: u64) -> Result<Value, String> {
    s.run(&format!("db {addr:#x}"))
}

/// List breakpoints (`dbj`).
pub fn breakpoints(s: &R2Session) -> Result<Value, String> {
    s.run("dbj")
}

/// Continue execution until the next breakpoint / exit.
pub fn continue_run(s: &R2Session) -> Result<Value, String> {
    s.run("dc")
}

/// Single-step into.
pub fn step(s: &R2Session) -> Result<Value, String> {
    s.run("ds")
}

/// Single-step over.
pub fn step_over(s: &R2Session) -> Result<Value, String> {
    s.run("dso")
}

/// Dump all registers as JSON (`drj`).
pub fn registers(s: &R2Session) -> Result<Value, String> {
    s.run("drj")
}

/// Set a register (uses the architecture-agnostic `pc`/name aliases r2 exposes).
pub fn set_register(s: &R2Session, reg: &str, val: u64) -> Result<Value, String> {
    s.run(&format!("dr {reg}={val:#x}"))
}

/// Read `len` bytes at `addr` as JSON (`pxj`).
pub fn read_memory(s: &R2Session, addr: u64, len: u64) -> Result<Value, String> {
    s.run(&format!("pxj {len} @ {addr:#x}"))
}

/// Write bytes (a hex/escaped string) at `addr`.
pub fn write_memory(s: &R2Session, addr: u64, bytes: &str) -> Result<Value, String> {
    s.run(&format!("wx {bytes} @ {addr:#x}"))
}

/// Disassemble `count` instructions at the current program counter.
pub fn current_disasm(s: &R2Session, count: u64) -> Result<Value, String> {
    s.run(&format!("pdj {count}"))
}

/// Kill the debuggee.
pub fn kill(s: &R2Session) -> Result<Value, String> {
    s.run("dk")
}
