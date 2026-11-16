mod apple;
mod library;
mod note_sync;
mod recovery;
mod workspace;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
#[cfg(not(target_os = "ios"))]
use std::{fs, io::Write};
use std::{
    path::PathBuf,
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::{Emitter, Manager};
#[cfg(not(target_os = "ios"))]
use tauri_plugin_dialog::DialogExt;
#[cfg(target_os = "ios")]
use tauri_plugin_ios_workspace::IosWorkspace;
use workspace::{Listing, Snapshot};

#[derive(Default)]
struct WorkspaceState {
    root: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    presenter: Mutex<Option<apple::Presenter>>,
    frontend_ready: AtomicBool,
    allow_exit: AtomicBool,
}
#[cfg(not(target_os = "ios"))]
fn settings(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("workspace.json"))
}
fn activate(app: &tauri::AppHandle, path: PathBuf) -> Result<Listing, String> {
    let path = path
        .canonicalize()
        .map_err(|e| format!("Cannot open the selected folder: {e}"))?;
    if !path.is_dir() {
        return Err("Select a folder.".into());
    }
    let mut listing = workspace::listing(&path)?;
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(
        move |event: Result<notify::Event, notify::Error>| match event {
            Ok(event) if !matches!(event.kind, notify::EventKind::Access(_)) => {
                let _ = handle.emit("workspace-changed", ());
            }
            Err(e) => {
                let _ = handle.emit("workspace-watch-error", e.to_string());
            }
            _ => {}
        },
    )
    .map_err(|e| e.to_string())?;
    let watched = watcher.watch(&path, RecursiveMode::Recursive);
    if let Err(e) = &watched {
        listing.warnings.push(format!(
            "Live updates are unavailable: {e}. Use Refresh folder."
        ));
    }
    #[cfg(not(target_os = "ios"))]
    {
        let config = settings(app)?;
        let mut temp =
            tempfile::NamedTempFile::new_in(config.parent().unwrap()).map_err(|e| e.to_string())?;
        temp.write_all(
            serde_json::to_string(&path)
                .map_err(|e| e.to_string())?
                .as_bytes(),
        )
        .map_err(|e| e.to_string())?;
        temp.persist(config).map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "ios")]
    app.state::<IosWorkspace<tauri::Wry>>().commit(&path)?;
    let state = app.state::<WorkspaceState>();
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        let handle = app.clone();
        *state.presenter.lock().map_err(|e| e.to_string())? =
            Some(apple::Presenter::new(&path, move || {
                let _ = handle.emit("workspace-changed", ());
            })?);
    }
    *state.root.lock().map_err(|e| e.to_string())? = Some(path);
    *state.watcher.lock().map_err(|e| e.to_string())? = watched.ok().map(|_| watcher);
    Ok(listing)
}
#[tauri::command]
async fn choose_workspace(app: tauri::AppHandle) -> Result<Option<Listing>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "ios")]
        {
            return open_ios_workspace(&app, false);
        }
        #[cfg(not(target_os = "ios"))]
        {
            let Some(folder) = app
                .dialog()
                .file()
                .set_title("Choose a folder for Anubis")
                .blocking_pick_folder()
            else {
                return Ok(None);
            };
            let path = folder.into_path().map_err(|e| e.to_string())?;
            activate(&app, path).map(Some)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn restore_workspace(app: tauri::AppHandle) -> Result<Option<Listing>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "ios")]
        {
            return open_ios_workspace(&app, true);
        }
        #[cfg(not(target_os = "ios"))]
        {
            let config = settings(&app)?;
            if !config.exists() {
                return Ok(None);
            };
            let path: PathBuf =
                serde_json::from_slice(&fs::read(config).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            activate(&app, path).map(Some)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(target_os = "ios")]
fn open_ios_workspace(app: &tauri::AppHandle, restore: bool) -> Result<Option<Listing>, String> {
    let bridge = app.state::<IosWorkspace<tauri::Wry>>();
    let Some(path) = bridge.folder(restore)? else {
        return Ok(None);
    };
    match activate(app, path) {
        Ok(listing) => Ok(Some(listing)),
        Err(error) => {
            bridge.cancel();
            Err(error)
        }
    }
}
async fn run<T: Send + 'static>(
    app: tauri::AppHandle,
    root: String,
    action: impl FnOnce(&std::path::Path) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<WorkspaceState>();
        let locked = state.root.lock().map_err(|e| e.to_string())?;
        let selected = locked.as_ref().ok_or("Choose a folder first.")?;
        if selected.to_string_lossy() != root {
            return Err("The workspace changed. Please try again.".into());
        }
        action(selected)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn list_workspace(app: tauri::AppHandle, root: String) -> Result<Listing, String> {
    run(app, root, workspace::listing).await
}
#[tauri::command]
async fn read_document(
    app: tauri::AppHandle,
    root: String,
    path: String,
) -> Result<Snapshot, String> {
    run(app, root, move |r| workspace::read(r, &path)).await
}
#[tauri::command]
async fn save_document(
    app: tauri::AppHandle,
    root: String,
    path: String,
    markdown: String,
    version: String,
) -> Result<Snapshot, String> {
    run(app, root, move |r| {
        workspace::save(r, &path, &markdown, &version)
    })
    .await
}
#[tauri::command]
async fn create_document(
    app: tauri::AppHandle,
    root: String,
    parent: String,
    name: String,
    markdown: String,
) -> Result<Snapshot, String> {
    run(app, root, move |r| {
        workspace::create(r, &parent, &name, &markdown)
    })
    .await
}
#[tauri::command]
async fn create_folder(
    app: tauri::AppHandle,
    root: String,
    parent: String,
    name: String,
) -> Result<(), String> {
    run(app, root, move |r| {
        workspace::create_folder(r, &parent, &name)
    })
    .await
}
#[tauri::command]
async fn rename_document(
    app: tauri::AppHandle,
    root: String,
    path: String,
    name: String,
    version: String,
) -> Result<Snapshot, String> {
    run(app, root, move |r| {
        workspace::rename(r, &path, &name, &version)
    })
    .await
}
#[tauri::command]
async fn delete_document(
    app: tauri::AppHandle,
    root: String,
    path: String,
    version: String,
) -> Result<(), String> {
    run(app, root, move |r| workspace::delete(r, &path, &version)).await
}

#[tauri::command]
async fn document_cloud_status(
    app: tauri::AppHandle,
    root: String,
    path: String,
) -> Result<Option<apple::Cloud>, String> {
    run(app, root, move |r| workspace::cloud_status(r, &path)).await
}
#[tauri::command]
async fn keep_document_versions(
    app: tauri::AppHandle,
    root: String,
    path: String,
) -> Result<(), String> {
    run(app, root, move |r| workspace::keep_cloud_versions(r, &path)).await
}

#[tauri::command]
async fn finish_background_save(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    return tauri::async_runtime::spawn_blocking(move || {
        app.state::<IosWorkspace<tauri::Wry>>()
            .finish_background_save()
    })
    .await
    .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "ios"))]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
async fn set_mobile_appearance(app: tauri::AppHandle, dark: bool) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    return tauri::async_runtime::spawn_blocking(move || {
        app.state::<IosWorkspace<tauri::Wry>>().set_appearance(dark)
    })
    .await
    .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app, dark);
        Ok(())
    }
}

#[tauri::command]
async fn store_recovery_draft(
    app: tauri::AppHandle,
    root: String,
    path: String,
    name: String,
    markdown: String,
    version: String,
) -> Result<(), String> {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let draft = recovery::RecoveryDraft {
            root: root.clone(),
            document: Snapshot {
                path,
                name,
                markdown,
                version,
                cloud: None,
            },
        };
        run(app, root, move |_| recovery::store(&directory, &draft)).await
    }
    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    {
        let _ = (app, root, path, name, markdown, version);
        Ok(())
    }
}

#[tauri::command]
async fn load_recovery_draft(
    app: tauri::AppHandle,
) -> Result<Option<recovery::RecoveryDraft>, String> {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    return tauri::async_runtime::spawn_blocking(move || {
        recovery::load(&app.path().app_data_dir().map_err(|e| e.to_string())?)
    })
    .await
    .map_err(|e| e.to_string())?;
    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    {
        let _ = app;
        Ok(None)
    }
}

#[tauri::command]
async fn clear_recovery_draft(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    return tauri::async_runtime::spawn_blocking(move || {
        recovery::clear(&app.path().app_data_dir().map_err(|e| e.to_string())?)
    })
    .await
    .map_err(|e| e.to_string())?;
    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    {
        let _ = app;
        Ok(())
    }
}

#[derive(Default)]
struct LibraryState(Mutex<()>);

#[derive(serde::Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum LibraryRequest {
    Load,
    PutAsset { bytes: Vec<u8> },
    Restore { json: String },
    History { id: String },
    GetAsset { id: String },
    Search { query: String },
    Read { id: String },
    Create { markdown: String, tags: Vec<String> },
    Save { note: library::Note },
    Draft { note: library::Note },
    ClearDraft { id: String },
    GetSetting { key: String },
    SetSetting { key: String, value: String },
}
#[tauri::command]
async fn library_call(
    app: tauri::AppHandle,
    request: LibraryRequest,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<LibraryState>();
        let _lock = state.0.lock().map_err(|e| e.to_string())?;
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("library");
        let mut db = library::Library::open(&dir)?;
        let value = match request {
            LibraryRequest::Restore { json } => {
                serde_json::json!(db.restore(&dir, json.as_bytes())?)
            }
            LibraryRequest::History { id } => serde_json::json!(db.history(&id)?),
            LibraryRequest::PutAsset { bytes } => {
                serde_json::json!(library::put_asset(&dir, &bytes)?)
            }
            LibraryRequest::GetAsset { id } => serde_json::json!(library::asset_url(&dir, &id)?),
            LibraryRequest::Search { query } => serde_json::json!(db.search(&query)?),
            LibraryRequest::Load => {
                serde_json::json!({"notes": db.list()?, "drafts": library::drafts(&dir)?})
            }
            LibraryRequest::Read { id } => serde_json::json!(db.read(&id)?),
            LibraryRequest::Create { markdown, tags } => {
                serde_json::json!(db.create(markdown, tags)?)
            }
            LibraryRequest::Save { note } => {
                library::store_draft(&dir, &note)?;
                let saved = db.save(note)?;
                library::clear_draft(&dir, &saved.id)?;
                serde_json::json!(saved)
            }
            LibraryRequest::Draft { note } => {
                library::store_draft(&dir, &note)?;
                serde_json::Value::Null
            }
            LibraryRequest::ClearDraft { id } => {
                library::clear_draft(&dir, &id)?;
                serde_json::Value::Null
            }
            LibraryRequest::GetSetting { key } => serde_json::json!(db.setting(&key)?),
            LibraryRequest::SetSetting { key, value } => {
                db.set_setting(&key, &value)?;
                serde_json::Value::Null
            }
        };
        Ok(value)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_library(app: tauri::AppHandle, note_id: Option<String>) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("library");
        let bytes = {
            let state = app.state::<LibraryState>();
            let _lock = state.0.lock().map_err(|e| e.to_string())?;
            let db = library::Library::open(&dir)?;
            if let Some(id) = &note_id {
                db.markdown_zip(&dir, id)?
            } else {
                db.backup(&dir)?
            }
        };
        let name = if note_id.is_some() {
            "Anubis-note.zip"
        } else {
            "Anubis-library.json"
        };
        #[cfg(target_os = "ios")]
        {
            let export_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
            let path = export_dir.path().join(name);
            std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
            app.state::<IosWorkspace<tauri::Wry>>().share_file(&path)?;
            Ok(true)
        }
        #[cfg(not(target_os = "ios"))]
        {
            let Some(file) = app
                .dialog()
                .file()
                .set_title("Export from Anubis")
                .set_file_name(name)
                .blocking_save_file()
            else {
                return Ok(false);
            };
            let path = file.into_path().map_err(|e| e.to_string())?;
            apple::coordinate(&path, None, apple::Access::Create, || {
                let parent = path.parent().ok_or("Invalid export location")?;
                let mut temp =
                    tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
                temp.write_all(&bytes).map_err(|e| e.to_string())?;
                temp.as_file().sync_all().map_err(|e| e.to_string())?;
                temp.persist_noclobber(&path).map_err(|_| {
                    "A file already exists there. Choose a new filename to preserve it.".to_string()
                })?;
                Ok(())
            })?;
            Ok(true)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn frontend_ready(state: tauri::State<WorkspaceState>) {
    state.frontend_ready.store(true, Ordering::SeqCst);
}
#[tauri::command]
fn finish_exit(app: tauri::AppHandle, state: tauri::State<WorkspaceState>) {
    state.allow_exit.store(true, Ordering::SeqCst);
    app.exit(0);
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run_app() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "ios")]
    let builder = builder.plugin(tauri_plugin_ios_workspace::init());
    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(WorkspaceState::default())
        .manage(LibraryState::default())
        .manage(note_sync::SyncState::default())
        .invoke_handler(tauri::generate_handler![
            library_call,
            export_library,
            note_sync::sync_library,
            choose_workspace,
            restore_workspace,
            list_workspace,
            read_document,
            save_document,
            create_document,
            create_folder,
            rename_document,
            delete_document,
            frontend_ready,
            finish_exit,
            finish_background_save,
            set_mobile_appearance,
            store_recovery_draft,
            load_recovery_draft,
            clear_recovery_draft,
            document_cloud_status,
            keep_document_versions
        ])
        .build(tauri::generate_context!())
        .expect("error while building Anubis")
        .run(|app, event| {
            #[cfg(target_os = "ios")]
            if matches!(event, tauri::RunEvent::Resumed) {
                let _ = app.emit("workspace-changed", ());
            }
            let state = app.state::<WorkspaceState>();
            if !state.frontend_ready.load(Ordering::SeqCst)
                || state.allow_exit.load(Ordering::SeqCst)
            {
                return;
            }
            match event {
                tauri::RunEvent::ExitRequested { api, .. } => {
                    api.prevent_exit();
                    let _ = app.emit("workspace-before-exit", ());
                }
                tauri::RunEvent::WindowEvent {
                    event: tauri::WindowEvent::CloseRequested { api, .. },
                    ..
                } => {
                    api.prevent_close();
                    let _ = app.emit("workspace-before-exit", ());
                }
                _ => {}
            }
        });
}
