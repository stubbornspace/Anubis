use crate::apple::{self, Access, Cloud};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
};

const MAX_BYTES: u64 = 10 * 1024 * 1024;
const MAX_ENTRIES: usize = 20_000;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub directory: bool,
    pub children: Vec<Entry>,
    #[serde(default)]
    pub cloud: Option<Cloud>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Snapshot {
    pub path: String,
    pub name: String,
    pub markdown: String,
    pub version: String,
    #[serde(default)]
    pub cloud: Option<Cloud>,
}
#[derive(Serialize)]
pub struct Listing {
    pub root: String,
    pub name: String,
    pub entries: Vec<Entry>,
    pub warnings: Vec<String>,
}
pub fn supported(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|s| s.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("md" | "markdown" | "mdown" | "txt")
    )
}
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}
// Never follow symlinks, or allow frontend-supplied paths to escape the chosen root.
pub fn resolve(root: &Path, path: &str) -> Result<PathBuf, String> {
    let mut result = root.to_path_buf();
    let parts: Vec<_> = Path::new(path).components().collect();
    for (index, part) in parts.iter().enumerate() {
        match part {
            Component::Normal(name) => result.push(name),
            _ => return Err("Invalid workspace path.".into()),
        }
        let metadata = match fs::symlink_metadata(&result) {
            Ok(metadata) => metadata,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound && index + 1 == parts.len() => {
                let stub = result.with_file_name(format!(
                    ".{}.icloud",
                    result.file_name().unwrap().to_string_lossy()
                ));
                if fs::symlink_metadata(&stub)
                    .is_ok_and(|m| m.is_file() && !m.file_type().is_symlink())
                    && apple::placeholder(&stub)
                {
                    return Ok(result);
                }
                return Err(error(e));
            }
            Err(e) => return Err(error(e)),
        };
        if metadata.file_type().is_symlink() {
            return Err("Symbolic links are not supported.".into());
        }
    }
    if !result
        .canonicalize()
        .map_err(error)?
        .starts_with(root.canonicalize().map_err(error)?)
    {
        return Err("Path is outside the selected folder.".into());
    }
    Ok(result)
}
pub fn listing(root: &Path) -> Result<Listing, String> {
    apple::coordinate(root, None, Access::Metadata, || listing_inner(root))
}
fn listing_inner(root: &Path) -> Result<Listing, String> {
    let mut count = 0;
    let mut warnings = Vec::new();
    let entries = scan(root, root, 0, &mut count, &mut warnings)?;
    Ok(Listing {
        root: root.to_string_lossy().into(),
        name: root
            .file_name()
            .unwrap_or(root.as_os_str())
            .to_string_lossy()
            .into(),
        entries,
        warnings,
    })
}
fn scan(
    root: &Path,
    dir: &Path,
    depth: usize,
    count: &mut usize,
    warnings: &mut Vec<String>,
) -> Result<Vec<Entry>, String> {
    if depth > 64 {
        return Err("Folder nesting is too deep. Choose a smaller folder.".into());
    }
    let mut entries = Vec::new();
    for item in fs::read_dir(dir).map_err(error)? {
        let item = match item {
            Ok(i) => i,
            Err(e) => {
                warnings.push(error(e));
                continue;
            }
        };
        *count += 1;
        if *count > MAX_ENTRIES {
            return Err(
                "This folder has more than 20,000 entries. Choose a smaller folder.".into(),
            );
        }
        let mut name = match item.file_name().into_string() {
            Ok(n) => n,
            Err(_) => {
                warnings.push("Skipped a filename that is not UTF-8.".into());
                continue;
            }
        };
        let placeholder = name.starts_with('.')
            && name.ends_with(".icloud")
            && item.file_type().map_err(error)?.is_file()
            && apple::placeholder(&item.path());
        if placeholder {
            name = name[1..name.len() - 7].to_string();
        } else if name.starts_with('.') {
            continue;
        }
        let kind = item.file_type().map_err(error)?;
        if kind.is_symlink() {
            continue;
        }
        let path = if placeholder {
            dir.join(&name)
        } else {
            item.path()
        };
        if kind.is_dir() {
            let children = match scan(root, &path, depth + 1, count, warnings) {
                Ok(children) => children,
                Err(e) if *count > MAX_ENTRIES || depth >= 64 => return Err(e),
                Err(e) => {
                    warnings.push(format!("{}: {e}", relative(root, &path)));
                    Vec::new()
                }
            };
            entries.push(Entry {
                path: relative(root, &path),
                name,
                directory: true,
                children,
                cloud: None,
            });
        } else if kind.is_file() && supported(&path) {
            entries.push(Entry {
                path: relative(root, &path),
                name,
                directory: false,
                children: Vec::new(),
                cloud: apple::cloud(&path)?.or(if placeholder {
                    apple::cloud(&item.path())?
                } else {
                    None
                }),
            });
        }
    }
    entries.sort_by(|a, b| {
        b.directory
            .cmp(&a.directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(entries)
}
fn bytes(path: &Path) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path).map_err(error)?;
    if !metadata.is_file() || !supported(path) {
        return Err("Select a Markdown or text file.".into());
    }
    if metadata.len() > MAX_BYTES {
        return Err("This file is larger than the 10 MB editing limit.".into());
    }
    let data = fs::read(path).map_err(error)?;
    if data.len() as u64 > MAX_BYTES {
        return Err("This file is larger than the 10 MB editing limit.".into());
    }
    Ok(data)
}
fn snapshot(root: &Path, path: &Path, data: &[u8]) -> Result<Snapshot, String> {
    let text = std::str::from_utf8(data).map_err(|_| "This file is not UTF-8 text.".to_string())?;
    if text.contains('\0') {
        return Err("This file contains binary data.".into());
    }
    Ok(Snapshot {
        path: relative(root, path),
        name: path.file_name().unwrap().to_string_lossy().into(),
        markdown: text.trim_start_matches('\u{feff}').into(),
        version: blake3::hash(data).to_hex().to_string(),
        cloud: apple::cloud(path)?.or(apple::cloud(path.parent().unwrap())?),
    })
}
pub fn read(root: &Path, path: &str) -> Result<Snapshot, String> {
    let target = resolve(root, path)?;
    apple::coordinate(&target, None, Access::Read, || {
        let path = resolve(root, path)?;
        snapshot(root, &path, &bytes(&path)?)
    })
}
fn verify(data: &[u8], version: &str) -> Result<(), String> {
    if blake3::hash(data).to_hex().as_str() != version {
        return Err("This file changed outside Anubis. Your edits are still here. Reload the disk version or save your edits as a copy.".into());
    }
    Ok(())
}
pub fn save(root: &Path, path: &str, markdown: &str, version: &str) -> Result<Snapshot, String> {
    let target = resolve(root, path)?;
    apple::coordinate(&target, None, Access::Replace, || {
        save_inner(root, path, markdown, version)
    })
}
fn save_inner(root: &Path, path: &str, markdown: &str, version: &str) -> Result<Snapshot, String> {
    let path = resolve(root, path)?;
    if fs::metadata(&path).map_err(error)?.permissions().readonly() {
        return Err("This file is read-only. Save your edits as a copy.".into());
    }
    ensure_no_cloud_conflicts(&path)?;
    let original = bytes(&path)?;
    verify(&original, version)?;
    let old = std::str::from_utf8(&original).map_err(error)?;
    let mut text = markdown
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n");
    if old.contains("\r\n") {
        text = text.replace('\n', "\r\n");
    }
    if old.starts_with('\u{feff}') {
        text.insert(0, '\u{feff}');
    }
    if text.len() as u64 > MAX_BYTES {
        return Err("Document exceeds the 10 MB editing limit.".into());
    }
    let saved = pending_upload(snapshot(root, &path, text.as_bytes())?);
    // A same-directory temporary file keeps a failed write from truncating the original.
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().unwrap()).map_err(error)?;
    temp.as_file()
        .set_permissions(fs::metadata(&path).map_err(error)?.permissions())
        .map_err(error)?;
    temp.write_all(text.as_bytes()).map_err(error)?;
    temp.as_file().sync_all().map_err(error)?;
    verify(&bytes(&path)?, version)?;
    temp.persist(&path).map_err(error)?;
    Ok(saved)
}
fn validate_name(name: &str, file: bool) -> Result<(), String> {
    if name.trim() != name
        || name.is_empty()
        || name.starts_with('.')
        || name.contains(['/', '\\', '\0', ':', '*', '?', '"', '<', '>', '|'])
        || name.ends_with('.')
        || name.chars().any(char::is_control)
    {
        return Err(
            "Use a name without path separators, leading dots, or special characters.".into(),
        );
    }
    if file && !supported(Path::new(name)) {
        return Err("Use .md, .markdown, .mdown, or .txt as the file extension.".into());
    }
    Ok(())
}
pub fn create(root: &Path, parent: &str, name: &str, markdown: &str) -> Result<Snapshot, String> {
    validate_name(name, true)?;
    let target = resolve(root, parent)?.join(name);
    apple::coordinate(&target, None, Access::Create, || {
        create_inner(root, parent, name, markdown)
    })
}
fn create_inner(root: &Path, parent: &str, name: &str, markdown: &str) -> Result<Snapshot, String> {
    validate_name(name, true)?;
    if markdown.len() as u64 > MAX_BYTES {
        return Err("Document exceeds the 10 MB editing limit.".into());
    }
    let parent = resolve(root, parent)?;
    if !parent.is_dir() {
        return Err("Select a folder.".into());
    }
    let target = parent.join(name);
    let created = pending_upload(snapshot(root, &target, markdown.as_bytes())?);
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(error)?;
    temp.write_all(markdown.as_bytes()).map_err(error)?;
    temp.as_file().sync_all().map_err(error)?;
    temp.persist_noclobber(&target)
        .map_err(|e| format!("Could not create {name}: {}", e.error))?;
    Ok(created)
}
pub fn create_folder(root: &Path, parent: &str, name: &str) -> Result<(), String> {
    validate_name(name, false)?;
    let target = resolve(root, parent)?.join(name);
    apple::coordinate(&target, None, Access::Create, || {
        fs::create_dir(resolve(root, parent)?.join(name)).map_err(error)
    })
}
#[cfg(any(target_os = "macos", target_os = "ios"))]
fn rename_noclobber(source: &Path, dest: &Path) -> Result<(), String> {
    use rustix::fs::{CWD, RenameFlags, renameat_with};
    // RENAME_EXCL also permits case-only renames on case-insensitive APFS.
    renameat_with(CWD, source, CWD, dest, RenameFlags::NOREPLACE).map_err(error)
}
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn rename_noclobber(source: &Path, dest: &Path) -> Result<(), String> {
    // hard_link creates a new directory entry without ever replacing an existing file.
    fs::hard_link(source, dest).map_err(error)?;
    if let Err(e) = fs::remove_file(source) {
        let _ = fs::remove_file(dest);
        return Err(error(e));
    }
    Ok(())
}
pub fn rename(root: &Path, path: &str, name: &str, version: &str) -> Result<Snapshot, String> {
    validate_name(name, true)?;
    let source = resolve(root, path)?;
    let destination = source.parent().unwrap().join(name);
    if source == destination {
        return apple::coordinate(&source, None, Access::Read, || {
            rename_inner(root, path, name, version)
        });
    }
    apple::coordinate(&source, Some(&destination), Access::Move, || {
        rename_inner(root, path, name, version)
    })
}
fn rename_inner(root: &Path, path: &str, name: &str, version: &str) -> Result<Snapshot, String> {
    validate_name(name, true)?;
    let source = resolve(root, path)?;
    ensure_no_cloud_conflicts(&source)?;
    let data = bytes(&source)?;
    verify(&data, version)?;
    let dest = source.parent().unwrap().join(name);
    if source == dest {
        return snapshot(root, &source, &data);
    }
    let renamed = pending_upload(snapshot(root, &dest, &data)?);
    rename_noclobber(&source, &dest).map_err(|e| format!("Could not rename to {name}: {e}"))?;
    Ok(renamed)
}
pub fn delete_with(
    root: &Path,
    path: &str,
    version: &str,
    trash: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let target = resolve(root, path)?;
    apple::coordinate(&target, None, Access::Delete, || {
        let path = resolve(root, path)?;
        ensure_no_cloud_conflicts(&path)?;
        verify(&bytes(&path)?, version)?;
        trash(&path)
    })
}
pub fn delete(root: &Path, path: &str, version: &str) -> Result<(), String> {
    delete_with(root, path, version, |path| {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        return apple::trash(path);
        #[cfg(not(any(target_os = "macos", target_os = "ios")))]
        trash::delete(path).map_err(error)
    })
}

fn pending_upload(mut snapshot: Snapshot) -> Snapshot {
    if let Some(cloud) = &mut snapshot.cloud {
        cloud.uploaded = false;
        cloud.downloaded = true;
    }
    snapshot
}
fn ensure_no_cloud_conflicts(path: &Path) -> Result<(), String> {
    if apple::cloud(path)?.is_some_and(|cloud| cloud.conflicts > 0) {
        return Err("iCloud has competing versions of this file. Keep both versions before changing or deleting it.".into());
    }
    Ok(())
}
pub fn cloud_status(root: &Path, path: &str) -> Result<Option<Cloud>, String> {
    let target = resolve(root, path)?;
    apple::coordinate(&target, None, Access::Metadata, || {
        apple::cloud(&resolve(root, path)?)
    })
}
pub fn keep_cloud_versions(root: &Path, path: &str) -> Result<(), String> {
    let target = resolve(root, path)?;
    apple::coordinate(&target, None, Access::Replace, || {
        apple::keep_versions(&resolve(root, path)?)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn root() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }
    // Explicit opt-in: only our temporary directory inside the supplied iCloud
    // test folder is touched. Normal tests never access personal cloud storage.
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "requires ANUBIS_ICLOUD_TEST_ROOT pointing to an iCloud Drive test folder"]
    fn real_icloud_folder_round_trip() {
        let parent = std::env::var("ANUBIS_ICLOUD_TEST_ROOT").expect("Set ANUBIS_ICLOUD_TEST_ROOT");
        let directory = tempfile::Builder::new()
            .prefix("Anubis-Validation-")
            .tempdir_in(parent)
            .unwrap();
        let root = directory.path();
        let doc = create(root, "", "cloud.md", "# From Mac\n").unwrap();
        assert!(
            doc.cloud.is_some(),
            "The test folder must be in iCloud Drive"
        );
        assert!(
            !doc.cloud.unwrap().uploaded,
            "A new save must not claim confirmed upload"
        );
        let read_back = read(root, "cloud.md").unwrap();
        assert!(read_back.cloud.is_some());
        let saved = save(root, "cloud.md", "# Updated on Mac\n", &read_back.version).unwrap();
        assert!(save(root, "cloud.md", "stale overwrite", &read_back.version).is_err());
        let renamed = rename(root, "cloud.md", "renamed.md", &saved.version).unwrap();
        assert_eq!(listing(root).unwrap().entries[0].name, "renamed.md");
        assert_eq!(
            read(root, "renamed.md").unwrap().markdown,
            "# Updated on Mac\n"
        );
        keep_cloud_versions(root, "renamed.md").unwrap();
        delete(root, "renamed.md", &renamed.version).unwrap();
        assert!(listing(root).unwrap().entries.is_empty());
    }
    #[test]
    fn reading_and_cloud_inspection_do_not_rewrite_local_documents() {
        let d = root();
        let r = d.path();
        let text = "\u{feff}#   Exact spacing\r\n";
        fs::write(r.join("note.md"), text).unwrap();
        let modified = fs::metadata(r.join("note.md")).unwrap().modified().unwrap();
        assert!(cloud_status(r, "note.md").unwrap().is_none());
        keep_cloud_versions(r, "note.md").unwrap();
        read(r, "note.md").unwrap();
        assert_eq!(fs::read_to_string(r.join("note.md")).unwrap(), text);
        assert_eq!(
            fs::metadata(r.join("note.md")).unwrap().modified().unwrap(),
            modified
        );
        assert_eq!(fs::read_dir(r).unwrap().count(), 1);
    }
    #[test]
    fn fake_icloud_placeholders_are_not_exposed_or_opened() {
        let d = root();
        fs::write(d.path().join(".note.md.icloud"), "not an iCloud file").unwrap();
        assert!(listing(d.path()).unwrap().entries.is_empty());
        assert!(read(d.path(), "note.md").is_err());
        assert!(cloud_status(d.path(), "note.md").is_err());
        assert!(keep_cloud_versions(d.path(), "../note.md").is_err());
    }
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    #[test]
    fn file_presenter_reports_coordinated_workspace_changes() {
        let d = root();
        let (sender, receiver) = std::sync::mpsc::channel();
        let _presenter = apple::Presenter::new(d.path(), move || {
            let _ = sender.send(());
        })
        .unwrap();
        create(d.path(), "", "announced.md", "A coordinated creation").unwrap();
        receiver
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("No file-presenter notification");
    }
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    #[test]
    fn coordinated_writers_never_overwrite_a_competing_save() {
        use std::sync::{Arc, Barrier};
        let d = root();
        let doc = create(d.path(), "", "note.md", "original").unwrap();
        let start = Arc::new(Barrier::new(2));
        let writers: Vec<_> = ["first", "second"]
            .into_iter()
            .map(|text| {
                let r = d.path().to_path_buf();
                let version = doc.version.clone();
                let start = start.clone();
                std::thread::spawn(move || {
                    start.wait();
                    save(&r, "note.md", text, &version)
                })
            })
            .collect();
        let results: Vec<_> = writers.into_iter().map(|w| w.join().unwrap()).collect();
        assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
        let saved = results.into_iter().find_map(Result::ok).unwrap();
        assert_eq!(read(d.path(), "note.md").unwrap().markdown, saved.markdown);
    }
    #[test]
    fn discovers_supported_files_recursively() {
        let d = root();
        let r = d.path();
        fs::create_dir(r.join("Notes")).unwrap();
        fs::create_dir(r.join("Empty")).unwrap();
        fs::write(r.join("Notes/a.MD"), "# A").unwrap();
        fs::write(r.join("b.txt"), "B").unwrap();
        fs::write(r.join("c.png"), "no").unwrap();
        fs::write(r.join(".secret.md"), "hidden").unwrap();
        let l = listing(r).unwrap();
        assert_eq!(l.entries.len(), 3);
        assert_eq!(l.entries[1].children[0].path, "Notes/a.MD");
        assert_eq!(l.entries[2].name, "b.txt");
    }
    #[test]
    fn saves_preserve_bom_line_endings_and_reject_stale_versions() {
        let d = root();
        let r = d.path();
        fs::write(r.join("a.md"), "\u{feff}# A\r\n").unwrap();
        let a = read(r, "a.md").unwrap();
        let b = save(r, "a.md", "# B\n", &a.version).unwrap();
        assert_eq!(
            fs::read_to_string(r.join("a.md")).unwrap(),
            "\u{feff}# B\r\n"
        );
        assert!(save(r, "a.md", "Lost", &a.version).is_err());
        assert_eq!(read(r, "a.md").unwrap().version, b.version);
    }
    #[test]
    fn create_and_rename_never_overwrite() {
        let d = root();
        let r = d.path();
        create_folder(r, "", "nested").unwrap();
        let a = create(r, "nested", "a.md", "original").unwrap();
        assert!(create(r, "nested", "a.md", "replacement").is_err());
        create(r, "nested", "b.md", "other").unwrap();
        assert!(rename(r, "nested/a.md", "b.md", &a.version).is_err());
        assert_eq!(read(r, "nested/a.md").unwrap().markdown, "original");
        let renamed = rename(r, "nested/a.md", "new.markdown", &a.version).unwrap();
        assert_eq!(renamed.path, "nested/new.markdown");
        assert!(!r.join("nested/a.md").exists());
    }
    #[test]
    fn rejected_contents_leave_existing_files_and_creation_targets_untouched() {
        let d = root();
        let r = d.path();
        let original = "\u{feff}Original\r\n";
        fs::write(r.join("note.txt"), original).unwrap();
        let doc = read(r, "note.txt").unwrap();
        let oversized = "x".repeat(MAX_BYTES as usize + 1);
        for invalid in ["New\0text", oversized.as_str()] {
            assert!(save(r, "note.txt", invalid, &doc.version).is_err());
            assert_eq!(fs::read_to_string(r.join("note.txt")).unwrap(), original);
            assert_eq!(read(r, "note.txt").unwrap().version, doc.version);
            assert!(create(r, "", "copy.txt", invalid).is_err());
            assert!(!r.join("copy.txt").exists());
        }
        assert_eq!(fs::read_dir(r).unwrap().count(), 1);
    }
    #[test]
    fn case_only_renames_preserve_contents_and_update_the_directory_entry() {
        let d = root();
        let r = d.path();
        let original = "\u{feff}Keep this\r\n";
        fs::write(r.join("note.md"), original).unwrap();
        let doc = read(r, "note.md").unwrap();
        let renamed = rename(r, "note.md", "Note.MD", &doc.version).unwrap();
        assert_eq!(renamed.path, "Note.MD");
        assert_eq!(renamed.version, doc.version);
        assert_eq!(fs::read_to_string(r.join("Note.MD")).unwrap(), original);
        let entries = listing(r).unwrap().entries;
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Note.MD");
        let restored = rename(r, "Note.MD", "note.md", &renamed.version).unwrap();
        assert_eq!(restored.version, doc.version);
        assert_eq!(listing(r).unwrap().entries[0].name, "note.md");
    }
    #[test]
    fn invalid_and_outside_paths_are_rejected() {
        let d = root();
        let r = d.path();
        assert!(read(r, "../outside.md").is_err());
        assert!(read(r, "/etc/passwd").is_err());
        assert!(create(r, "", "../escape.md", "").is_err());
        assert!(create(r, "", "app.exe", "").is_err());
        fs::write(r.join("binary.md"), [0, 255]).unwrap();
        assert!(read(r, "binary.md").is_err());
    }
    #[test]
    fn external_changes_and_deletion_are_not_overwritten() {
        let d = root();
        let r = d.path();
        let a = create(r, "", "a.md", "original").unwrap();
        fs::write(r.join("a.md"), "external").unwrap();
        assert!(save(r, "a.md", "local", &a.version).is_err());
        assert!(rename(r, "a.md", "b.md", &a.version).is_err());
        assert!(delete(r, "a.md", &a.version).is_err());
        fs::remove_file(r.join("a.md")).unwrap();
        assert!(save(r, "a.md", "local", &a.version).is_err());
        assert!(!r.join("a.md").exists());
    }
    #[test]
    fn delegated_trash_checks_paths_and_versions_and_preserves_files_on_failure() {
        let d = root();
        let r = d.path();
        let doc = create(r, "", "note.md", "Keep this").unwrap();
        assert!(
            delete_with(r, "../note.md", &doc.version, |_| panic!(
                "Invalid path reached Trash"
            ))
            .is_err()
        );
        assert!(
            delete_with(r, "note.md", "stale", |_| panic!(
                "Stale version reached Trash"
            ))
            .is_err()
        );
        let result = delete_with(r, "note.md", &doc.version, |path| {
            assert_eq!(path, r.join("note.md"));
            Err("Trash is unavailable".into())
        });
        assert_eq!(result.unwrap_err(), "Trash is unavailable");
        assert_eq!(read(r, "note.md").unwrap().markdown, "Keep this");
    }
    #[test]
    fn rejects_large_files_and_readonly_saves() {
        let d = root();
        let r = d.path();
        let large = fs::File::create(r.join("large.md")).unwrap();
        large.set_len(MAX_BYTES + 1).unwrap();
        assert!(read(r, "large.md").is_err());
        let a = create(r, "", "readonly.md", "keep").unwrap();
        let mut permissions = fs::metadata(r.join("readonly.md")).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(r.join("readonly.md"), permissions).unwrap();
        assert!(save(r, "readonly.md", "lost", &a.version).is_err());
        assert_eq!(read(r, "readonly.md").unwrap().markdown, "keep");
    }
    #[test]
    fn empty_folders_and_unsupported_extension_renames_are_safe() {
        let d = root();
        let r = d.path();
        create_folder(r, "", "Empty").unwrap();
        assert!(create_folder(r, "", "Empty").is_err());
        assert!(listing(r).unwrap().entries[0].children.is_empty());
        let a = create(r, "", "a.txt", "**literal**").unwrap();
        assert!(rename(r, "a.txt", "a.exe", &a.version).is_err());
        assert_eq!(read(r, "a.txt").unwrap().markdown, "**literal**");
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_are_not_followed() {
        let d = root();
        let other = root();
        create(other.path(), "", "outside.md", "outside").unwrap();
        std::os::unix::fs::symlink(other.path(), d.path().join("link")).unwrap();
        assert!(listing(d.path()).unwrap().entries.is_empty());
        assert!(read(d.path(), "link/outside.md").is_err());
        assert!(create(d.path(), "link", "new.md", "").is_err());
    }
}
