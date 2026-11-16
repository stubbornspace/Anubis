//! CloudKit transport is separate from local persistence. Sync never holds the
//! library lock while waiting for the network, and acknowledges exact revisions.
use crate::{LibraryState, library};
use serde_json::{Value, json};
use std::{path::Path, sync::Mutex};
use tauri::Manager;
#[derive(Default)]
pub struct SyncState(pub Mutex<()>);
#[cfg(any(target_os = "macos", target_os = "ios"))]
fn cloud(request: Value) -> Result<Value, String> {
    use std::ffi::{CStr, CString, c_char};
    unsafe extern "C" {
        fn anubis_note_cloud(input: *const c_char) -> *mut c_char;
        fn anubis_apple_free(value: *mut c_char);
    }
    let input = CString::new(request.to_string()).map_err(|e| e.to_string())?;
    let ptr = unsafe { anubis_note_cloud(input.as_ptr()) };
    if ptr.is_null() {
        return Err("CloudKit returned no response.".into());
    }
    let output = unsafe { CStr::from_ptr(ptr) }
        .to_string_lossy()
        .into_owned();
    unsafe { anubis_apple_free(ptr) };
    let result: Value = serde_json::from_str(&output).map_err(|e| e.to_string())?;
    if result["resetToken"] == true {
        return Ok(result);
    }
    if let Some(error) = result["error"].as_str() {
        return Err(error.into());
    }
    Ok(result)
}
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn cloud(_request: Value) -> Result<Value, String> {
    Err("iCloud note sync is available on Mac, iPhone, and iPad.".into())
}
fn with_db<T>(
    app: &tauri::AppHandle,
    dir: &Path,
    action: impl FnOnce(&mut library::Library) -> Result<T, String>,
) -> Result<T, String> {
    let state = app.state::<LibraryState>();
    let _lock = state.0.lock().map_err(|e| e.to_string())?;
    action(&mut library::Library::open(dir)?)
}
#[tauri::command]
pub async fn sync_library(app: tauri::AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<SyncState>();
        let _guard = state
            .0
            .try_lock()
            .map_err(|_| "Note sync is already running.")?;
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("library");
        let account = cloud(json!({"op":"account"}))?;
        with_db(&app, &dir, |db| {
            db.bind_account(account["account"].as_str().unwrap_or(""))
        })?;
        let saved_token = with_db(&app, &dir, |db| db.setting("cloudToken"))?;
        let initial = saved_token.is_none();
        let mut token = saved_token.unwrap_or_default();
        let mut changes = cloud(json!({"op":"fetch","token":token,"account":account["account"],"createZone":initial}))?;
        if changes["resetToken"] == true {
            token = String::new();
            changes = cloud(json!({"op":"fetch","token":token,"account":account["account"]}))?;
            if let Some(error) = changes["error"].as_str() {
                return Err(error.into());
            }
        }
        let records: Vec<library::CloudRecord> =
            serde_json::from_value(changes["records"].clone()).map_err(|e| e.to_string())?;
        let deleted: Vec<String> =
            serde_json::from_value(changes["deleted"].clone()).map_err(|e| e.to_string())?;
        let conflicts = with_db(&app, &dir, |db| {
            db.apply_cloud(
                &dir,
                records,
                changes["token"].as_str().unwrap_or(""),
                &deleted,
            )
        })?;
        // Drain incoming pages before uploading, so a new device cannot race a
        // cloud version that has not been inspected yet.
        if changes["more"] == true {
            return Ok(json!({"pending":true,"conflicts":conflicts}));
        }
        let pending = with_db(&app, &dir, |db| db.pending())?;
        for note in pending {
            let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
            let path = temp.path().join("note.json");
            std::fs::write(&path, serde_json::to_vec(&note).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            let fields = with_db(&app, &dir, |db| db.cloud_fields(&note.id))?;
            let mut assets = std::collections::BTreeMap::new();
            for piece in note.markdown.split("anubis-asset:").skip(1) {
                let id: String = piece
                    .chars()
                    .take_while(|c| c.is_ascii_hexdigit())
                    .collect();
                if id.len() != 64 {
                    continue;
                }
                let bytes = library::asset_bytes(&dir, &id)?;
                let asset_path = temp.path().join(&id);
                std::fs::write(&asset_path, bytes).map_err(|e| e.to_string())?;
                assets.insert(id, asset_path);
            }
            let saved = cloud(
                json!({"op":"push","account":account["account"],"id":note.id,"fields":fields,"bodyPath":path,"assets":assets}),
            )?;
            let fields = saved["fields"]
                .as_str()
                .ok_or("CloudKit did not acknowledge the note save.")?;
            with_db(&app, &dir, |db| db.acknowledge(&note, fields))?;
        }
        let pending = with_db(&app, &dir, |db| db.pending())?;
        Ok(json!({"pending":!pending.is_empty(),"conflicts":conflicts}))
    })
    .await
    .map_err(|e| e.to_string())?
}
