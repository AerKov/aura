use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;

mod sidecar;

/// Handle to the running Bun server sidecar, killed when the app exits.
#[derive(Default)]
struct Sidecar(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Sidecar::default())
        .setup(|app| {
            // In debug builds the server runs separately (`bun run dev`), with hot reload.
            if !cfg!(debug_assertions) {
                let child = sidecar::spawn(app.handle())?;
                *app.state::<Sidecar>()
                    .0
                    .lock()
                    .expect("sidecar lock poisoned") = Some(child);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the crew desktop app")
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
