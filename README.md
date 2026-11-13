# Anubis

Anubis is a desktop-only Markdown and text editor built with React, Tiptap, and Tauri 2. Documents are real files in a local folder you choose. There is no standalone web app or browser document store.

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

The local build is not Developer ID signed or notarized. Windows and Linux use Tauri's platform builds but have not been tested on this Mac. No iOS project is configured.

## Folder workspaces

- Choose a folder on first launch. Anubis remembers it in its native app-data directory and reopens it next time.
- The sidebar lists `.md`, `.markdown`, `.mdown`, and `.txt` files recursively, with expandable subfolders. Empty folders are shown too. Search matches file/folder paths and reveals matching descendants.
- Markdown opens in the formatted editor with an optional source view. Plain text always opens as literal text. Opening or browsing a file does not rewrite it.
- Click a folder name to select the destination for new files and folders; use its arrow to expand or collapse it independently. Click the selected folder name again to return the creation destination to the workspace root. The file-plus and folder-plus buttons create a document or subfolder there.
- Each file's **⋯** menu offers Rename and Delete. Deletion requires confirmation and moves the file to the OS Trash/Recycle Bin; it does not recursively delete folders. Existing files are never replaced by create or rename operations.
- Click the workspace name at the top of the sidebar to choose another local folder. Native filesystem notifications and window focus automatically refresh the listing and clean open documents.

## Saving and recovery

Edits autosave after a short pause. Navigation, rename, deletion, folder switching, window close, and application quit flush pending edits first. The status indicator reports unsaved, saving, saved, or failed states.

Native saves use a same-directory temporary file and atomic replacement. Existing UTF-8 BOM and CRLF line endings are retained. Content versions are checked before replacement to detect external edits. Save failures or conflicts keep your edits in the editor and block navigation/quit until resolved. Use **Reload from disk** to discard unsaved changes after confirmation, or **Save a copy** to create a new file without overwriting the disk version.

Hidden files/directories and symbolic links are excluded from discovery. File operations are confined to the selected folder. Files must be UTF-8 text, at most 10 MB; the tree scan is limited to 20,000 entries and 64 levels. Unreadable folders are reported. Renames never replace existing files. macOS uses an exclusive native rename, including for case-only changes; other platforms use a hard-link operation and may fail on filesystems without hard-link support. A file changed at precisely the same moment by another program is not covered by an inter-process lock; avoid editing the same file simultaneously in multiple apps.

The previous version's webview-stored notes are left untouched, but are no longer loaded as the workspace or migrated automatically. Only UI preferences and the last active relative path remain in webview storage. Local files and autosave are not a backup.

## Editing

- Headings, bold/italic, lists, quotes, code, task lists, and tables.
- Settings with The Blues and Atom One palettes, each with remembered light/dark appearance.
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

Rust tests perform real filesystem operations in temporary folders, including recursive discovery, symlink/traversal rejection, conflict detection, and collision-safe writes/renames. UI tests use Chromium and WebKit with a mocked Tauri IPC boundary to exercise navigation, autosave, folder trees, native-close coordination, recovery, and layout. These engine tests are a desktop test harness, not a supported browser application.

## Scope and background

See [analysis/REPORT.md](analysis/REPORT.md) for the initial Typora feature research. The interface, editor integration, and filesystem implementation are original code. Advanced Markdown features, drag-and-drop moves, multiple workspaces, folder rename/delete, cloud synchronization, signed distribution, and mobile support are not implemented.
