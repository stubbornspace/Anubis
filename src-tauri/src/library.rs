//! App-private note library. Document workspaces never use this database.
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_TEXT: usize = 10 * 1024 * 1024;
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn id_valid(id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| "Invalid note identifier.".into())
}
fn validate(markdown: &str, tags: &[String]) -> Result<(), String> {
    if markdown.len() > MAX_TEXT {
        return Err("Notes must be smaller than 10 MB.".into());
    }
    if tags.len() > 1000
        || tags
            .iter()
            .any(|t| t.is_empty() || t.len() > 512 || t.contains(['\n', '\r', '#']))
    {
        return Err("Invalid note tags.".into());
    }
    Ok(())
}
fn title(markdown: &str) -> String {
    markdown
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("Untitled note")
        .trim_start_matches('#')
        .trim()
        .chars()
        .take(200)
        .collect()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub markdown: String,
    pub revision: i64,
    pub created: i64,
    pub updated: i64,
    pub pinned: bool,
    pub archived: bool,
    pub trashed: bool,
    pub tags: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub revision: i64,
    pub created: i64,
    pub updated: i64,
    pub pinned: bool,
    pub archived: bool,
    pub trashed: bool,
    pub tags: Vec<String>,
    pub todo: bool,
    pub thumbnail: Option<String>,
}
impl From<Note> for Summary {
    fn from(n: Note) -> Self {
        Self {
            title: title(&n.markdown),
            excerpt: n
                .markdown
                .lines()
                .skip(1)
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(180)
                .collect(),
            thumbnail: n.markdown.split("anubis-asset:").nth(1).and_then(|s| {
                let id: String = s.chars().take_while(|c| c.is_ascii_hexdigit()).collect();
                (id.len() == 64).then_some(id)
            }),
            todo: n
                .markdown
                .lines()
                .any(|l| l.trim_start().starts_with("- [ ] ")),
            id: n.id,
            revision: n.revision,
            created: n.created,
            updated: n.updated,
            pinned: n.pinned,
            archived: n.archived,
            trashed: n.trashed,
            tags: n.tags,
        }
    }
}
fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    let tags: String = r.get(8)?;
    Ok(Note {
        id: r.get(0)?,
        markdown: r.get(1)?,
        revision: r.get(2)?,
        created: r.get(3)?,
        updated: r.get(4)?,
        pinned: r.get(5)?,
        archived: r.get(6)?,
        trashed: r.get(7)?,
        tags: serde_json::from_str(&tags).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(8, rusqlite::types::Type::Text, Box::new(e))
        })?,
    })
}
pub struct Library {
    db: Connection,
}
impl Library {
    pub fn open(dir: &Path) -> Result<Self, String> {
        fs::create_dir_all(dir).map_err(error)?;
        let db = Connection::open(dir.join("notes.sqlite3")).map_err(error)?;
        db.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(error)?;
        db.execute_batch(
            "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
        )
        .map_err(error)?;
        let version: i64 = db
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(error)?;
        if version > 2 {
            return Err(
                "This library was created by a newer Anubis version. Update Anubis to open it."
                    .into(),
            );
        }
        if version == 0 {
            db.execute_batch("BEGIN IMMEDIATE;
                CREATE TABLE notes(id TEXT PRIMARY KEY, markdown TEXT NOT NULL, revision INTEGER NOT NULL,
                    created INTEGER NOT NULL, updated INTEGER NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
                    archived INTEGER NOT NULL DEFAULT 0, trashed INTEGER NOT NULL DEFAULT 0, tags TEXT NOT NULL);
                CREATE TABLE revisions(note_id TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL,
                    PRIMARY KEY(note_id,revision));
                CREATE TABLE outbox(id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
                CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                PRAGMA user_version=1; COMMIT;").map_err(error)?;
        }
        if version < 2 {
            db.execute_batch("BEGIN IMMEDIATE; CREATE TABLE cloud_records(id TEXT PRIMARY KEY, fields TEXT NOT NULL, snapshot TEXT NOT NULL); PRAGMA user_version=2; COMMIT;").map_err(error)?;
        }
        Ok(Self { db })
    }
    pub fn list(&self) -> Result<Vec<Summary>, String> {
        self.db.prepare("SELECT id,markdown,revision,created,updated,pinned,archived,trashed,tags FROM notes ORDER BY updated DESC")
            .map_err(error)?.query_map([], row).map_err(error)?.map(|r| r.map(Into::into).map_err(error)).collect()
    }
    pub fn search(&self, query: &str) -> Result<Vec<String>, String> {
        if query.len() > 1000 {
            return Err("Search is too long.".into());
        }
        self.db
            .prepare("SELECT id FROM notes WHERE instr(lower(markdown),lower(?)) > 0")
            .map_err(error)?
            .query_map([query], |r| r.get(0))
            .map_err(error)?
            .map(|r| r.map_err(error))
            .collect()
    }
    pub fn read(&self, id: &str) -> Result<Note, String> {
        id_valid(id)?;
        self.db.query_row("SELECT id,markdown,revision,created,updated,pinned,archived,trashed,tags FROM notes WHERE id=?", [id], row).map_err(error)
    }
    pub fn create(&mut self, markdown: String, tags: Vec<String>) -> Result<Note, String> {
        validate(&markdown, &tags)?;
        let n = Note {
            id: uuid::Uuid::new_v4().to_string(),
            markdown,
            tags,
            revision: 1,
            created: now(),
            updated: now(),
            pinned: false,
            archived: false,
            trashed: false,
        };
        let tx = self.db.transaction().map_err(error)?;
        tx.execute(
            "INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?)",
            params![
                n.id,
                n.markdown,
                n.revision,
                n.created,
                n.updated,
                n.pinned,
                n.archived,
                n.trashed,
                serde_json::to_string(&n.tags).map_err(error)?
            ],
        )
        .map_err(error)?;
        tx.execute("INSERT INTO outbox VALUES(?,?)", params![n.id, n.revision])
            .map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(n)
    }
    pub fn save(&mut self, mut n: Note) -> Result<Note, String> {
        id_valid(&n.id)?;
        validate(&n.markdown, &n.tags)?;
        let tx = self
            .db
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(error)?;
        let old = tx.query_row("SELECT id,markdown,revision,created,updated,pinned,archived,trashed,tags FROM notes WHERE id=?", [&n.id], row).map_err(error)?;
        if old.revision != n.revision {
            return Err(
                "This note has a newer version. Save a recovery copy to keep your edits.".into(),
            );
        }
        tx.execute(
            "INSERT INTO revisions VALUES(?,?,?)",
            params![
                old.id,
                old.revision,
                serde_json::to_string(&old).map_err(error)?
            ],
        )
        .map_err(error)?;
        n.revision = n
            .revision
            .checked_add(1)
            .ok_or("Note revision limit reached.")?;
        n.created = old.created;
        n.updated = now();
        tx.execute("UPDATE notes SET markdown=?,revision=?,updated=?,pinned=?,archived=?,trashed=?,tags=? WHERE id=?", params![n.markdown,n.revision,n.updated,n.pinned,n.archived,n.trashed,serde_json::to_string(&n.tags).map_err(error)?,n.id]).map_err(error)?;
        tx.execute("INSERT INTO outbox VALUES(?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision", params![n.id,n.revision]).map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(n)
    }
    pub fn setting(&self, key: &str) -> Result<Option<String>, String> {
        self.db
            .query_row("SELECT value FROM settings WHERE key=?", [key], |r| {
                r.get(0)
            })
            .optional()
            .map_err(error)
    }
    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        self.db.execute("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [key,value]).map_err(error)?;
        Ok(())
    }
}
pub fn store_draft(dir: &Path, note: &Note) -> Result<(), String> {
    id_valid(&note.id)?;
    validate(&note.markdown, &note.tags)?;
    let drafts = dir.join("drafts");
    fs::create_dir_all(&drafts).map_err(error)?;
    let mut file = tempfile::NamedTempFile::new_in(&drafts).map_err(error)?;
    file.write_all(&serde_json::to_vec(note).map_err(error)?)
        .map_err(error)?;
    file.as_file().sync_all().map_err(error)?;
    file.persist(drafts.join(format!("{}.json", note.id)))
        .map_err(error)?;
    Ok(())
}
pub fn drafts(dir: &Path) -> Result<Vec<Note>, String> {
    let path = dir.join("drafts");
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut notes = vec![];
    for entry in fs::read_dir(path).map_err(error)? {
        let path = entry.map_err(error)?.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let n: Note = serde_json::from_slice(&fs::read(path).map_err(error)?).map_err(error)?;
            id_valid(&n.id)?;
            validate(&n.markdown, &n.tags)?;
            notes.push(n);
        }
    }
    Ok(notes)
}
pub fn clear_draft(dir: &Path, id: &str) -> Result<(), String> {
    id_valid(id)?;
    match fs::remove_file(dir.join("drafts").join(format!("{id}.json"))) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(error(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persistence_conflicts_and_trash_keep_content() {
        let d = tempfile::tempdir().unwrap();
        let mut l = Library::open(d.path()).unwrap();
        let n = l
            .create("# Original\n\nText #work".into(), vec!["work".into()])
            .unwrap();
        assert_eq!(l.read(&n.id).unwrap().revision, 1);
        let mut edit = n.clone();
        edit.markdown.push_str(" edited");
        let saved = l.save(edit).unwrap();
        assert!(l.save(n).is_err());
        let mut trash = saved.clone();
        trash.trashed = true;
        l.save(trash).unwrap();
        drop(l);
        let l = Library::open(d.path()).unwrap();
        let read = l.read(&saved.id).unwrap();
        assert!(read.trashed);
        assert_eq!(read.markdown, saved.markdown);
        assert_eq!(l.list().unwrap().len(), 1);
    }
    #[test]
    fn recovery_survives_reopen_and_is_explicitly_cleared() {
        let d = tempfile::tempdir().unwrap();
        let mut l = Library::open(d.path()).unwrap();
        let mut n = l.create("original".into(), vec![]).unwrap();
        n.markdown = "unsaved".into();
        store_draft(d.path(), &n).unwrap();
        drop(l);
        assert_eq!(drafts(d.path()).unwrap()[0].markdown, "unsaved");
        assert_eq!(
            Library::open(d.path())
                .unwrap()
                .read(&n.id)
                .unwrap()
                .markdown,
            "original"
        );
        clear_draft(d.path(), &n.id).unwrap();
        assert!(drafts(d.path()).unwrap().is_empty());
        assert!(clear_draft(d.path(), "../../outside").is_err());
    }
    #[test]
    fn newer_schema_is_never_downgraded() {
        let d = tempfile::tempdir().unwrap();
        let l = Library::open(d.path()).unwrap();
        l.db.execute_batch("PRAGMA user_version=99").unwrap();
        drop(l);
        assert!(Library::open(d.path()).is_err());
    }
}

// Content-addressed immutable assets survive note deletion and conflicts. Cleanup
// must eventually account for revisions, Trash, drafts and unsynced references.
pub fn put_asset(dir: &Path, bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("Images must be smaller than 20 MB.".into());
    }
    image_type(bytes)?;
    let id = blake3::hash(bytes).to_hex().to_string();
    let assets = dir.join("attachments");
    fs::create_dir_all(&assets).map_err(error)?;
    let path = assets.join(&id);
    if !path.exists() {
        let mut f = tempfile::NamedTempFile::new_in(&assets).map_err(error)?;
        f.write_all(bytes).map_err(error)?;
        f.as_file().sync_all().map_err(error)?;
        match f.persist_noclobber(&path) {
            Ok(_) => {}
            Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(error(e)),
        }
    }
    Ok(format!("anubis-asset:{id}"))
}
fn image_type(bytes: &[u8]) -> Result<&'static str, String> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok("image/png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Ok("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Ok("image/gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Ok("image/webp")
    } else {
        Err("Choose a PNG, JPEG, GIF, or WebP image.".into())
    }
}
pub fn asset_bytes(dir: &Path, id: &str) -> Result<Vec<u8>, String> {
    if id.len() != 64 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid attachment identifier.".into());
    }
    let path = dir.join("attachments").join(id);
    if fs::metadata(&path).map_err(error)?.len() > 20 * 1024 * 1024 {
        return Err("Attachment exceeds image size limit.".into());
    }
    let bytes = fs::read(path).map_err(error)?;
    if blake3::hash(&bytes).to_hex().as_str() != id {
        return Err("Attachment integrity check failed.".into());
    }
    image_type(&bytes)?;
    Ok(bytes)
}
pub fn asset_url(dir: &Path, id: &str) -> Result<String, String> {
    use base64::Engine;
    let bytes = asset_bytes(dir, id)?;
    Ok(format!(
        "data:{};base64,{}",
        image_type(&bytes)?,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    format: String,
    version: u32,
    notes: Vec<Note>,
    drafts: Vec<Note>,
    revisions: Vec<Note>,
    pinned_tags: Vec<String>,
    attachments: std::collections::BTreeMap<String, String>,
}
impl Library {
    fn all_notes(&self) -> Result<Vec<Note>, String> {
        self.db.prepare("SELECT id,markdown,revision,created,updated,pinned,archived,trashed,tags FROM notes")
            .map_err(error)?.query_map([],row).map_err(error)?.map(|r|r.map_err(error)).collect()
    }
    pub fn history(&self, id: &str) -> Result<Vec<Note>, String> {
        id_valid(id)?;
        self.db
            .prepare(
                "SELECT snapshot FROM revisions WHERE note_id=? ORDER BY revision DESC LIMIT 100",
            )
            .map_err(error)?
            .query_map([id], |r| r.get::<_, String>(0))
            .map_err(error)?
            .map(|r| serde_json::from_str(&r.map_err(error)?).map_err(error))
            .collect()
    }
    pub fn backup(&self, dir: &Path) -> Result<Vec<u8>, String> {
        use base64::Engine;
        let revisions: Vec<Note> = self
            .db
            .prepare("SELECT snapshot FROM revisions")
            .map_err(error)?
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(error)?
            .map(|r| serde_json::from_str(&r.map_err(error)?).map_err(error))
            .collect::<Result<_, _>>()?;
        let mut attachments = std::collections::BTreeMap::new();
        let assets = dir.join("attachments");
        if assets.exists() {
            for entry in fs::read_dir(assets).map_err(error)? {
                let id = entry
                    .map_err(error)?
                    .file_name()
                    .to_string_lossy()
                    .into_owned();
                if id.len() == 64 {
                    attachments.insert(
                        id.clone(),
                        base64::engine::general_purpose::STANDARD.encode(asset_bytes(dir, &id)?),
                    );
                }
            }
        }
        let pinned_tags = serde_json::from_str(&self.setting("pinnedTags")?.unwrap_or("[]".into()))
            .map_err(error)?;
        serde_json::to_vec(&Backup {
            format: "anubis-library".into(),
            version: 1,
            notes: self.all_notes()?,
            drafts: drafts(dir)?,
            revisions,
            pinned_tags,
            attachments,
        })
        .map_err(error)
    }
    pub fn restore(&mut self, dir: &Path, bytes: &[u8]) -> Result<usize, String> {
        use base64::Engine;
        if bytes.len() > 256 * 1024 * 1024 {
            return Err("Backups larger than 256 MB cannot be imported in this version.".into());
        }
        let backup: Backup = serde_json::from_slice(bytes).map_err(error)?;
        if backup.format != "anubis-library" || backup.version != 1 {
            return Err("Unsupported library backup.".into());
        }
        for n in backup
            .notes
            .iter()
            .chain(&backup.drafts)
            .chain(&backup.revisions)
        {
            id_valid(&n.id)?;
            validate(&n.markdown, &n.tags)?;
        }
        // Validate every attachment before any write. Existing content is never replaced.
        let assets = backup
            .attachments
            .into_iter()
            .map(|(id, encoded)| {
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(encoded)
                    .map_err(error)?;
                if bytes.len() > 20 * 1024 * 1024 || blake3::hash(&bytes).to_hex().as_str() != id {
                    return Err("Invalid backup attachment.".into());
                }
                image_type(&bytes)?;
                Ok(bytes)
            })
            .collect::<Result<Vec<_>, String>>()?;
        for bytes in assets {
            put_asset(dir, &bytes)?;
        }
        let tx = self.db.transaction().map_err(error)?;
        let mut mappings = std::collections::HashMap::new();
        for n in &backup.notes {
            let id = uuid::Uuid::new_v4().to_string();
            mappings.insert(n.id.clone(), id.clone());
            tx.execute(
                "INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?)",
                params![
                    id,
                    n.markdown,
                    n.revision,
                    n.created,
                    n.updated,
                    n.pinned,
                    n.archived,
                    n.trashed,
                    serde_json::to_string(&n.tags).map_err(error)?
                ],
            )
            .map_err(error)?;
            tx.execute("INSERT INTO outbox VALUES(?,?)", params![id, n.revision])
                .map_err(error)?;
        }
        for mut n in backup.revisions {
            if let Some(id) = mappings.get(&n.id) {
                n.id = id.clone();
                tx.execute(
                    "INSERT INTO revisions VALUES(?,?,?)",
                    params![n.id, n.revision, serde_json::to_string(&n).map_err(error)?],
                )
                .map_err(error)?;
            }
        }
        // Recovered drafts are separate notes in an import, so restoring a backup
        // never replaces a current unsaved draft or requires destructive merging.
        for n in &backup.drafts {
            let id = uuid::Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?)",
                params![
                    id,
                    n.markdown,
                    1,
                    n.created,
                    now(),
                    false,
                    false,
                    false,
                    serde_json::to_string(&n.tags).map_err(error)?
                ],
            )
            .map_err(error)?;
            tx.execute("INSERT INTO outbox VALUES(?,1)", [id])
                .map_err(error)?;
        }
        let mut pinned: Vec<String> = tx
            .query_row(
                "SELECT value FROM settings WHERE key='pinnedTags'",
                [],
                |r| r.get::<_, String>(0),
            )
            .optional()
            .map_err(error)?
            .map(|s| serde_json::from_str(&s))
            .transpose()
            .map_err(error)?
            .unwrap_or_default();
        for tag in backup.pinned_tags {
            if !pinned.contains(&tag) {
                pinned.push(tag)
            }
        }
        tx.execute("INSERT INTO settings VALUES('pinnedTags',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[serde_json::to_string(&pinned).map_err(error)?]).map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(backup.notes.len() + backup.drafts.len())
    }
    pub fn markdown_zip(&self, dir: &Path, id: &str) -> Result<Vec<u8>, String> {
        use std::io::Cursor;
        let note = self.read(id)?;
        let mut markdown = note.markdown;
        let mut assets = std::collections::BTreeSet::new();
        for piece in markdown.split("anubis-asset:").skip(1) {
            let id: String = piece
                .chars()
                .take_while(|c| c.is_ascii_hexdigit())
                .collect();
            if id.len() == 64 {
                assets.insert(id);
            }
        }
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for id in assets {
            let bytes = asset_bytes(dir, &id)?;
            let ext = match image_type(&bytes)? {
                "image/png" => "png",
                "image/jpeg" => "jpg",
                "image/gif" => "gif",
                _ => "webp",
            };
            let path = format!("attachments/{id}.{ext}");
            markdown = markdown.replace(&format!("anubis-asset:{id}"), &path);
            zip.start_file(path, options).map_err(error)?;
            zip.write_all(&bytes).map_err(error)?;
        }
        zip.start_file("note.md", options).map_err(error)?;
        zip.write_all(markdown.as_bytes()).map_err(error)?;
        Ok(zip.finish().map_err(error)?.into_inner())
    }
}

#[derive(Serialize, Deserialize)]
pub struct CloudRecord {
    pub note: Note,
    pub fields: String,
    pub assets: std::collections::BTreeMap<String, String>,
}
impl Library {
    pub fn pending(&self) -> Result<Vec<Note>, String> {
        self.db.prepare("SELECT n.id,n.markdown,n.revision,n.created,n.updated,n.pinned,n.archived,n.trashed,n.tags FROM notes n JOIN outbox o ON n.id=o.id ORDER BY n.updated LIMIT 5")
            .map_err(error)?.query_map([],row).map_err(error)?.map(|r|r.map_err(error)).collect()
    }
    pub fn cloud_fields(&self, id: &str) -> Result<String, String> {
        Ok(self
            .db
            .query_row("SELECT fields FROM cloud_records WHERE id=?", [id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(error)?
            .unwrap_or_default())
    }
    pub fn bind_account(&self, account: &str) -> Result<(), String> {
        if account.is_empty() {
            return Err("Sign in to iCloud to sync your notes.".into());
        }
        if let Some(previous) = self.setting("cloudAccount")? {
            if previous != account {
                return Err("The iCloud account has changed. Sync is paused to keep this library separate. Sign back into the original account; your local notes are preserved.".into());
            }
        } else {
            self.set_setting("cloudAccount", account)?;
        }
        Ok(())
    }
    pub fn apply_cloud(
        &mut self,
        dir: &Path,
        records: Vec<CloudRecord>,
        token: &str,
        deleted: &[String],
    ) -> Result<usize, String> {
        use base64::Engine;
        if !deleted.is_empty() {
            return Err("Notes were permanently removed from the cloud outside Anubis. Sync is paused; local notes have been preserved.".into());
        }
        for record in &records {
            id_valid(&record.note.id)?;
            validate(&record.note.markdown, &record.note.tags)?;
            for (id, encoded) in &record.assets {
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(encoded)
                    .map_err(error)?;
                if blake3::hash(&bytes).to_hex().as_str() != id {
                    return Err("A downloaded image failed its integrity check.".into());
                }
                put_asset(dir, &bytes)?;
            }
        }
        let tx = self
            .db
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(error)?;
        let mut conflicts = 0;
        for record in records {
            let incoming = serde_json::to_string(&record.note).map_err(error)?;
            let prior: Option<String> = tx
                .query_row(
                    "SELECT snapshot FROM cloud_records WHERE id=?",
                    [&record.note.id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(error)?;
            let local=tx.query_row("SELECT id,markdown,revision,created,updated,pinned,archived,trashed,tags FROM notes WHERE id=?",[&record.note.id],row).optional().map_err(error)?;
            let pending: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM outbox WHERE id=?)",
                    [&record.note.id],
                    |r| r.get(0),
                )
                .map_err(error)?;
            let identical = local
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(error)?
                .as_ref()
                == Some(&incoming);
            // Repeated fetches of our known base never replace newer local edits.
            let unchanged = prior.as_ref() == Some(&incoming);
            if !unchanged && !identical {
                let mut n = record.note.clone();
                if let Some(old) = local {
                    tx.execute(
                        "INSERT OR IGNORE INTO revisions VALUES(?,?,?)",
                        params![
                            old.id,
                            old.revision,
                            serde_json::to_string(&old).map_err(error)?
                        ],
                    )
                    .map_err(error)?;
                    if pending {
                        let copy_id = uuid::Uuid::new_v4().to_string();
                        let copy_text = format!("# Conflict copy\n\n{}", old.markdown);
                        tx.execute(
                            "INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?)",
                            params![
                                copy_id,
                                copy_text,
                                1,
                                old.created,
                                now(),
                                old.pinned,
                                false,
                                false,
                                serde_json::to_string(&old.tags).map_err(error)?
                            ],
                        )
                        .map_err(error)?;
                        tx.execute("INSERT INTO outbox VALUES(?,1)", [copy_id])
                            .map_err(error)?;
                        conflicts += 1;
                    }
                    n.revision = old
                        .revision
                        .checked_add(1)
                        .ok_or("Note revision limit reached.")?;
                }
                tx.execute("INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET markdown=excluded.markdown,revision=excluded.revision,created=excluded.created,updated=excluded.updated,pinned=excluded.pinned,archived=excluded.archived,trashed=excluded.trashed,tags=excluded.tags",
                    params![n.id,n.markdown,n.revision,n.created,n.updated,n.pinned,n.archived,n.trashed,serde_json::to_string(&n.tags).map_err(error)?]).map_err(error)?;
                tx.execute("DELETE FROM outbox WHERE id=?", [&n.id])
                    .map_err(error)?;
            } else if identical {
                tx.execute("DELETE FROM outbox WHERE id=?", [&record.note.id])
                    .map_err(error)?;
            }
            tx.execute("INSERT INTO cloud_records VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET fields=excluded.fields,snapshot=excluded.snapshot",params![record.note.id,record.fields,incoming]).map_err(error)?;
        }
        tx.execute("INSERT INTO settings VALUES('cloudToken',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[token]).map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(conflicts)
    }
    pub fn acknowledge(&mut self, note: &Note, fields: &str) -> Result<(), String> {
        let tx = self.db.transaction().map_err(error)?;
        tx.execute("INSERT INTO cloud_records VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET fields=excluded.fields,snapshot=excluded.snapshot",params![note.id,fields,serde_json::to_string(note).map_err(error)?]).map_err(error)?;
        tx.execute(
            "DELETE FROM outbox WHERE id=? AND revision=?",
            params![note.id, note.revision],
        )
        .map_err(error)?;
        tx.commit().map_err(error)
    }
}

#[cfg(test)]
mod library_transfer_tests {
    use super::*;
    #[test]
    fn backups_preserve_images_revisions_and_import_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = Library::open(dir.path()).unwrap();
        let bytes = b"\x89PNG\r\n\x1a\nexample";
        let asset = put_asset(dir.path(), bytes).unwrap();
        let mut note = db
            .create(format!("# Image\n\n![example]({asset})"), vec![])
            .unwrap();
        note.markdown.push_str("\nchanged");
        let note = db.save(note).unwrap();
        let backup = db.backup(dir.path()).unwrap();
        assert_eq!(db.restore(dir.path(), &backup).unwrap(), 1);
        assert_eq!(db.list().unwrap().len(), 2);
        assert_eq!(db.read(&note.id).unwrap().markdown, note.markdown);
        assert_eq!(db.history(&note.id).unwrap().len(), 1);
        let zip = db.markdown_zip(dir.path(), &note.id).unwrap();
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(zip)).unwrap();
        let mut markdown = String::new();
        std::io::Read::read_to_string(&mut zip.by_name("note.md").unwrap(), &mut markdown).unwrap();
        assert!(markdown.contains("attachments/"));
        assert!(!markdown.contains("anubis-asset:"));
        assert!(asset_bytes(dir.path(), "../outside").is_err());
        assert!(put_asset(dir.path(), b"<svg>script</svg>").is_err());
    }
    #[test]
    fn malformed_backup_is_rejected_before_note_mutation() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = Library::open(dir.path()).unwrap();
        db.create("keep".into(), vec![]).unwrap();
        let mut backup: serde_json::Value =
            serde_json::from_slice(&db.backup(dir.path()).unwrap()).unwrap();
        backup["notes"][0]["id"] = serde_json::json!("../bad");
        assert!(
            db.restore(dir.path(), &serde_json::to_vec(&backup).unwrap())
                .is_err()
        );
        assert_eq!(db.list().unwrap().len(), 1);
    }
    #[test]
    fn sync_conflicts_preserve_local_text_and_acknowledge_only_sent_revision() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = Library::open(dir.path()).unwrap();
        let base = db.create("base".into(), vec![]).unwrap();
        db.acknowledge(&base, "fields1").unwrap();
        let mut local = base.clone();
        local.markdown = "local edit".into();
        let local = db.save(local).unwrap();
        let mut remote = base.clone();
        remote.markdown = "remote edit".into();
        remote.revision += 1;
        let conflicts = db
            .apply_cloud(
                dir.path(),
                vec![CloudRecord {
                    note: remote,
                    fields: "fields2".into(),
                    assets: Default::default(),
                }],
                "token",
                &[],
            )
            .unwrap();
        assert_eq!(conflicts, 1);
        assert_eq!(db.read(&base.id).unwrap().markdown, "remote edit");
        assert!(
            db.all_notes()
                .unwrap()
                .iter()
                .any(|n| n.markdown.contains("local edit"))
        );
        assert_eq!(db.history(&base.id).unwrap()[0].markdown, "local edit");
        let copy = db.pending().unwrap().pop().unwrap();
        let mut edited = copy.clone();
        edited.markdown.push_str(" again");
        db.save(edited).unwrap();
        db.acknowledge(&copy, "ack").unwrap();
        assert!(!db.pending().unwrap().is_empty());
        assert!(db.bind_account("account1").is_ok());
        assert!(db.bind_account("account2").is_err());
        assert_eq!(db.setting("cloudAccount").unwrap().unwrap(), "account1");
        assert_eq!(local.revision, 2);
    }
    #[test]
    fn repeated_cloud_base_does_not_erase_pending_edits_and_deletion_pauses_sync() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = Library::open(dir.path()).unwrap();
        let base = db.create("base".into(), vec![]).unwrap();
        db.acknowledge(&base, "fields").unwrap();
        let mut local = base.clone();
        local.markdown = "new edit".into();
        db.save(local).unwrap();
        assert_eq!(
            db.apply_cloud(
                dir.path(),
                vec![CloudRecord {
                    note: base.clone(),
                    fields: "fields".into(),
                    assets: Default::default()
                }],
                "next",
                &[]
            )
            .unwrap(),
            0
        );
        assert_eq!(db.read(&base.id).unwrap().markdown, "new edit");
        assert_eq!(db.pending().unwrap().len(), 1);
        assert!(
            db.apply_cloud(dir.path(), vec![], "unsafe", &[base.id])
                .is_err()
        );
        assert_eq!(db.setting("cloudToken").unwrap().unwrap(), "next");
    }
}
