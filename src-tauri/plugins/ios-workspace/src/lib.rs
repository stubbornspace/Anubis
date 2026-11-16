use serde::Deserialize;
use std::path::{Path, PathBuf};
use tauri::{
    Manager, Runtime,
    plugin::{Builder, PluginHandle, TauriPlugin},
};

tauri::ios_plugin_binding!(init_plugin_ios_workspace);

pub struct IosWorkspace<R: Runtime>(PluginHandle<R>);

#[derive(Deserialize)]
struct FolderResponse {
    path: Option<PathBuf>,
}

impl<R: Runtime> IosWorkspace<R> {
    pub fn folder(&self, restore: bool) -> Result<Option<PathBuf>, String> {
        self.0
            .run_mobile_plugin::<FolderResponse>(
                if restore {
                    "restoreFolder"
                } else {
                    "chooseFolder"
                },
                serde_json::json!({}),
            )
            .map(|response| response.path)
            .map_err(|e| e.to_string())
    }

    pub fn commit(&self, path: &Path) -> Result<(), String> {
        self.call("commitFolder", serde_json::json!({ "path": path }))
    }

    pub fn cancel(&self) {
        let _ = self.call("cancelFolder", serde_json::json!({}));
    }

    pub fn finish_background_save(&self) -> Result<(), String> {
        self.call("finishBackgroundSave", serde_json::json!({}))
    }

    pub fn share_file(&self, path: &Path) -> Result<(), String> {
        self.call("shareFile", serde_json::json!({"path": path}))
    }

    pub fn set_appearance(&self, dark: bool) -> Result<(), String> {
        self.call("setAppearance", serde_json::json!({"dark": dark}))
    }

    fn call(&self, command: &str, payload: serde_json::Value) -> Result<(), String> {
        self.0
            .run_mobile_plugin::<serde_json::Value>(command, payload)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("ios-workspace")
        .setup(|app, api| {
            let handle = api.register_ios_plugin(init_plugin_ios_workspace)?;
            app.manage(IosWorkspace(handle));
            Ok(())
        })
        .build()
}
