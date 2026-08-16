use serde_json::{json, Value};

use crate::session::R2Session;

/// Typed wrappers over radare2 commands. The heavy lifting (parsing, analysis,
/// disassembly, xrefs, decompilation) all lives inside r2 itself — we only
/// marshal commands and results across the pipe.
pub fn info(s: &R2Session) -> Value {
    s.info.clone()
}

/// Full binary summary after analysis (used when a file is opened).
pub fn summary(s: &R2Session) -> Value {
    let functions = functions(s).unwrap_or_else(|_| json!([]));
    let strings = strings(s).unwrap_or_else(|_| json!([]));
    json!({
        "path": s.path.to_string_lossy(),
        "info": s.info,
        "function_count": functions.as_array().map(|a| a.len()).unwrap_or(0),
        "string_count": strings.as_array().map(|a| a.len()).unwrap_or(0),
    })
}

/// `aflj` — all analyzed functions.
pub fn functions(s: &R2Session) -> Result<Value, String> {
    s.run("aflj")
}

/// `afij @ addr` — info about the function containing `addr`.
pub fn function_at(s: &R2Session, addr: u64) -> Result<Value, String> {
    s.run(&format!("afij @ {addr:#x}"))
}

/// `pdj <count> @ addr` — disassemble `count` instructions at `addr`.
pub fn disassemble(s: &R2Session, addr: u64, count: u64) -> Result<Value, String> {
    s.run(&format!("pdj {count} @ {addr:#x}"))
}

/// `pdfj @ addr` — full disassembly of the function containing `addr`.
pub fn function_disasm(s: &R2Session, addr: u64) -> Result<Value, String> {
    s.run(&format!("pdfj @ {addr:#x}"))
}

/// `agfj @ addr` — JSON control-flow graph (basic blocks with per-block
/// disassembly, plus each block's `jump`/`fail` edges) for the function
/// containing `addr`. Rendered as an interactive graph in the UI.
pub fn function_graph(s: &R2Session, addr: u64) -> Result<Value, String> {
    s.run(&format!("agfj @ {addr:#x}"))
}

/// `izzj` — all strings referenced in the binary.
pub fn strings(s: &R2Session) -> Result<Value, String> {
    s.run("izzj")
}

/// `iij` — imported symbols.
pub fn imports(s: &R2Session) -> Result<Value, String> {
    s.run("iij")
}

/// `axtj @ addr` — references pointing to `addr`.
pub fn xrefs_to(s: &R2Session, addr: u64) -> Result<Value, String> {
    s.run(&format!("axtj @ {addr:#x}"))
}

/// `pdgj @ addr` — Ghidra p-code decompilation via r2ghidra (if installed).
pub fn decompile(s: &R2Session, addr: u64) -> Result<Value, String> {
    s.run(&format!("pdgj @ {addr:#x}"))
}

/// Escape hatch: pass any raw r2 command through to the live session.
pub fn raw(s: &R2Session, cmd: &str) -> Result<Value, String> {
    s.run(cmd)
}
