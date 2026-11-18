# Anubis contributor guide

## Project

Anubis is a desktop and iOS Markdown and plain-text editor built with React, TypeScript, Tiptap, Vite, and Tauri 2. iOS is Notes-only; Documents remain available on macOS. Preserve both targets; do not add a standalone web product or Android scaffolding unless requested.

- `src/main.tsx`: editor, sidebar shell, settings dialog, and UI state.
- `src/sidebar-tree.tsx`: shared Headless Tree adapter, controlled expansion, disclosure controls, and navigation for Documents and Notes.
- `src/components/tree.tsx`: ReUI Basic Tree primitives adapted to existing Anubis styles. Keep ARIA tree roles, roving focus, theme tokens, and independent disclosure/actions; activation must still go through the workspace/library controllers.
- `src/document-tree.tsx`: document tree adapter, expansion state, and file action menus. Keep filesystem/save operations in the workspace controller.
- `src/workspace.ts`: workspace controller, autosave, filesystem IPC, and close coordination.
- `src/library.ts`: Notes controller, local autosave, recovery, organization, and sync state.
- `src/library-ui.tsx` and `src/library-tools.tsx`: library navigation, note list, tag controls, history, and backup/import UI.
- `src/tags.ts`, `src/tag-extension.ts`, and `src/note-tags.tsx`: Markdown tag parsing, hidden editor tag attributes, and the Tags popover. `src/editor.ts` projects note tags between Markdown persistence and the tag-free formatted body.
- `src/note-image.ts`: image rendering, resize handles, and Markdown geometry persistence.
- `src/image-tools.tsx` and `src/image-geometry.ts`: crop/size dialog, source resolution, and bounded image geometry.
- `src/selection-toolbar.tsx`: shared Tiptap selection formatting toolbar and keyboard interaction.
- `src/style.css`: layout and component styles.
- `src/ocean.css` and `src/atom-one.css`: The Blues and Atom One light/dark tokens.
- `src-tauri/src/workspace.rs`: native file operations and filesystem tests.
- `src-tauri/src/lib.rs`: Tauri commands, folder picker, watcher, and lifecycle handling.
- `src-tauri/tauri.conf.json`: app identity, window configuration, and bundles.
- `src-tauri/icons/Anubis.icon`: shared macOS/iOS icon composition; `build.rs` compiles it with Xcode into ignored build output. Bundle its `Assets.car` and fallback ICNS, and retain matching icon keys in both macOS Info.plist variants to avoid the system-added legacy icon frame. The iOS project compiles the same `.icon` resource with app-icon name `Anubis`; do not revert to the white-matted legacy `AppIcon` PNG set.
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

Keep the writing interface minimal. Hide successful Saved/Synced header messages visually while retaining accessible status announcements and stable toolbar spacing; show saving/syncing progress and unresolved errors or pending uploads. Use system fonts and existing Lucide icons. Give icon-only buttons descriptive accessible names and hover labels. Preserve keyboard focus, Escape dismissal, and reduced-motion support.

Use rem units for scalable interface dimensions and app-layout container queries for responsive breakpoints. Preserve physical macOS window-control spacing and the iOS minimum touch target when changing App zoom. Use theme tokens rather than adding isolated colors. Check both themes and appearances when changing styles. Settings live in a dialog. The sidebar is resizable and remembers its width; keep the native macOS controls aligned with the header.

On macOS, Documents and Notes use icon-only mode buttons on the left of the bottom sidebar control row, with Settings aligned to the right. Theme and appearance controls live in Settings; do not add a sidebar theme toggle. Keep hover labels, accessible names, and the selected mode’s accessible pressed state; do not highlight the selected mode button visually. Do not restore the document sidebar search or the Notes sidebar's “Saved on this device” label.

On iOS, initialize Notes regardless of the legacy mode preference; hide both mode buttons and do not restore document workspaces. Preserve existing files, bookmarks, and document recovery drafts without automatically importing them. Keep the shared native background-save bridge, Notes import/export, and Settings access.

The top-right toolbar uses direct icon buttons. From left to right: Focus, Source, divider, Insert image, Tags, History, Export, Delete for Notes; Focus, Source, divider, Insert image, Delete for Documents. Preserve hover labels, keyboard access, deletion confirmation, and focus restoration after deletion and the History dialog.

Bold, Italic, Heading, Bullet list, Quote, and Table belong in Tiptap’s selection toolbar, shown beside selected editor text in both Markdown modes. Preserve selection during formatting, keyboard access, Escape dismissal, and touch target sizing. Hide it in source/plain-text mode and when editing is unavailable.

Insert image stays in the top editing toolbar, available in both Markdown modes. Documents embed supported raster images as data URLs within the document size limit; Notes use private attachment references. Do not store Document images in the Notes library. Keep image insertion unavailable for plain-text and source mode.

Documents use folder navigation and the editor; Notes use one resizable sidebar containing Search and Add Note, then tags and untagged notes directly, with no All Notes wrapper. Tags/subtags use the same folder rows/disclosure controls as Documents, with disclosure arrows and no tag icons; manage tags through the Tags toolbar popover, with no inline hashtag controls or sidebar tag-edit controls; notes use compact rows with dash markers instead of file icons. Untagged notes live at the sidebar root; multi-tag notes appear under each direct tag. Sort folders/notes alphabetically, remember expansion, and preserve keyboard tree navigation. Search returns matching notes once across the whole library. Preserve each mode's sidebar width and active item. Keep one sidebar toggle in the editor header for both modes; it collapses/restores the single sidebar. The keyboard shortcut must use the same behavior. Do not add a duplicate toggle in the note list or a separate editor note-list toggle. Preserve access to navigation in narrow and touch layouts.

Align the Notes sidebar toggle and editor toolbar with the Documents header, with navigation expanded or collapsed. Keep the native macOS header's 64px geometry and window-control clearance. Let controls wrap only when available space requires it; do not force Notes breadcrumbs or toolbar groups to full-width rows on desktop.

Focus mode positions the typing line about 40% down the editor and fades surrounding controls while typing, restoring them after two seconds idle or user interaction. Preserve editor geometry while fading.

## Data and compatibility

- Documents belong in the user's selected local folder. Notes belong in the app-private SQLite library and attachment directory. Never store either kind of content in localStorage or sessionStorage.
- `src/library.ts` and `src-tauri/src/library.rs` own note autosave, revision checks, draft recovery, backups, and the sync outbox. `src-tauri/src/note_sync.rs` and `src-tauri/apple/NoteSync.m` own CloudKit transport. Flush both controllers before quit/background completion.
- Preserve library migrations, revisions, drafts, and attachment hashes. Sync acknowledges only the exact uploaded revision; never clear newer queued edits or silently overwrite a cloud conflict. Keep the library bound to its first iCloud account.
- Keep CloudKit network waits outside the frontend save/navigation queue. Coalesce concurrent sync requests and reconcile only clean, unchanged editor snapshots; never replace edits made while IPC was awaiting a response. Preserve the native exact-revision acknowledgement rule.
- Keep Notes usable offline. A sync that changes only metadata must not reload editor content or reset selection, undo history, or source mode. Preserve failed drafts until a successful save/recovery copy or explicitly confirmed discard.
- Notes tags derive from Markdown, including nested and multiword tags. The Tags popover manages tags outside the formatted editor body, using undoable editor document attributes and serializing tags to Markdown for existing persistence/export/sync compatibility. Read legacy tags without rewriting on open. Treat hashtags typed in formatted text as literal text and escape them when serializing. Keep tags through select-all body replacement, source toggles, reload, undo, and recovery. The popover removes exact tags without removing descendants. Do not introduce a second persistent tag store. Exclude code, escaped hashtags, and image/link syntax. Tag removal must retain the notes. Keep attachment references stable; resolving an image for display must not rewrite its Markdown. Crop and resize edits preserve original bytes and use width/data-crop attributes on HTML image tags in Markdown. Preserve these through reload, source mode, history, backup/export, and sync. Do not flatten or replace originals silently; external viewers may ignore crop metadata.
- Notes have no Pinned, Archive, Today, To-do, or Trash views. Confirm permanent deletion, remove note content/history, and queue a content-free deletion marker for sync. Keep markers to prevent stale clients from resurrecting IDs. Preserve concurrently edited remote text as a separate recovery copy/draft. Delete only unshared assets referenced by the deleted note, retaining references from surviving notes, history, cloud bases, and drafts. Legacy archived/trashed notes remain visible in the Notes sidebar for explicit deletion.
- Backup imports add independent copies without overwriting existing notes. Preserve images, revisions, drafts, and legacy metadata/preferences when reading older backups. Do not migrate document folders into Notes automatically or introduce attachment/revision cleanup without a retention policy covering recovery and unsynced data.
- CloudKit tests require explicit opt-in and an isolated test container/zone. Never test by modifying the user's live library. Signing identities and provisioning remain local.
- Preserve autosave ordering and flush pending changes before navigation, workspace changes, and quit.
- Never overwrite externally changed files or silently discard drafts. Preserve conflict recovery, non-overwriting creation/rename, and OS Trash-based deletion for Documents. Notes use confirmed permanent deletion as described above.
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
- iOS development: `npm run ios:dev -- --open`, select `anubis_iOS` and a simulator in Xcode. Its Test action exercises native Notes startup, editing, backgrounding, and relaunch.
- iOS simulator build: `npm run ios:simulator` automates the Tauri helper, project regeneration, and generic Xcode build-for-testing through `scripts/ios-simulator.mjs`. It needs full Xcode but not a matching installed runtime to compile. Native test execution still requires a simulator/device. Keep its helper cleanup and distinct UI-test bundle identifier intact.
- Formatting: Prettier for frontend files, `cargo fmt --manifest-path src-tauri/Cargo.toml --check` for Rust, and `git diff --check` for whitespace.

Add meaningful regression coverage for changes to persistence, file operations, focus handling, or interaction behavior. Pure documentation and small cosmetic changes do not require a full test suite or installer build. Mocked UI tests do not prove native dialogs, window controls, signing, or OS integration work.

For sidebar/header changes, cover both modes, expanded/collapsed navigation, macOS window-control spacing, and narrow touch layouts. Use geometry assertions when checking alignment or overlap; screenshot appearance alone does not verify interactions. The mock library in `tests/native-fixture.ts` uses test-only browser storage and must never become a production persistence fallback.

## Builds and disk use

Build macOS installers with `npm run desktop:build -- --bundles dmg`. Output is under `src-tauri/target/release/bundle/dmg/`. When delivering an installer, copy the completed Anubis DMG to `~/Downloads` and verify the copy. Do not overwrite supplied artwork while preparing platform icons.

The default installer is local-only. When delivering Notes sync, use the local CloudKit signing/profile configuration described in README, embed the provisioning profile, and verify signed entitlements and the app inside the DMG. Do not substitute the ordinary build for a requested sync-enabled installer. Development builds require a profile containing the target device's Provisioning UDID; do not confuse it with the Mac's hardware UUID. Report signing verification separately from live sync validation.

Rust build output can occupy several gigabytes. `cargo clean --manifest-path src-tauri/Cargo.toml` removes regenerable build artifacts, including bundled apps and installers in `target`; preserve any requested deliverables first. Avoid rebuilding desktop installers for documentation-only work.

Keep build output, dependencies, local research captures, credentials, and test artifacts out of Git. Commit both dependency lockfiles when dependencies change. Do not delete user files or unrelated working-tree changes.

On iOS, keep security-scoped access alive until the selected folder is replaced successfully, and persist bookmarks rather than absolute sandbox paths. Use the native background save task and system Trash bridge. Never fall back to permanent deletion when a provider cannot trash a file. Keep signing teams, provisioning profiles, generated Externals, and build output out of Git.

For iCloud Drive, keep coordinated access around validation and the entire filesystem operation. Preserve both cloud versions and unsaved text before resolving a conflict; never select a winner silently. Distinguish local persistence from confirmed upload. Keep directory/status inspection from downloading every document. iCloud tests require explicit opt-in and must use only their own temporary directories.
