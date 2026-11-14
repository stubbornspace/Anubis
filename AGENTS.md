# Anubis contributor guide

## Project

Anubis is a desktop and iOS Markdown and plain-text editor built with React, TypeScript, Tiptap, Vite, and Tauri 2. Preserve both targets; do not add a standalone web product or Android scaffolding unless requested.

- `src/main.tsx`: editor, sidebar, settings dialog, and UI state.
- `src/workspace.ts`: workspace controller, autosave, filesystem IPC, and close coordination.
- `src/style.css`: layout and component styles.
- `src/ocean.css` and `src/atom-one.css`: The Blues and Atom One light/dark tokens.
- `src-tauri/src/workspace.rs`: native file operations and filesystem tests.
- `src-tauri/src/lib.rs`: Tauri commands, folder picker, watcher, and lifecycle handling.
- `src-tauri/tauri.conf.json`: app identity, window configuration, and bundles.
- `public/icons/anubis-app.png`: source app icon; `anubis-light.png` and `anubis-dark.png`: themed sidebar logos.
- `tests/native-fixture.ts`: mocked Tauri boundary for Playwright tests.
- `src-tauri/plugins/ios-workspace/`: native iOS folder bookmarks, security-scoped access, Trash, and background save coordination.
- `src-tauri/gen/apple/project.yml`: iPhone/iPad Xcode project and native UI test definition; regenerate with `xcodegen generate --spec src-tauri/gen/apple/project.yml`.
- `src/platform.ts` and `tests/mobile.spec.ts`: iOS UI detection and touch/keyboard regression tests.
- `src-tauri/src/recovery.rs`: private iOS draft journal; retain it until a successful save/copy or an explicitly confirmed discard.

Read `README.md` for supported formats, limits, and known behavior. The `analysis/` folder contains historical research, not runtime dependencies.

## Product conventions

Keep the writing interface minimal. Use system fonts and existing Lucide icons. Give icon-only buttons descriptive accessible names and hover labels. Preserve keyboard focus, Escape dismissal, and reduced-motion support.

Use theme tokens rather than adding isolated colors. Check both themes and appearances when changing styles. Settings live in a dialog. The sidebar is resizable and remembers its width; keep the native macOS controls aligned with the header.

Focus mode positions the typing line about 40% down the editor and fades surrounding controls while typing, restoring them after two seconds idle or user interaction. Preserve editor geometry while fading.

## Data and compatibility

- Documents belong in the user's selected local folder. Never store document contents in localStorage.
- Preserve autosave ordering and flush pending changes before navigation, workspace changes, and quit.
- Never overwrite externally changed files or silently discard drafts. Preserve conflict recovery, non-overwriting creation/rename, and Trash-based deletion.
- Keep native filesystem operations within the selected root; retain path validation, symlink restrictions, encoding handling, and size limits.
- Opening a document must not rewrite it.
- The bundle identifier `com.stubbornspace.kronos` and existing `kronos.*` / `typclone.*` preference keys intentionally preserve compatibility after the Anubis rename. Do not rename them without an explicit migration plan.
- The GitHub repository still uses the Kronos name. Do not rename remotes or the repository as part of UI branding changes.

## Development and validation

Install dependencies with `npm ci`. Run the desktop app with `npm run dev`. The `frontend:*` scripts support Tauri and tests; they are not a separate web release.

Choose checks appropriate to the change:

- Frontend compile: `npm run frontend:build`.
- Editor unit tests: `npm test`.
- UI behavior: `npm run test:e2e`; `npm run test:webkit` covers the engine closest to macOS. Use focused test filters for localized changes.
- Native filesystem behavior: `npm run test:native`.
- Rust compilation: `npm run desktop:check`.
- iPhone/iPad UI: `npx playwright test --project=iphone --project=ipad`. These use mocked IPC and cannot prove Files access or iOS lifecycle behavior.
- iOS development: `npm run ios:dev -- --open`, select `anubis_iOS` and a simulator in Xcode. Its Test action exercises native folder access, editing, relaunch, and Trash.
- iOS simulator build: `npm run ios:simulator`; when CLI SDK/runtime versions differ, build through the Xcode project with an installed simulator as documented in README.
- Formatting: Prettier for frontend files, `cargo fmt --manifest-path src-tauri/Cargo.toml --check` for Rust, and `git diff --check` for whitespace.

Add meaningful regression coverage for changes to persistence, file operations, focus handling, or interaction behavior. Pure documentation and small cosmetic changes do not require a full test suite or installer build. Mocked UI tests do not prove native dialogs, window controls, signing, or OS integration work.

## Builds and disk use

Build macOS installers with `npm run desktop:build -- --bundles dmg`. Output is under `src-tauri/target/release/bundle/dmg/`. When delivering an installer, copy the completed Anubis DMG to `~/Downloads` and verify the copy. Do not overwrite supplied artwork while preparing platform icons.

Rust build output can occupy several gigabytes. `cargo clean --manifest-path src-tauri/Cargo.toml` removes regenerable build artifacts, including bundled apps and installers in `target`; preserve any requested deliverables first. Avoid rebuilding desktop installers for documentation-only work.

Keep build output, dependencies, local research captures, credentials, and test artifacts out of Git. Commit both dependency lockfiles when dependencies change. Do not delete user files or unrelated working-tree changes.

On iOS, keep security-scoped access alive until the selected folder is replaced successfully, and persist bookmarks rather than absolute sandbox paths. Use the native background save task and system Trash bridge. Never fall back to permanent deletion when a provider cannot trash a file. Keep signing teams, provisioning profiles, generated Externals, and build output out of Git.
