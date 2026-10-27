//! Starts the compiled Bun server (`aura-server`) bundled as a Tauri sidecar.
//! See docs/decisions/0001-surrealdb-embedded.md for why the native addon path is passed in.

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const SIDECAR: &str = "aura-server";
const NATIVE_ADDON: &str = "resources/surrealdb-node.node";

pub fn spawn(app: &AppHandle) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let addon = app.path().resolve(NATIVE_ADDON, BaseDirectory::Resource)?;

    let (mut events, child) = app
        .shell()
        .sidecar(SIDECAR)?
        .env("NAPI_RS_NATIVE_LIBRARY_PATH", addon)
        // Lets the server exit if this process dies without running its exit hook.
        .env("AURA_PARENT_PID", std::process::id().to_string())
        .spawn()?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) => print!("[server] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Stderr(line) => {
                    eprint!("[server] {}", String::from_utf8_lossy(&line))
                }
                CommandEvent::Error(error) => eprintln!("[server] error: {error}"),
                CommandEvent::Terminated(status) => {
                    eprintln!(
                        "[server] exited: code {:?}, signal {:?}",
                        status.code, status.signal
                    );
                }
                _ => {}
            }
        }
    });

    Ok(child)
}
