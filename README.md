# Anubis

Anubis is a Markdown and text editor for desktop and iOS, built with React, Tiptap, and Tauri 2. Documents are real files in a folder you choose. Notes use a separate app-managed library. There is no standalone web app or browser document store.

## Run and build

Install Node.js 22.12+, Rust 1.90+ (stable), and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS. macOS requires Xcode Command Line Tools and macOS 14 or newer.

```sh
npm ci
npm run dev
```

This launches the desktop app and its internal Vite development server on port 1420. Frontend changes reload automatically; Rust changes rebuild the host. `npm run desktop:dev` is an alias. The `frontend:*` scripts exist only for Tauri's build hooks and the automated UI test harness.

```sh
npm run build
# Or only the macOS app bundle:
npm run desktop:build -- --bundles app
```

Outputs are in `src-tauri/target/release/bundle/`. On macOS:

```sh
open src-tauri/target/release/bundle/macos/Anubis.app
```

The local desktop build is not Developer ID signed or notarized. Windows and Linux use Tauri's platform builds but have not been tested on this Mac.

## iPhone and iPad

The iOS target supports iOS/iPadOS 17 and later. It shares the editor, themes, file tree, source mode, autosave, and conflict recovery with desktop. The compact layout uses a Files drawer, touch controls, safe-area insets, and an editor viewport that responds to the software keyboard.

Install full Xcode, an iOS Simulator runtime, CocoaPods, and XcodeGen, plus the Rust targets:

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
npm ci
npm run ios:dev -- --open
```

This starts Vite and opens `src-tauri/gen/apple/anubis.xcodeproj`. Select the `anubis_iOS` scheme and an iPhone or iPad simulator, then Run in Xcode. `npm run ios:dev -- "SIMULATOR NAME"` can build and launch a named simulator directly when the installed runtime matches the Xcode SDK. If the CLI reports a missing Simulator SDK despite an older runtime being installed, use `--open` and select that installed simulator in Xcode.

```sh
# Standalone unsigned simulator build (matching Xcode/runtime versions):
npm run ios:simulator
# Device archive / distribution build:
npm run ios:build
```

For a standalone simulator app when SDK/runtime versions differ, run `npm run ios:build -- --debug --open`, then build and run the simulator target in Xcode. This embeds the built frontend instead of connecting to Vite.

Physical-device installation and distribution require an Apple development team and provisioning. Set `APPLE_DEVELOPMENT_TEAM` locally, or select your team in Xcode. Do not commit signing identities or provisioning profiles. The existing bundle identifier `com.stubbornspace.kronos` is retained. The generated Xcode project is included; `npm run ios:init` can regenerate it, and `xcodegen generate --spec src-tauri/gen/apple/project.yml` updates it after changing the project definition.

Choose a folder through the native Files picker. A local `Notes` folder is available inside Anubis's Documents directory, visible in Files under **On My iPhone/iPad → Anubis**. The native bridge retains security-scoped access and saves a bookmark to reopen the chosen folder after relaunch. Canceling or failing to open a new folder retains the previous workspace. Choose either a local folder or a folder in iCloud Drive. Anubis coordinates access with Apple’s document system; iCloud Drive transfers the files between devices. Documents remain ordinary UTF-8 files.

On iOS, deletion uses the system Trash API; recover supported files in Files → Recently Deleted. If the folder provider cannot trash a file, Anubis reports the error and keeps the file. Switching away from the app requests an immediate save and a short native background task to let it finish.

Before each macOS or iOS save, Anubis writes a private recovery draft in native app storage. Successful saves clear it. If a save fails and the app terminates, opening a workspace on the next launch restores that draft and offers **Save a copy** or a confirmed discard/reload. Recovered copies are created at the root of the chosen workspace, including when the original folder is unavailable. Recovery is not a backup.

## Optional iCloud Drive folders

Choose a folder in iCloud Drive using **Choose folder** on each device. Select the same folder on your Mac and iPhone/iPad to work on the same documents. Local folders remain available through the same picker; nothing is moved into iCloud automatically. Folder choices and appearance preferences remain specific to each device. The default **On My iPhone/iPad → Anubis → Notes** folder is local and does not sync.

Apple’s background service transfers the files. **Saved locally · Upload pending** means the save reached this device; **Uploaded to iCloud** means Apple reports that file uploaded, not that every other device has downloaded it. Download and upload errors remain visible. Cloud-only documents download when opened; access requests are cancellable after 30 seconds if the provider does not grant access. If a download fails, the previous document remains available. Opening a file never rewrites its contents.

Both Apple targets use native coordinated file access and a file presenter for external changes, alongside the existing content-version checks and private recovery drafts. Downloaded documents can be edited offline and uploaded later. Keep independent backups; iCloud is a synchronization service.

If iCloud reports competing versions, saving, renaming, and deleting the affected original are blocked. **Keep both versions** saves any unsaved editor text as a separate document, then copies each competing iCloud version to a uniquely named sibling file before resolving that version. Copies never overwrite existing files. A partial failure leaves uncopied versions intact. Review the resulting documents before deleting unwanted copies. This is document version recovery, not collaborative editing or automatic text merging.

For an opt-in native test using only a temporary folder inside your iCloud Drive:

```sh
ANUBIS_ICLOUD_TEST_ROOT="$HOME/Library/Mobile Documents/com~apple~CloudDocs" \
  cargo test --manifest-path src-tauri/Cargo.toml --lib real_icloud_folder_round_trip -- --ignored
```

A separate opt-in Foundation test verifies confirmed upload, eviction of the local copy, coordinated re-download, and Trash:

```sh
xcrun clang -fobjc-arc -fblocks -framework Foundation \
  src-tauri/apple/FileAccess.m src-tauri/apple/tests/CloudDownload.m \
  -o /tmp/anubis-cloud-download-test
/tmp/anubis-cloud-download-test "$HOME/Library/Mobile Documents/com~apple~CloudDocs"
```

The ordinary test suite does not touch iCloud. The native macOS folder and cloud-only download tests have passed against iCloud Drive, and the iOS workspace smoke test covers native local files. Physical Mac–iPhone/iPad transfer and native offline version conflicts still need validation on devices signed in to the same iCloud account; browser conflict tests use mocked provider responses.

## Folder workspaces

- Choose a folder on first launch. Anubis remembers it in its native app-data directory and reopens it next time.
- The sidebar lists `.md`, `.markdown`, `.mdown`, and `.txt` files recursively, with expandable subfolders. Empty folders are shown too.
- Markdown opens in the formatted editor with an optional source view. Plain text always opens as literal text. Opening or browsing a file does not rewrite it.
- Click a folder name to select the destination for new files and folders; use its arrow to expand or collapse it independently. Click the selected folder name again to return the creation destination to the workspace root. The file-plus and folder-plus buttons create a document or subfolder there.
- Each file's **⋯** menu offers Rename and Delete. Deletion requires confirmation and moves the file to the OS Trash/Recycle Bin; it does not recursively delete folders. Existing files are never replaced by create or rename operations.
- Click the workspace name at the top of the sidebar to choose another local folder. Native filesystem notifications and window focus automatically refresh the listing and clean open documents.

## Note library

Use **Documents** and **Notes** at the bottom of the sidebar to switch modes. Documents retain their folder workflow. Notes have a library/tag sidebar, a resizable note list, and the same Markdown editor. Narrow layouts show the note list and editor sequentially. Each mode retains its own sidebar width and active item.

Notes save into `library/notes.sqlite3` inside Tauri's app-data directory. Content never goes into webview storage. Local saving works without an account or network. Notes support full-text search, title/created/edited sorting, pinned notes, Archive, recoverable Trash, and built-in Untagged, Today, and To-do views. History retains earlier saves; restoring a version preserves the current content as another revision. Draft journals survive failed saves. Mode changes and quit are blocked when unsaved edits need recovery.

Use `#work`, `#work/project`, or `#meeting notes#` in Markdown. Tags are indexed from text and support autocomplete, clickable filtering, nested disclosure, pinning, renaming, and removal. Removing a tag keeps its notes. Code, image/link syntax, and escaped hashtags are excluded. Tag pin preferences are currently local to the device.

Paste, drop, or choose PNG, JPEG, GIF, or WebP images (up to 20 MB each). The iOS file input offers system image selection. Images are stored as immutable, content-addressed attachments; Markdown contains `anubis-asset:` references. The original files can be removed after import. Edit alt text in source mode. **Export** creates a ZIP containing `note.md` and its referenced images with relative paths. On iOS, exports use the system share sheet.

**Settings → Note library** imports Markdown/text files or an Anubis JSON backup. **Back up library** includes notes, images, Trash, drafts, revision history, and pinned-tag preferences. Restoring adds independent copies and never overwrites existing notes. Backup imports currently have a 256 MB limit. Plain Markdown import does not import sibling image files; use an Anubis backup for portable images. Note text has a 10 MB limit. Revisions and unused images are deliberately retained; automatic compaction and attachment cleanup are not implemented yet.

### iCloud note sync (provisioning required)

The CloudKit transport targets the private database in `iCloud.com.stubbornspace.kronos`, separate from Document-folder iCloud Drive access. It uses incremental zone change tokens, version-checked record uploads, and a persistent local outbox. Cloud note bodies and images use CKAsset. Conflicting edits preserve the local version as a separate **Conflict copy**, with prior content also in History. Account changes and unexpected permanent cloud deletions pause sync without removing local data.

Sync is off by default. **Settings → iCloud note sync** enables foreground synchronization approximately once a minute; **Sync now** runs a pass immediately. Each pass fetches one page and sends up to five queued notes, retaining pending work for subsequent passes. Saving locally and confirmed synchronization have different status labels. Pinned-tag preferences, local history, and drafts are included in backups but are not uploaded as separate cloud records.

Ordinary builds remain usable without CloudKit entitlements. To validate actual sync:

1. Register `iCloud.com.stubbornspace.kronos` under your Apple Developer team and associate it with the existing `com.stubbornspace.kronos` app identifier.
2. Configure development signing/provisioning for that container. `src-tauri/CloudKit.entitlements` is a development template; keep team-specific application identifiers and provisioning profiles local.
3. On macOS, use `npm run desktop:build -- --config src-tauri/tauri.cloudkit.conf.json --bundles app` with your signing identity/profile configured locally. The optional config adds the container Info.plist key and entitlements.
4. For iOS, merge the same config when building and enable iCloud/CloudKit in Xcode's Signing & Capabilities for the same container. Keep signing-team settings out of Git. The normal iOS project remains usable without CloudKit.
5. Test with an isolated development library on two signed-in devices before using real notes. Verify offline edits, concurrent edits, images, Trash/restore, interrupted transfer, sign-out/account changes, and recovery. Deploy the schema and use production entitlements only after that validation.

CloudKit transport compiles, and local merge/outbox behavior has regression tests. Registration, provisioning, and live multi-device sync must be verified separately; mocked UI tests do not prove them. The transport currently uses CloudKit operations directly rather than CKSyncEngine. Remote changes arrive during foreground sync passes, not through push notifications.

## Saving and recovery

Edits autosave after a short pause. Navigation, rename, deletion, folder switching, window close, and application quit flush pending edits first. The status indicator reports unsaved, saving, saved, or failed states.

Native saves use a same-directory temporary file and atomic replacement. Existing UTF-8 BOM and CRLF line endings are retained. Content versions are checked before replacement to detect external edits. Save failures or conflicts keep your edits in the editor and block navigation/quit until resolved. Use **Reload from disk** to discard unsaved changes after confirmation, or **Save a copy** to create a new file without overwriting the disk version.

Hidden files/directories and symbolic links are excluded from discovery. File operations are confined to the selected folder. Files must be UTF-8 text, at most 10 MB; the tree scan is limited to 20,000 entries and 64 levels. Unreadable folders are reported. Renames never replace existing files. macOS and iOS coordinate file access and use an exclusive native rename, including for case-only changes; other platforms use a hard-link operation and may fail on filesystems without hard-link support. A file changed at precisely the same moment by another program is not covered by an inter-process lock; avoid editing the same file simultaneously in multiple apps.

The previous version's webview-stored notes are left untouched, but are no longer loaded as the workspace or migrated automatically. Only UI preferences and the last active relative path remain in webview storage. Local files and autosave are not a backup.

## Editing

- Headings, bold/italic, lists, quotes, code, task lists, and tables.
- Settings with The Blues and Atom One palettes, each with remembered light/dark appearance. **App zoom** scales the whole interface—editor, sidebar, icons, controls, and dialogs—from 75% to 150%, with a reset to 100%. The preference stays on each device. Existing `kronos.fontSize` values migrate once to an equivalent `kronos.appZoom` percentage; the old key is retained for compatibility.
- Source mode, light/dark appearance, collapsible sidebar, and Focus mode with Markdown scrolling that keeps the typing line slightly above center and controls that fade while typing, returning after two seconds idle or pointer movement.
- Cmd/Ctrl+O chooses a folder, +N creates a file, +S saves, +/ switches source mode, and +Backslash toggles the sidebar.
- Unsupported Markdown syntax can be normalized after rich-text edits. Use source mode when exact source syntax matters.

## Validation

```sh
npm test
npm run test:native
npx playwright install chromium webkit
npm run test:e2e
cargo fmt --manifest-path src-tauri/Cargo.toml --check
npm run build
```

Rust tests perform real filesystem operations in temporary folders, including recursive discovery, symlink/traversal rejection, conflict detection, and collision-safe writes/renames. UI tests use Chromium and WebKit with a mocked Tauri IPC boundary to exercise navigation, autosave, folder trees, native-close coordination, recovery, and layout. The iPhone and iPad WebKit projects also exercise touch navigation, software-keyboard viewport changes, and background save/recovery through the mock boundary. These engine tests are a native-app test harness, not a supported browser application. The Xcode Test action provides a separate real iOS workspace smoke test.

## Scope and background

See [analysis/REPORT.md](analysis/REPORT.md) for the initial Typora feature research. The interface, editor integration, and filesystem implementation are original code. Advanced Markdown features, drag-and-drop moves, multiple workspaces, folder rename/delete, automatic conflict merging, signed distribution, and Android support are not implemented.
