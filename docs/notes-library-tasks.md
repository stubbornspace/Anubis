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
