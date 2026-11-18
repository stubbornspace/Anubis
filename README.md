# Anubis

Anubis is a Markdown and text editor for desktop and iOS, built with React, Tiptap, and Tauri 2. On macOS, Documents are real files in a folder you choose and Notes use a separate app-managed library. iPhone and iPad offer Notes only. There is no standalone web app or browser document store.

## Run and build

Install Node.js 22.12+, Rust 1.90+ (stable), and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS. macOS requires full Xcode 26 or newer (including its command-line tools) to compile the app icon, and macOS 14 or newer. If `xcode-select -p` points to CommandLineTools, set `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` for Tauri/Xcode commands.

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

The iOS target supports iOS/iPadOS 17 and later. It opens directly into Notes, sharing the editor, themes, tag tree, source mode, autosave, and note recovery with desktop. There are no Documents/Notes mode buttons or document folder picker on iOS. The compact layout uses a Notes drawer, touch controls, safe-area insets, and an editor viewport that responds to the software keyboard.

Install full Xcode, an iOS Simulator runtime, CocoaPods, and XcodeGen, plus the Rust targets:

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
npm ci
npm run ios:dev -- --open
```

This starts Vite and opens `src-tauri/gen/apple/anubis.xcodeproj`. Select the `anubis_iOS` scheme and an iPhone or iPad simulator, then Run in Xcode. `npm run ios:dev -- "SIMULATOR NAME"` can build and launch a named simulator directly when the installed runtime matches the Xcode SDK. If the CLI reports a missing Simulator SDK despite an older runtime being installed, use `--open` and select that installed simulator in Xcode.

```sh
# Unsigned simulator app + native UI-test build (no matching runtime required):
npm run ios:simulator
# Device archive / distribution build:
npm run ios:build
```

`npm run ios:simulator` uses `scripts/ios-simulator.mjs`: it selects full Xcode (respecting an existing `DEVELOPER_DIR`), starts the Tauri build helper, regenerates the project, builds the generic simulator app and UI-test target, and stops its helper. Output is under `src-tauri/target/ios-simulator/Build/Products/`. The app embeds the built frontend. A matching installed simulator runtime is required to **run** it, but not to compile it. The script takes no arguments; use `ios:build` for device/signing options. It opens Xcode as part of starting the Tauri helper.

For manual `ios:dev`/`ios:build -- --open` workflows, after the CLI opens Xcode, run `xcodegen generate --spec src-tauri/gen/apple/project.yml` before building the native UI tests. Tauri 2.12.4 rewrites the test target's bundle identifier/product name to the app's values; regenerating restores the distinct `.uitests` identifier and shared test scheme. Leave the Tauri helper running while Xcode builds. Regeneration also removes local signing-team settings, so select a team locally again for physical-device builds and do not commit that change.

Physical-device development uses `TAURI_DEV_HOST` for Vite and its HMR WebSocket on port 1421. The development-only CSP permits WebSocket connections to the selected host; release CSP remains restricted to app/IPC connections.

Physical-device installation and distribution require an Apple development team and provisioning. Set `APPLE_DEVELOPMENT_TEAM` locally, or select your team in Xcode. Do not commit signing identities or provisioning profiles. The existing bundle identifier `com.stubbornspace.kronos` is retained. The generated Xcode project is included; `npm run ios:init` can regenerate it, and `xcodegen generate --spec src-tauri/gen/apple/project.yml` updates it after changing the project definition.

Notes are stored in the private app library and remain usable offline. Import Markdown/text or backups through **Settings → Note library** and export notes through the editor toolbar. Switching away requests an immediate save and a short native background task to let it finish. Failed note saves retain recovery drafts; reopening restores them and offers **Save recovery copy**.

Existing document files, folder bookmarks, and document recovery drafts from older iOS versions are left untouched. They are not opened or migrated into Notes automatically. Existing files in **On My iPhone/iPad → Anubis** remain accessible through Files; import files explicitly to create independent Notes copies. Legacy private document drafts remain preserved but are not exposed by the Notes-only interface.

The native UI test covers Notes startup, editing, backgrounding, and relaunch, plus App zoom. Native CloudKit sync still requires separate signed-device validation.

## Optional iCloud Drive folders (macOS)

On macOS, choose a folder in iCloud Drive using **Choose folder**. Local folders remain available through the same picker; nothing is moved into iCloud automatically. iOS uses the separate Notes library and optional CloudKit sync described below.

Apple’s background service transfers the files. **Saved locally · Upload pending** means the save reached this device; **Uploaded to iCloud** means Apple reports that file uploaded, not that every other device has downloaded it. Download and upload errors remain visible. Cloud-only documents download when opened; access requests are cancellable after 30 seconds if the provider does not grant access. If a download fails, the previous document remains available. Opening a file never rewrites its contents.

macOS Documents use native coordinated file access and a file presenter for external changes, alongside the existing content-version checks and private recovery drafts. Downloaded documents can be edited offline and uploaded later. Keep independent backups; iCloud is a synchronization service.

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

## Folder workspaces (macOS)

- Choose a folder on first launch. Anubis remembers it in its native app-data directory and reopens it next time.
- The sidebar lists `.md`, `.markdown`, `.mdown`, and `.txt` files recursively, with expandable subfolders. Empty folders are shown too.
- Markdown opens in the formatted editor with an optional source view. Plain text always opens as literal text. Opening or browsing a file does not rewrite it.
- Documents and Notes share a ReUI Basic Tree adaptation backed by Headless Tree, styled with Anubis theme tokens. Rows expose ARIA tree/treeitem semantics and one active row in the keyboard tab order. Keyboard navigation: Up/Down moves between visible rows, Right expands or enters a branch, Left collapses or returns to its parent, and Home/End jumps to the first/last visible row. Enter activates the focused row.
- Click a folder name to select the destination for new files and folders; use its arrow to expand or collapse it independently. Click the selected folder name again to return the creation destination to the workspace root. The file-plus and folder-plus buttons create a document or subfolder there.
- Each file's **⋯** menu offers Rename and Delete. Deletion requires confirmation and moves the file to the OS Trash/Recycle Bin; it does not recursively delete folders. Existing files are never replaced by create or rename operations.
- Click the workspace name at the top of the sidebar to choose another local folder. Native filesystem notifications and window focus automatically refresh the listing and clean open documents.

## Note library

On macOS, use **Documents** and **Notes** at the bottom of the sidebar to switch modes. iOS opens directly into Notes, with Settings as the only bottom sidebar control. Documents retain their folder workflow. Notes have one resizable sidebar containing a tag/note tree and use the same Markdown editor. Narrow layouts collapse the sidebar like Documents. Each mode retains its own sidebar width and active item.

Notes save into `library/notes.sqlite3` inside Tauri's app-data directory. Content never goes into webview storage. Local saving works without an account or network. Notes use one resizable sidebar: Search and Add Note at the top, then tags and untagged notes directly, with no All Notes wrapper. Tags act like folders, nested tags like subfolders, and notes appear as compact file rows. Untagged notes sit at the sidebar root. Notes with multiple tags appear in each corresponding folder; search finds them once across the entire library, even in collapsed folders. Tags and notes are sorted alphabetically. Expansion state is remembered; arrow keys navigate/expand/collapse the tree. Pinned, Archive, Today, To-do, and Trash views have been removed. Older archived/trashed notes appear in the Notes sidebar so you can explicitly keep or delete them. History retains earlier saves; restoring a version preserves the current content as another revision. Draft journals survive failed saves. Mode changes and quit are blocked when unsaved edits need recovery.

Use the **Tags** toolbar popover to add tags, choose suggestions from existing tags, or remove assigned tags. Nested tags such as `work/project` and multiword tags are supported. Tags stay out of the formatted writing area; typing a hashtag there creates ordinary text, with no autocomplete or clickable tag styling. Replacing or deleting the visible body keeps the assigned tags. Tags remain encoded in Markdown source and exports for backup/sync compatibility; existing Markdown tags are read into the picker without rewriting a note on opening. Source mode exposes the full Markdown. Removing a tag removes only that exact tag, retaining descendants and protected code/link text. Tags show disclosure arrows in the sidebar, and notes use dash markers. Select a tag row to create notes inside it; select it again to clear the creation destination; the sidebar has no tag-edit controls.

Paste, drop, or choose PNG, JPEG, GIF, or WebP images (up to 20 MB each). The iOS file input offers system image selection. Images are stored as immutable, content-addressed attachments; Markdown contains `anubis-asset:` references. The original files can be removed after import. Edit alt text in source mode. **Export** creates a ZIP containing `note.md` and its referenced images with relative paths. On iOS, exports use the system share sheet.

**Settings → Note library** imports Markdown/text files or an Anubis JSON backup. **Back up library** includes notes, images, drafts, revision history, and retained legacy metadata/preferences. Restoring adds independent copies and never overwrites existing notes. Backup imports currently have a 256 MB limit. Plain Markdown import does not import sibling image files; use an Anubis backup for portable images. Note text has a 10 MB limit. Revisions remain available until their note is permanently deleted. Deletion removes its history and unshared image files; shared images and references needed by surviving histories or recovery drafts remain. Broad automatic compaction/garbage collection is not implemented.

**Delete note** in the top-right toolbar permanently deletes a note after confirmation. Deletion sync uses a content-free marker so stale devices cannot restore the same note ID. If another device has unsynced edits, those remain available as a separate recovery copy or draft; the original stays deleted. There is no Trash or restore action for deleted notes, although existing external backups can still be imported as new copies. Update all synced devices to this version before testing permanent deletion; older clients do not understand the deletion marker. Local database migration is version 3, so older app builds cannot open a migrated library.

### iCloud note sync (provisioning required)

The CloudKit transport targets the private database in `iCloud.com.stubbornspace.kronos`, separate from Document-folder iCloud Drive access. It uses incremental zone change tokens, version-checked record uploads, and a persistent local outbox. Cloud note bodies and images use CKAsset. Conflicting edits preserve the local version as a separate **Conflict copy**, with prior content also in History. Account changes and unexpected permanent cloud deletions pause sync without removing local data.

Sync is off by default. **Settings → iCloud note sync** enables foreground synchronization approximately once a minute; **Sync now** runs a pass immediately. Each pass fetches one page and sends up to five queued notes, retaining pending work for subsequent passes. Saving locally and confirmed synchronization have different status labels. Pinned-tag preferences, local history, and drafts are included in backups but are not uploaded as separate cloud records.

Ordinary builds remain usable without CloudKit entitlements. To validate actual sync:

1. Register `iCloud.com.stubbornspace.kronos` under your Apple Developer team and associate it with the existing `com.stubbornspace.kronos` app identifier.
2. Configure development signing/provisioning for that container. `src-tauri/CloudKit.entitlements` is a development template; keep team-specific application identifiers and provisioning profiles local.
3. On macOS, use a local signing config with `npm run desktop:build -- --config /absolute/path/to/tauri.signing.json --bundles app,dmg`. The config must set `bundle.macOS.infoPlist` to the absolute path of `src-tauri/MacCloudKitInfo.plist`, `entitlements` to a local copy of `CloudKit.entitlements` extended with the profile's `com.apple.application-identifier` and `com.apple.developer.team-identifier`, and `signingIdentity` to a certificate included in that profile. Set `bundle.macOS.files` to `{ "embedded.provisionprofile": "/absolute/path/to/profile.provisionprofile" }`. Keep these signing files outside Git. The checked-in CloudKit config is only a template; adding its container key alone does not provision or sign the app.
4. For iOS, merge the same config when building and enable iCloud/CloudKit in Xcode's Signing & Capabilities for the same container. Keep signing-team settings out of Git. The normal iOS project remains usable without CloudKit.
5. Test with an isolated development library on two signed-in devices before using real notes. Verify offline edits, concurrent edits, images, permanent deletion (including offline edits), interrupted transfer, sign-out/account changes, and recovery. Deploy the schema and use production entitlements only after that validation.

CloudKit transport compiles, and local merge/outbox behavior has regression tests. Registration, provisioning, and live multi-device sync must be verified separately; mocked UI tests do not prove them. The transport currently uses CloudKit operations directly rather than CKSyncEngine. Remote changes arrive during foreground sync passes, not through push notifications.

The ordinary `desktop:build` command produces a local-only build. For an iCloud-enabled delivery, verify the signed app's container and environment entitlements, matching app/team identifiers, embedded profile, and inclusion of the target Mac's **Provisioning UDID** in a development profile. Verify the app inside the finished DMG as well. Development-signed builds are for provisioned devices and are not notarized public releases. A development-signed Apple Silicon macOS DMG with the requested container and an updated profile covering all five registered Macs was built and verified on November 15, 2026; the user subsequently confirmed successful launch and CloudKit sync on both Macs. Offline/conflict scenarios, image transfers, and iPhone/iPad sync still need separate validation.

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

Rust tests perform real filesystem operations in temporary folders, including recursive discovery, symlink/traversal rejection, conflict detection, and collision-safe writes/renames. UI tests use Chromium and WebKit with a mocked Tauri IPC boundary to exercise navigation, autosave, folder trees, native-close coordination, recovery, and layout. The iPhone and iPad WebKit projects also exercise touch navigation, software-keyboard viewport changes, and background save/recovery through the mock boundary. These engine tests are a native-app test harness, not a supported browser application. The Xcode Test action provides a separate native iOS Notes smoke test.

## Scope and background

See [analysis/REPORT.md](analysis/REPORT.md) for the initial Typora feature research. The interface, editor integration, and filesystem implementation are original code. Advanced Markdown features, drag-and-drop moves, multiple workspaces, folder rename/delete, automatic conflict merging, notarized public distribution, and Android support are not implemented.

The shared editing toolbar's **Insert image** button is available for Markdown Documents and Notes. Documents embed PNG, JPEG, GIF, or WebP images as data URLs in the Markdown file, keeping it self-contained within the 10 MB document limit; external Markdown viewers must support data URLs to display them. Notes continue to use private attachments. Image insertion is unavailable in plain-text and source mode.

Select text in the Markdown editor to show the floating formatting toolbar (Bold, Italic, Heading, Bullet list, Quote, and Table). Press Tab from a text selection to focus the toolbar, use arrow keys to move between actions, and Escape to dismiss it. Insert image stays in the top toolbar.

Select an inserted image to show **Crop & resize**, or drag its bottom corner handles to resize while keeping its aspect ratio. The dialog provides a display width and crop controls for each edge, a live preview, Reset crop, and Apply/Cancel. Changes are undoable and preserve the original image bytes. Edited images use HTML `<img>` tags with width and Anubis `data-crop-*` attributes in Markdown; other viewers may ignore the crop attributes and show the uncropped original. Crop editing supports app-managed Notes attachments and embedded Document images, not external image URLs.

macOS builds require full Xcode 26 or newer for Icon Composer asset compilation. `src-tauri/icons/Anubis.icon` retains an unchanged copy of the supplied artwork and disables extra layer glass effects. The Rust build script compiles `Assets.car` and the legacy fallback into ignored `src-tauri/target/app-icon/`; Tauri bundles both with the matching `CFBundleIconName`. Keep `MacInfo.plist` and `MacCloudKitInfo.plist` icon keys aligned. The iOS Xcode project also compiles the shared `Anubis.icon` and selects `Anubis` as its app icon. This avoids the white matte baked into the old flattened iOS PNGs. Keep the `.icon` resource and `ASSETCATALOG_COMPILER_APPICON_NAME` in `project.yml` aligned; Xcode produces its platform-specific assets and fallback icons.
