//! Saving a file the window holds (a chat attachment, an app's file) where the user chooses.
//!
//! A web view ignores downloads, so the window sends the bytes here: the system's "Save as" window
//! asks where to put them, then they are written there. The path always comes from that window,
//! never from the page, so the page cannot write anywhere on its own.

use tauri::ipc::{InvokeBody, Request};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Decodes `%XX` escapes (the file name comes URI-encoded, as headers are ASCII only).
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&text[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Only the last part of a name, without characters file systems refuse.
fn suggested_name(raw: &str) -> String {
    let name: String = percent_decode(raw)
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect();
    let name = name.trim().trim_start_matches('.').to_string();
    if name.is_empty() {
        "file".to_string()
    } else {
        name
    }
}

/// Asks where to save the bytes and writes them. Returns the path, or None if the user cancelled.
#[tauri::command]
pub async fn save_file(app: AppHandle, request: Request<'_>) -> Result<Option<String>, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("the file's bytes are missing".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(suggested_name)
        .unwrap_or_else(|| "file".to_string());
    let Some(target) = app.dialog().file().set_file_name(&name).blocking_save_file() else {
        return Ok(None);
    };
    let path = target.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| format!("could not save {}: {e}", path.display()))?;
    Ok(Some(path.display().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_keep_letters_and_lose_paths() {
        assert_eq!(suggested_name("INV-0003.html"), "INV-0003.html");
        assert_eq!(
            suggested_name("%D0%A0%D0%B0%D1%85%D1%83%D0%BD%D0%BE%D0%BA.pdf"),
            "Рахунок.pdf"
        );
        assert_eq!(suggested_name("..%2F..%2Fetc%2Fpasswd"), "passwd");
        assert_eq!(suggested_name("a%3Ab*c?.txt"), "abc.txt");
        assert_eq!(suggested_name(""), "file");
        assert_eq!(suggested_name("%"), "%");
    }
}
