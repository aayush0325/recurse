use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};

use r2pipe::R2Pipe;
use serde_json::Value;

/// Requests sent from the app thread to the r2 worker thread.
enum Cmd {
    Run {
        cmd: String,
        resp: Sender<Result<Value, String>>,
    },
    Quit,
}

type StartupResult = Result<(), String>;

/// A long-lived radare2 subprocess driven over r2pipe.
///
/// `R2Pipe` itself is `!Send`, so it is owned by a dedicated worker thread and
/// commands are issued over channels. This handle is therefore `Send + Sync`
/// and safe to keep in Tauri managed state.
pub struct R2Session {
    tx: Sender<Cmd>,
    join: Option<std::thread::JoinHandle<()>>,
    pub path: PathBuf,
    pub info: Value,
}

impl R2Session {
    /// Spawn r2 and load the binary. Analysis is deferred to
    /// [`R2Session::analyze`] so opening never blocks the UI on a long pass.
    pub fn open(path: impl Into<PathBuf>) -> Result<Self, String> {
        let path = path.into();
        let worker_path = path.to_string_lossy().to_string();

        let (tx, rx) = mpsc::channel::<Cmd>();
        let (start_tx, start_rx) = mpsc::channel::<StartupResult>();

        let join = std::thread::Builder::new()
            .name("r2-worker".into())
            .spawn(move || worker(&worker_path, rx, start_tx))
            .map_err(|e| format!("failed to spawn r2 worker thread: {e}"))?;

        start_rx.recv().map_err(|e| e.to_string())??;

        let mut sess = R2Session {
            tx,
            join: Some(join),
            path,
            info: Value::Null,
        };

        sess.info = sess.run("ij")?;
        Ok(sess)
    }

    /// Full analysis pass: functions, refs, xrefs, strings. Long-running on big
    /// binaries, but gives the agent a fully analyzed target. Run it explicitly
    /// (or via `raw`) so the UI can show the workspace in the meantime.
    pub fn analyze(&self) -> Result<Value, String> {
        self.run("aaa")
    }

    /// Run an r2 command. JSON output is preferred; plain-text output is
    /// wrapped into a JSON string automatically.
    pub fn run(&self, cmd: &str) -> Result<Value, String> {
        let (resp, rx) = mpsc::channel();
        self.tx
            .send(Cmd::Run {
                cmd: cmd.to_string(),
                resp,
            })
            .map_err(|e| format!("r2 worker unavailable: {e}"))?;
        rx.recv().map_err(|e| e.to_string())?
    }

    /// Convenience for plain-text commands.
    pub fn text(&self, cmd: &str) -> Result<String, String> {
        match self.run(cmd)? {
            Value::String(s) => Ok(s),
            other => Ok(other.to_string()),
        }
    }
}

impl Drop for R2Session {
    fn drop(&mut self) {
        let _ = self.tx.send(Cmd::Quit);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

fn worker(path: &str, rx: Receiver<Cmd>, start_tx: Sender<StartupResult>) {
    let opts = r2pipe::R2PipeSpawnOptions {
        exepath: "r2".into(),
        args: vec!["-e", "bin.cache=true"],
    };
    let mut r2p = match R2Pipe::spawn(path, Some(opts)) {
        Ok(p) => p,
        Err(e) => {
            let _ = start_tx.send(Err(format!("failed to spawn radare2: {e}")));
            return;
        }
    };
    let _ = start_tx.send(Ok(()));

    loop {
        match rx.recv() {
            Ok(Cmd::Run { cmd, resp }) => {
                // Run the command exactly once. `cmdj` would internally `cmd`
                // (consuming stdout) and then fail JSON parse, so a naive
                // `cmdj().or_else(cmd())` re-sends the command and runs it a
                // second time — doubling cost for non-JSON commands like `aaa`.
                let result: Result<Value, String> = r2p
                    .cmd(&cmd)
                    .map(|text| {
                        serde_json::from_str::<Value>(&text).unwrap_or_else(|_| Value::String(text))
                    })
                    .map_err(|e| e.to_string());
                let _ = resp.send(result);
            }
            Ok(Cmd::Quit) | Err(_) => break,
        }
    }
    r2p.close();
}
