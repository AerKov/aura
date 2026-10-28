use std::sync::Mutex;

use tauri::{Manager, RunEvent, State};
use tauri_plugin_shell::process::CommandChild;

mod sidecar;

use sidecar::{ServerStatus, SharedStatus};

/// Handle to the running Bun server sidecar, killed when the app exits.
#[derive(Default)]
struct Sidecar(Mutex<Option<CommandChild>>);

/// The server's state for the window's "cannot reach the server" screen.
#[tauri::command]
fn server_status(status: State<'_, SharedStatus>) -> ServerStatus {
    status.lock().map(|s| s.clone()).unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Sidecar::default())
        .manage(SharedStatus::default())
        .invoke_handler(tauri::generate_handler![server_status])
        .setup(|app| {
            // In debug builds the server runs separately (`bun run dev`), with hot reload.
            if !cfg!(debug_assertions) {
                let status = app.state::<SharedStatus>().inner().clone();
                match sidecar::spawn(app.handle(), status.clone()) {
                    Ok(child) => {
                        *app.state::<Sidecar>()
                            .0
                            .lock()
                            .expect("sidecar lock poisoned") = Some(child);
                    }
                    // Keep the window up so it can show why, instead of quitting silently.
                    Err(error) => {
                        eprintln!("failed to start server sidecar: {error}");
                        if let Ok(mut s) = status.lock() {
                            s.stopped = Some(format!("could not start: {error}"));
                        }
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the aura desktop app")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                let child = app
                    .state::<Sidecar>()
                    .0
                    .lock()
                    .ok()
                    .and_then(|mut c| c.take());
                if let Some(child) = child {
                    if let Err(error) = child.kill() {
                        eprintln!("failed to stop server sidecar: {error}");
                    }
                }
            }
        });
}
