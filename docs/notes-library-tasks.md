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
- [ ] Validate actual Mac ↔ iPhone/iPad transfers, including offline/concurrent edits, large images, account changes and provider errors.
- [ ] Validate native iOS image selection and export share-sheet behavior on a simulator/device.
- [ ] Deploy CloudKit schema and prepare production signing after the development validation.

## Deferred polish and scale work

- [ ] Push-driven/background cloud delivery (current sync runs while the app is in the foreground).
- [ ] Sync pinned-tag preferences (inline note tags and note metadata already travel with the note).
- [ ] Import Markdown with sibling image folders, and export multiple selected notes.
- [ ] Incremental large-library indexing/list virtualization; current list reads note content to derive previews.
- [ ] Explicit revision retention and attachment cleanup policy covering Trash, drafts and unsynced references.
- [ ] Raise/stream the 256 MB backup import limit with bounded memory use.

No existing document folder is migrated or copied into the library automatically.
