# Horus native shell

A SwiftUI iPhone/iPad design prototype, built in the existing `Horis` Xcode project. The folder, scheme, and target retain their starter names; the app displays **Horus**. Its separate bundle identity leaves the production Anubis app and library untouched.

Open `Horis.xcodeproj` in Xcode, select the **Horis** scheme and an iPad simulator, and Run. This starter targets iOS 27.2; that deployment target has been preserved. Set your development team locally for a physical device. Signing configuration is not shared in Git.

## What works

- Native two-column navigation, with system sidebar collapse and compact navigation.
- Search across titles, bodies, and tags; matching notes appear once.
- Nested tag disclosures, alphabetical notes, multi-tag membership, and root-level untagged notes.
- Editable title/body, new notes, confirmed deletion, and the native share sheet.
- Tags sheet with exact tag removal and slash-separated nested tag creation.
- Settings sheet with System, Light, and Dark appearance.
- System typography, Dynamic Type, accessible control labels, keyboard dismissal, and safe-area handling.

Notes and tags are mock data in memory. Changes survive navigation but reset on a new app launch. Only appearance is stored as a preference. There is no SQLite, CloudKit, Tauri, or access to the user's existing notes. Focus, Source, Insert image, and History are disabled design placeholders. This is not a durable writing app yet.

## Structure and next phase

`ContentView.swift` owns the split view and scene state. `Sidebar/` owns navigation; `Models/` supplies mock data and tag hierarchy; `Editor/NoteDetailView.swift` contains the temporary native editing surface. Replace that surface with a WKWebView/Tiptap host after the shell design is approved. Keep note selection and the native Tags/Settings presentation outside the web editor.

Before connecting real notes, replace `MockLibrary` with an adapter to the existing persistence/recovery backend and implement acknowledged saves, background flushing, tag serialization, and attachment resolution. Mock tag arrays are not a new production tag store.

## Validation

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project Horis/Horis.xcodeproj -scheme Horis -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/horus-shell-build CODE_SIGNING_ALLOWED=NO build

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc \
  -parse-as-library Horis/Horis/Models/*.swift Horis/Tests/ModelChecks.swift \
  -o /tmp/horus-model-checks
/tmp/horus-model-checks
```

Run these commands from the Anubis repository root. The model checks cover nested/direct tag membership, search deduplication, edits across navigation, expansion, deletion, and empty-library recovery.

Compilation and model checks passed. Interactive layout checks remain pending: iPad landscape/portrait and resized windows, iPhone navigation, both appearances, large Dynamic Type, hardware keyboard, and VoiceOver. Device-panel simulator discovery currently fails because its `xcrun` cannot find `simctl`; the build commands above explicitly select full Xcode.
