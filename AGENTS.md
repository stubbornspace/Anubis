# Anubis contributor guide

## Project

Anubis is a desktop and iOS Markdown and plain-text editor built with React, TypeScript, Tiptap, Vite, and Tauri 2. Preserve both targets; do not add a standalone web product or Android scaffolding unless requested.

- `src/main.tsx`: editor, sidebar, settings dialog, and UI state.
- `src/workspace.ts`: workspace controller, autosave, filesystem IPC, and close coordination.
- `src/library.ts`: Notes controller, local autosave, recovery, organization, and sync state.
- `src/library-ui.tsx` and `src/library-tools.tsx`: library navigation, note list, tag controls, history, and backup/import UI.
- `src/tags.ts` and `src/tag-extension.ts`: Markdown tag parsing, replacement, decorations, and interaction.
- `src/note-image.ts`: editor image rendering for app-managed attachment references.
- `src/style.css`: layout and component styles.
- `src/ocean.css` and `src/atom-one.css`: The Blues and Atom One light/dark tokens.
- `src-tauri/src/workspace.rs`: native file operations and filesystem tests.
- `src-tauri/src/lib.rs`: Tauri commands, folder picker, watcher, and lifecycle handling.
- `src-tauri/tauri.conf.json`: app identity, window configuration, and bundles.
- `public/icons/anubis-app.png`: source app icon; `anubis-light.png` and `anubis-dark.png`: themed sidebar logos.
- `tests/native-fixture.ts`: mocked Tauri boundary for Playwright tests.
- `src-tauri/plugins/ios-workspace/`: native iOS folder bookmarks, security-scoped access, and background save coordination.
- `src-tauri/gen/apple/project.yml`: iPhone/iPad Xcode project and native UI test definition; regenerate with `xcodegen generate --spec src-tauri/gen/apple/project.yml`.
- `src/platform.ts` and `tests/mobile.spec.ts`: iOS UI detection and touch/keyboard regression tests.
- `src-tauri/src/apple.rs` and `src-tauri/apple/FileAccess.m`: shared Apple coordination, cloud metadata, version preservation, and file presenters.
- `src-tauri/src/recovery.rs`: private Apple-platform draft journal; retain it until a successful save/copy or an explicitly confirmed discard.
- `src-tauri/src/library.rs`: SQLite library, migrations, revisions, draft journal, attachments, backups, and persistent sync outbox.
- `src-tauri/src/note_sync.rs` and `src-tauri/apple/NoteSync.m`: Notes CloudKit orchestration and native transport.
- `src-tauri/tauri.cloudkit.conf.json`, `src-tauri/CloudKit.entitlements`, and `src-tauri/CloudKitInfo.plist`: optional CloudKit build configuration and development templates.
- `tests/library.spec.ts` and `src/tags.test.ts`: Notes interaction and tag parsing regression coverage.

Read `README.md` for supported formats, limits, and known behavior. Track remaining Notes work and live sync validation in `docs/notes-library-tasks.md`. The `analysis/` folder contains historical research, not runtime dependencies.

## Product conventions

Keep the writing interface minimal. Use system fonts and existing Lucide icons. Give icon-only buttons descriptive accessible names and hover labels. Preserve keyboard focus, Escape dismissal, and reduced-motion support.

Use rem units for scalable interface dimensions and app-layout container queries for responsive breakpoints. Preserve physical macOS window-control spacing and the iOS minimum touch target when changing App zoom. Use theme tokens rather than adding isolated colors. Check both themes and appearances when changing styles. Settings live in a dialog. The sidebar is resizable and remembers its width; keep the native macOS controls aligned with the header.

Documents and Notes use icon-only mode buttons in the bottom sidebar control row beside Settings and the theme toggle. Keep hover labels, accessible names, and the selected mode indication. Do not restore the document sidebar search or the Notes sidebar's “Saved on this device” label.

Documents use folder navigation and the editor; Notes use library/tag navigation, a resizable note list, and the shared Markdown editor. Preserve each mode's sidebar width and active item. Keep one sidebar toggle in the editor header for both modes; in Notes it collapses/restores both navigation columns. The keyboard shortcut must use the same behavior. Do not add a duplicate toggle in the note list or a separate editor note-list toggle. Preserve access to navigation in narrow and touch layouts.

Align the Notes sidebar toggle and editor toolbar with the Documents header, with navigation expanded or collapsed. Keep the native macOS header's 64px geometry and window-control clearance. Let controls wrap only when available space requires it; do not force Notes breadcrumbs or toolbar groups to full-width rows on desktop.

Focus mode positions the typing line about 40% down the editor and fades surrounding controls while typing, restoring them after two seconds idle or user interaction. Preserve editor geometry while fading.

## Data and compatibility

- Documents belong in the user's selected local folder. Notes belong in the app-private SQLite library and attachment directory. Never store either kind of content in localStorage or sessionStorage.
- `src/library.ts` and `src-tauri/src/library.rs` own note autosave, revision checks, draft recovery, backups, and the sync outbox. `src-tauri/src/note_sync.rs` and `src-tauri/apple/NoteSync.m` own CloudKit transport. Flush both controllers before quit/background completion.
- Preserve library migrations, revisions, drafts, and attachment hashes. Sync acknowledges only the exact uploaded revision; never clear newer queued edits or silently overwrite a cloud conflict. Keep the library bound to its first iCloud account.
- Keep Notes usable offline. A sync that changes only metadata must not reload editor content or reset selection, undo history, or source mode. Preserve failed drafts until a successful save/recovery copy or explicitly confirmed discard.
- Notes tags derive from Markdown, including nested and multiword tags. Exclude code, escaped hashtags, and image/link syntax. Tag removal must retain the notes. Keep attachment references stable; resolving an image for display must not rewrite its Markdown.
- Backup imports add independent copies without overwriting existing notes. Preserve images, revisions, drafts, Trash, and pinned-tag preferences. Do not migrate document folders into Notes automatically or introduce attachment/revision cleanup without a retention policy covering recovery and unsynced data.
- CloudKit tests require explicit opt-in and an isolated test container/zone. Never test by modifying the user's live library. Signing identities and provisioning remain local.
- Preserve autosave ordering and flush pending changes before navigation, workspace changes, and quit.
- Never overwrite externally changed files or silently discard drafts. Preserve conflict recovery, non-overwriting creation/rename, and Trash-based deletion.
- Keep native filesystem operations within the selected root; retain path validation, symlink restrictions, encoding handling, and size limits.
- Opening a document must not rewrite it.
- The bundle identifier `com.stubbornspace.kronos` and existing `kronos.*` / `typclone.*` preference keys intentionally preserve compatibility after the Anubis rename. Do not rename them without an explicit migration plan.
- The GitHub repository still uses the Kronos name. Do not rename remotes or the repository as part of UI branding changes.

## Notes sync

Use the private CloudKit database in `iCloud.com.stubbornspace.kronos` for Mac, iPhone, and iPad under the user's existing Apple Developer team. This is separate from Documents stored in iCloud Drive. Keep ordinary local-only builds working without CloudKit entitlements.

The current transport uses CloudKit operations directly, with foreground synchronization and a persistent outbox. Sync is off by default. Local persistence is not confirmation of upload. Pinned-tag preferences, history, and drafts are backed up locally but are not separate synced records; do not imply otherwise in UI or documentation.

Container registration, provisioning, production schema deployment, and live multi-device behavior require separate verification. Compilation and mocked tests do not establish working device sync. Keep the checklist current as these are validated; retain team-specific signing and provisioning settings outside Git.

## Development and validation

Install dependencies with `npm ci`. Run the desktop app with `npm run dev`. The `frontend:*` scripts support Tauri and tests; they are not a separate web release.

Choose checks appropriate to the change:

- Frontend compile: `npm run frontend:build`.
- Editor unit tests: `npm test`.
- UI behavior: `npm run test:e2e`; `npm run test:webkit` covers the engine closest to macOS. Use focused test filters for localized changes.
- Notes desktop behavior: `npx playwright test tests/library.spec.ts`; include `tests/mobile.spec.ts` when changing shared navigation or responsive controls.
- Native filesystem and library persistence behavior: `npm run test:native`.
- Rust compilation: `npm run desktop:check`.
- iPhone/iPad UI: `npx playwright test --project=iphone --project=ipad`. These use mocked IPC and cannot prove Files access or iOS lifecycle behavior.
- iOS development: `npm run ios:dev -- --open`, select `anubis_iOS` and a simulator in Xcode. Its Test action exercises native folder access, editing, relaunch, and Trash.
- iOS simulator build: `npm run ios:simulator`; when CLI SDK/runtime versions differ, build through the Xcode project with an installed simulator as documented in README.
- Formatting: Prettier for frontend files, `cargo fmt --manifest-path src-tauri/Cargo.toml --check` for Rust, and `git diff --check` for whitespace.

Add meaningful regression coverage for changes to persistence, file operations, focus handling, or interaction behavior. Pure documentation and small cosmetic changes do not require a full test suite or installer build. Mocked UI tests do not prove native dialogs, window controls, signing, or OS integration work.

For sidebar/header changes, cover both modes, expanded/collapsed navigation, macOS window-control spacing, and narrow touch layouts. Use geometry assertions when checking alignment or overlap; screenshot appearance alone does not verify interactions. The mock library in `tests/native-fixture.ts` uses test-only browser storage and must never become a production persistence fallback.

## Builds and disk use

Build macOS installers with `npm run desktop:build -- --bundles dmg`. Output is under `src-tauri/target/release/bundle/dmg/`. When delivering an installer, copy the completed Anubis DMG to `~/Downloads` and verify the copy. Do not overwrite supplied artwork while preparing platform icons.

Rust build output can occupy several gigabytes. `cargo clean --manifest-path src-tauri/Cargo.toml` removes regenerable build artifacts, including bundled apps and installers in `target`; preserve any requested deliverables first. Avoid rebuilding desktop installers for documentation-only work.

Keep build output, dependencies, local research captures, credentials, and test artifacts out of Git. Commit both dependency lockfiles when dependencies change. Do not delete user files or unrelated working-tree changes.

On iOS, keep security-scoped access alive until the selected folder is replaced successfully, and persist bookmarks rather than absolute sandbox paths. Use the native background save task and system Trash bridge. Never fall back to permanent deletion when a provider cannot trash a file. Keep signing teams, provisioning profiles, generated Externals, and build output out of Git.

For iCloud Drive, keep coordinated access around validation and the entire filesystem operation. Preserve both cloud versions and unsaved text before resolving a conflict; never select a winner silently. Distinguish local persistence from confirmed upload. Keep directory/status inspection from downloading every document. iCloud tests require explicit opt-in and must use only their own temporary directories.
