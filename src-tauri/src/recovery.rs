use crate::workspace::Snapshot;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct RecoveryDraft {
    pub root: String,
    pub document: Snapshot,
}

#[cfg(any(target_os = "ios", test))]
pub fn store(directory: &std::path::Path, draft: &RecoveryDraft) -> Result<(), String> {
    use std::io::Write;
    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let data = serde_json::to_vec(draft).map_err(|e| e.to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
    temp.write_all(&data).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(directory.join("recovery.json"))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(any(target_os = "ios", test))]
pub fn load(directory: &std::path::Path) -> Result<Option<RecoveryDraft>, String> {
    match std::fs::read(directory.join("recovery.json")) {
        Ok(data) => serde_json::from_slice(&data)
            .map(Some)
            .map_err(|e| format!("Could not read the recovery draft: {e}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Could not read the recovery draft: {error}")),
    }
}

#[cfg(any(target_os = "ios", test))]
pub fn clear(directory: &std::path::Path) -> Result<(), String> {
    match std::fs::remove_file(directory.join("recovery.json")) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not clear the recovery draft: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recovery_preserves_exact_text_across_reloads_and_can_be_cleared() {
        let dir = tempfile::tempdir().unwrap();
        let mut draft = RecoveryDraft {
            root: "/original/folder".into(),
            document: Snapshot {
                path: "Notes/draft.md".into(),
                name: "draft.md".into(),
                markdown: "#   Keep spacing\r\n\nUnfinished 🐕\0".into(),
                version: "original-version".into(),
            },
        };
        assert!(load(dir.path()).unwrap().is_none());
        store(dir.path(), &draft).unwrap();
        let restored = load(dir.path()).unwrap().unwrap();
        assert_eq!(restored.root, draft.root);
        assert_eq!(restored.document.path, draft.document.path);
        assert_eq!(restored.document.markdown, draft.document.markdown);
        assert_eq!(restored.document.version, draft.document.version);
        draft.document.markdown = "Newer unsaved text".into();
        store(dir.path(), &draft).unwrap();
        assert_eq!(
            load(dir.path()).unwrap().unwrap().document.markdown,
            "Newer unsaved text"
        );
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
        clear(dir.path()).unwrap();
        clear(dir.path()).unwrap();
        assert!(load(dir.path()).unwrap().is_none());
    }

    #[test]
    fn invalid_recovery_is_reported_and_left_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let data = b"Incomplete recovery data";
        std::fs::write(dir.path().join("recovery.json"), data).unwrap();
        assert!(load(dir.path()).is_err());
        assert_eq!(
            std::fs::read(dir.path().join("recovery.json")).unwrap(),
            data
        );
    }
}
