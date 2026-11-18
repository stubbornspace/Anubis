# Notes library implementation checklist

## Delivered in the first implementation

- [x] Separate Documents/Notes navigation and responsive library/tag/list/editor layout.
- [x] Native SQLite migrations, stable note IDs, revision checks, draft recovery, and persistent upload outbox.
- [x] Shared Markdown editor, local autosave, save-before-navigation and close/background coordination.
- [x] Create, pin, archive, trash, restore, history, search, sorting, and built-in library views.
- [x] Inline nested/multiword tags, autocomplete, clickable filters, pin/rename/remove controls.
- [x] Image import through paste/drop/file selection, immutable references, previews and Markdown ZIP export.
- [x] Library backup/restore, including images, revisions, drafts and Trash; non-overwriting import.
- [x] Nonblocking foreground sync: local autosave/navigation continue during network waits; concurrent edits and failed uploads retain recovery protection.
- [x] CloudKit native transport for private notes/images, incremental fetch, exact-revision upload acknowledgement, conflict copies, and account binding.
- [x] Optional CloudKit development entitlement/config templates and setup instructions.
- [x] Native persistence/backup/conflict tests and desktop/touch UI regression coverage.

## Remaining before calling sync production-ready

- [x] Register and provision `iCloud.com.stubbornspace.kronos` under the user's Apple Developer team. Local macOS/iOS development profiles found; macOS signed app, embedded profile, target Mac provisioning eligibility, and DMG verified November 15, 2026. A refreshed development profile covering all five registered Macs was embedded and verified in a new Apple Silicon DMG; the Downloads copy checksum matched. The user subsequently confirmed that both Macs launch and sync successfully.
- [x] Basic Mac ↔ Mac launch and CloudKit sync confirmed by the user with the five-Mac development build on November 15, 2026.
- [x] Signed CloudKit-enabled iOS build installed on RazorCrest (M4 iPad Pro, iPadOS 27.2) on November 15, 2026; Apple device tools confirmed installation. Launch and live iPad sync await user verification.
- [ ] Validate actual Mac ↔ iPhone/iPad transfers, including offline/concurrent edits, large images, account changes and provider errors.
- [ ] Validate native iOS image selection and export share-sheet behavior on a simulator/device.
- [ ] Deploy CloudKit schema and prepare production signing after the development validation.

## Deferred polish and scale work

- [ ] Push-driven/background cloud delivery (current sync runs while the app is in the foreground).
- Pinned-tag UI removed in the single-sidebar update; legacy backup preferences remain compatible.
- [ ] Import Markdown with sibling image folders, and export multiple selected notes.
- [ ] Incremental large-library indexing/list virtualization; current library reads note content to derive summaries.
- [ ] Explicit revision retention and attachment cleanup policy covering surviving revisions, drafts and unsynced references.
- [ ] Raise/stream the 256 MB backup import limit with bounded memory use.

No existing document folder is migrated or copied into the library automatically.

## Single-sidebar Notes update

- [x] One Notes sidebar: Search/Add Note, expandable All Notes → tags/subtags → note file rows; shared collapse/resize behavior with Documents.
- [x] Remove Pinned, Archive, Today, To-do, and Trash navigation/actions. Existing hidden notes are visible in All Notes; no automatic library wipe.
- [x] Confirmed permanent deletion removes note/history/draft content and unshared image files. Content-free sync markers prevent stale note IDs from returning.
- [x] Preserve concurrent offline edits as separate recovery copies or drafts; keep shared images and exact-revision upload acknowledgements safe.
- [ ] Validate new deletion behavior between upgraded native devices. Previously verified Mac sync predates this change. Upgrade every synced device before testing deletion.

Validation for the single-sidebar update: 132 UI tests passed across Chromium/WebKit/iPhone/iPad, 16 unit tests passed, and 27 native tests passed (one opt-in iCloud test skipped). Desktop Rust check and iOS simulator app/native-test compilation passed. One iPhone background-save UI test transiently failed during an earlier concurrent run; three focused reruns and the final full run passed. Native multi-device deletion has not yet been exercised.

The single-sidebar branch was built with CloudKit development signing and installed over Anubis on RazorCrest. Apple device tools confirmed installation; app launch, the new sidebar, and native deletion still await user verification. The Macs have not yet received this branch build.

The Notes sidebar was corrected to match the Documents tree: expandable All Notes, tag/subtag folders, compact note file rows, remembered expansion, and arrow-key navigation. Untagged notes sit at the root; multi-tag notes appear in each direct tag folder. Search returns a deduplicated list across collapsed branches.

Tree-layout validation: 68 Notes/mobile UI tests passed across Chromium/WebKit/iPhone/iPad, including nested hierarchy, keyboard navigation, persisted expansion, multi-tag membership, global search, and tag-scoped note creation. Frontend compilation and the signed physical-iOS build passed. The corrected tree build was installed on RazorCrest successfully; on-device visual/interaction confirmation remains with the user.

## Tags popover

- [x] Direct Tags toolbar button with removable chips, existing-tag suggestions, nested/multiword tag entry, and Escape/outside dismissal.
- [x] Tags stay outside formatted editor text in undoable document attributes, while retaining Markdown source/export/sync compatibility. Legacy tags are read without rewriting on open; literal hashtags typed in formatted text are escaped, with no inline tag controls. Exact removal retains descendants and protected code/link text.
- [x] Rich-text changes retain undo through editor transactions; source changes use the existing autosave controller.
- [ ] Verify the Tags popover with the native iOS software keyboard on device. Mocked touch tests do not establish native keyboard behavior.

## Shared navigation tree

- [x] Documents and Notes share recursive rows, disclosure controls, indentation, and keyboard traversal through `src/sidebar-tree.tsx`.
- [x] Mode adapters retain their data controllers, selection/creation behavior, expansion state, and search rules. File actions remain in the Documents adapter.
- [x] Preserve theme colors, editor-sized sidebar text, the active left border, Notes dash markers, and native sidebar/header geometry.

## Direct tag navigation

- [x] Remove the All Notes wrapper; show tags/subtags and root-level untagged notes directly. Ignore the obsolete root-collapse preference without deleting it.
- [x] Keep tag expansion, deduplicated search, keyboard traversal, and tag-scoped creation. Clicking the selected tag clears the creation destination; missing tags no longer affect new notes.

## Notes-only iOS

- [x] Open Notes regardless of the legacy mode preference; remove iOS mode buttons and document-folder restoration. Keep desktop Documents and Notes.
- [x] Preserve existing document files, bookmarks, and recovery drafts without automatic migration. Keep Notes import/export and the background-save bridge.
- [x] Update mobile regression coverage and the native Notes smoke test.
- [ ] Run the updated native smoke test on a simulator/device and verify import/export through the native Files picker/share sheet.
- [ ] Verify CloudKit Notes sync on a signed physical iPhone/iPad; mocked mobile tests do not establish live sync.

Validation: 18 iPhone/iPad mocked UI tests and 68 desktop Chromium/WebKit Notes and document-cloud tests passed. Frontend compilation, formatting, and iOS simulator app/native UI-test compilation passed. The updated native test has not been executed on a device or simulator.

## iPad layout review fixes

- [x] Position and constrain Tags against the visual viewport, including keyboard resize and panning.
- [x] Apply iOS touch targets and keyboard/safe-area dialog bounds to body portals, including History and Crop & resize.
- [x] Keep New Note at least 44px tall at minimum App zoom.

Validation: frontend build, formatting, 22 mocked iPhone/iPad tests, and 16 focused Chromium/WebKit tests passed. New geometry tests cover minimum-zoom touch targets, History bounds and focus restoration, and Tags during keyboard resize/panning. Native keyboard and VoiceOver validation remain pending; Device discovery could not locate simctl during the review.

The Notes-only iOS build with the iPad layout fixes was installed over Anubis on RazorCrest on November 16, 2026. The app signature, CloudKit Development entitlements, bundle identity, and embedded provisioning profile covering the iPad were verified. Native launch, keyboard/VoiceOver behavior, and live sync were not exercised during this deployment.

The follow-up iPad screenshot exposed unnecessary header wrapping that the earlier bounds-only tests missed. The iOS header now sizes to the editor column, truncates the title before wrapping actions, and reserves no horizontal width for quiet save status. Keyboard dismissal appears only when the visual viewport indicates a keyboard and blurs the editing target on touch. Added same-row geometry assertions at 1000px and 1194px with navigation expanded/collapsed. All 24 mobile tests and three focused desktop header tests passed; the signed device build passed. Native screenshot confirmation remains pending.

## ReUI / Headless Tree sidebar

- [x] Adapt ReUI Basic Tree's Tree/TreeItem/TreeItemLabel composition to Anubis theme tokens in `src/components/tree.tsx`, using `@headless-tree/core` and `@headless-tree/react` for tree state, focus, and ARIA metadata. No Tailwind or app-wide shadcn restyling.
- [x] Retain separate disclosure controls, tag creation selection, note dash markers, file action menus, expansion controllers, multi-tag membership, deduplicated search, and save-before-navigation.
- [x] Update UI selectors for treeitem roles and aria-selected, and test hierarchy levels and a single row in the keyboard tab order. Preserve empty-folder Right Arrow behavior.
- [x] Install the signed tree migration on RazorCrest (November 16, 2026); signature, CloudKit Development entitlements, app identity, and embedded profile verified.
- [x] Install the same signed tree migration on Andor (November 16, 2026); signature, CloudKit Development entitlements, bundle identity, and provisioning coverage verified. Native interactions and live sync were not exercised.
- [ ] Verify the new tree interactions and VoiceOver on RazorCrest; installation does not establish native interaction or live sync behavior.

Validation: frontend compilation and formatting passed. 140 UI tests passed across Chromium, WebKit, iPhone, and iPad. The zoom assertion was corrected to the existing 14px sidebar font token (21px at 150%); this migration does not change sidebar typography.

## Horus native shell prototype

- [x] Build the existing `Horis/` SwiftUI starter into a separate iOS shell with in-memory mock notes/tags, native split navigation, search, editing placeholders, and Tags/Settings sheets.
- [x] Compile for the generic iOS simulator and validate mock hierarchy, search deduplication, selection/deletion, and navigation edit retention.
- [ ] Review iPad/iPhone layouts, appearances, accessibility sizes, keyboard, and VoiceOver interactively. Device-panel discovery could not find `simctl`.
- [ ] Refine the shell design before adding the WKWebView/Tiptap editor and existing Notes backend. Production Anubis data and persistence remain separate.

See `Horis/README.md` for the prototype's scope and build commands. Its starter iOS 27.2 deployment target is unchanged; mock edits reset on relaunch.
