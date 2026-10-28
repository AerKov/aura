//! Starts the compiled Bun server (`aura-server`) bundled as a Tauri sidecar.
//! See docs/decisions/0001-surrealdb-embedded.md for why the native addon path is passed in.
//!
//! The server's recent output and exit are kept in [`ServerStatus`] so the window can say why the
//! server is unreachable instead of a bare connection error.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const SIDECAR: &str = "aura-server";
const NATIVE_ADDON: &str = "resources/surrealdb-node.node";
/// How many of the server's last output lines are kept for the error screen.
const KEPT_LINES: usize = 40;

/// What the window can learn about the server: whether it is running, how it ended, its last lines.
#[derive(Clone, Default, Serialize)]
pub struct ServerStatus {
    pub started: bool,
    /// Why it is not running: a spawn error or an exit code/signal.
    pub stopped: Option<String>,
    pub lines: VecDeque<String>,
}

pub type SharedStatus = Arc<Mutex<ServerStatus>>;

fn record(status: &SharedStatus, line: String) {
    if let Ok(mut s) = status.lock() {
        if s.lines.len() == KEPT_LINES {
            s.lines.pop_front();
        }
        s.lines.push_back(line);
    }
}

pub fn spawn(
    app: &AppHandle,
    status: SharedStatus,
) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let addon = app.path().resolve(NATIVE_ADDON, BaseDirectory::Resource)?;

    let (mut events, child) = app
        .shell()
        .sidecar(SIDECAR)?
        .env("NAPI_RS_NATIVE_LIBRARY_PATH", addon)
        // Lets the server exit if this process dies without running its exit hook.
        .env("AURA_PARENT_PID", std::process::id().to_string())
        .spawn()?;
    if let Ok(mut s) = status.lock() {
        s.started = true;
    }

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line = String::from_utf8_lossy(&line).into_owned();
                    print!("[server] {line}");
                    record(&status, line.trim_end().to_string());
                }
                CommandEvent::Stderr(line) => {
                    let line = String::from_utf8_lossy(&line).into_owned();
                    eprint!("[server] {line}");
                    record(&status, line.trim_end().to_string());
                }
                CommandEvent::Error(error) => {
                    eprintln!("[server] error: {error}");
                    record(&status, format!("error: {error}"));
                }
                CommandEvent::Terminated(payload) => {
                    let how = format!(
                        "exited: code {:?}, signal {:?}",
                        payload.code, payload.signal
                    );
                    eprintln!("[server] {how}");
                    if let Ok(mut s) = status.lock() {
                        s.stopped = Some(how);
                    }
                }
                _ => {}
            }
        }
    });

    Ok(child)
}
