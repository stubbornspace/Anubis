# Cantina — Technical Design &amp; Codex Implementation Specification

**Status:** CloudKit sync and AWS recipe export implemented; two-device sync validation pending · **Version:** 1.8 · **Date:** 2026-11-08

## Recipe photo import — implemented November 8, 2026

Add recipe → From photos supports iOS camera/photo library and macOS saved images,
up to four ordered photos for one recipe. A dedicated authenticated endpoint uses
Nova Lite vision and validated structured output for faithful Markdown transcription.
Multiple recipes trigger title selection; unreadable images request a retake.
Title and existing category/tag suggestions remain editable. Unclear text is shown
with page references and requires acknowledgment before Save. The draft is committed
in one repository write; only an explicitly selected (optionally cropped/replaced)
hero image is retained. Other source photos are temporary and no source-image
archive is created. Normal CloudKit sync / AWS text export apply after saving.
Camera capture requires physical iOS verification.

## Current architecture decision — supersedes the AWS synchronization proposal below

SQLite remains the offline working database. CloudKit is the device-sync authority for personal macOS/iOS installations using the same Apple account. AWS receives an explicit, versioned recipe-text export for backup and Bedrock context; it is not a second synchronization authority. No DynamoDB or vector knowledge base is deployed.

- Native Swift CloudKit bridge uses private container `iCloud.com.stargate.cantina`, custom `Recipes` zone and `Recipe` records. JSON payloads contain recipe metadata, Markdown and deletion tombstones; hero images use CKAsset. Local absolute image paths never enter cloud records.
- SQLite migration `0002_cloudkit.sql` records CloudKit system fields, change tags, payload hashes and acknowledged local generations. Conditional saves reject concurrent changes. When both devices edit a recipe, preserve the local live edit as a conflict copy and apply the fetched remote version. Deletions remain tombstones. A changed Apple account or a deleted bound zone stops synchronization without replacing local data.
- Settings provides Sync now and optional sync on app opening/foregrounding (30-second throttle). Sync flushes drafts and allows editing throughout; a separate sync-worker mutex serializes syncs, while the repository writer lock covers local reconciliation and acknowledgments only. Refresh preserves newer UI drafts even after partial failure. Automatic sync also polls every 60 seconds while visible. This intentionally differs from the earlier proposed outbox worker below.
- Initial transport fetches the whole personal zone, bounded to 1,000 records and 128 MiB of downloaded payloads/assets per fetch; individual images are limited to 10 MiB. Incremental tokens, background push sync, account switching and a conflict-resolution UI are future improvements. External hard deletion of CloudKit records is unsupported; application deletion uses tombstones.
- AWS `POST /v1/exports` requires `library:export`; authenticated library identity determines the S3 key. The snapshot includes title, category, tags, Markdown, ID and update time, but no images, credentials, chats or SQLite file. Maximum 1,000 recipes / 4 MiB. The private encrypted bucket retains object versions and survives stack deletion. This text backup does not yet have an app restore workflow.
- Chat reads the latest export, supplies a catalogue of up to 100 titles and up to five keyword-selected excerpts (30,000 characters total), alongside the current local recipe. This is bounded direct context for Nova Micro, not Bedrock Knowledge Bases retrieval. Export runs automatically after successful sync when the snapshot changes, with a durable credential-scoped fingerprint and retry on the next sync after failure. Manual export remains available; the model is instructed to distinguish stale exports from local edits and avoid claiming exhaustive search.
- Signed development builds for macOS and iOS use the CloudKit Development environment. Before TestFlight/distribution, deploy the schema to Production and use matching production provisioning. API credentials remain in the native Keychain and do not sync through CloudKit.

Validation: 12 native repository tests, 16 frontend unit tests, 12 targeted browser tests and 37 backend tests passed. Signed build 9 and the Mac package were produced. Two-device edit/image/delete/conflict checks remain a physical-device acceptance step.

**Historical design below:** The remaining v1.7 sections preserve earlier rationale and future ideas. Their DynamoDB authority, AWS sync routes/outbox protocol, S3 image sync and vector knowledge-base architecture are superseded by the decision above and are not descriptions of the deployed system.

## 1. Product summary

Cantina is a minimalist, local-first recipe library for macOS and iOS. Users browse recipes by category or image grid, view a large hero image and formatted recipe, and edit the recipe body directly with TipTap. A later AI assistant uses Amazon Bedrock to answer questions about the user's saved recipes and a separate cookbook knowledge base.

**Core principle:** Local SQLite is the working database; the app must remain fully usable offline. AWS sync and AI are optional services, not prerequisites for viewing or editing recipes.

**Current milestone:** The shared frontend and Tauri shells now use a Rust/sqlx SQLite repository on native macOS/iOS, with versioned migrations, managed image files, generation-checked autosave, search indexing and transactional pending sync metadata. First native launch imports the existing WebView library and keeps its original localStorage entry as a recovery copy. Fresh installs seed dummy recipes once; the web preview retains browser storage. Repository rollback/concurrency/image/reopen tests and desktop/mobile UI tests cover the storage boundary. The actual macOS WebView has migrated eight recipes and eight photos successfully. Interactive iOS validation remains outstanding. The `backend/` CDK project and authenticated Bedrock streaming handlers are implemented and locally tested, deployed in us-west-1 with Nova Micro via us-west-2 and connected through native Keychain/network commands. Live API streaming passed; physical-device chat validation remains. Cloud sync and knowledge-base retrieval are not implemented.

### 1.1 Goals

- Clean, distraction-free interface with minimal buttons.
- Recipe fields: title, category, tags, hero image, Markdown body.
- Local storage of structured data and images; offline editing and browsing.
- Cross-device synchronization between personal macOS and iOS installations.
- AI assistant that can retrieve saved recipes and external cookbook material, distinguish their provenance, and link recommendations to real recipe IDs.
- Low-maintenance AWS infrastructure provisioned with CDK.

### 1.2 Non-goals for MVP

- Multi-user accounts, sharing, subscriptions, collaboration.
- Parsing ingredients, quantities, cooking times or nutrition into dedicated fields.
- Cloud dependence for basic recipe CRUD.
- AI modifying recipes without explicit user approval.
- Importing and indexing an entire cookbook library in the first milestone.

## 2. Stack


| Layer           | Choice                                                                                 |
| --------------- | -------------------------------------------------------------------------------------- |
| UI              | React + TypeScript + Vite + shadcn/ui + Tailwind CSS                                   |
| Packaging       | Tauri 2 for macOS and iOS/iPadOS; shared frontend                                      |
| Editor          | TipTap with Markdown import/export; Markdown is persisted canonical content            |
| Local DB        | SQLite via Rust `sqlx`; typed Tauri commands own reads and transactions                |
| Local assets    | Tauri app data directory; image files on disk                                          |
| Backend         | AWS API Gateway REST API + Lambda (Node.js/TypeScript)                                 |
| Cloud records   | DynamoDB (sync authority)                                                              |
| Object storage  | S3 for images, versioned portable backups, generated KB documents and cookbook sources |
| AI              | Amazon Bedrock ConverseStream with tool orchestration in Lambda                        |
| Semantic search | Amazon Bedrock Knowledge Bases backed by S3 Vectors                                    |
| IaC             | AWS CDK in TypeScript                                                                  |


**Decision:** Use DynamoDB from the first cloud-sync milestone. An S3-only sync system is possible but requires building change discovery, revisions, and conflict handling manually. S3 is not the transactional recipe database.

**Existing application:** Extend `app/` and its existing Tauri shell under `app/src-tauri/`. Preserve the React/Vite/TypeScript frontend, shadcn components, theme, header and chat shell. Keep the current package and development workflow rather than generating a second frontend or moving to `apps/desktop/`. Deployment minimums are macOS 13.3 and iOS/iPadOS 16.4. Current builds are for local development; macOS distribution signing/notarization and iOS App Store distribution are separate release work.

## 3. UX and screens

### 3.1 Library/home

- Default to recipe titles only under colored category headings, without tag labels. Within each category, titles flow down two columns on larger screens and one column on iPhone or narrow panels, using the same viewport/container thresholds as recipe bullet lists.
- Start the home page directly with category groups or the image grid, without a visible “Recipes” title or count. Keep a screen-reader-only page heading.
- The header contains the Cantina breadcrumb and one dropdown trigger. On detail, show “Cantina › Recipe title” using shadcn’s default breadcrumb separator; Cantina links to the library, replacing the back action. Truncate long recipe titles visually without losing their accessible text. Preserve the selected view when returning to the library.
- Keep other page-level actions in the dropdown: a single list/grid switch and search on the library, plus create, recipe metadata editing, chat and a Settings link. Theme controls live on the Settings page. Image actions belong beside the image, outside this dropdown.
- The dropdown contains “Add recipe” throughout the app, plus “Edit metadata” when viewing a recipe.
- Category filter and optional tag filter.
- Grid: a continuous gallery of recipe images, titles and categories, without tag labels. List: titles only under category headings, without thumbnails. Tags remain available in metadata, recipe details and search.
- Search locally across title, category, tags and Markdown content.
- Empty state offers “Create recipe.”

### 3.2 Recipe detail/editor

- Large hero image at top, approximately upper half of initial viewport on desktop; responsive crop on mobile.
- Show the title as a heading; edit title, category and tags in a small metadata dialog opened from the dropdown.
- TipTap displays the recipe body as formatted rich text; click/focus to edit in place, no edit/view mode toggle.
- Top-level bullet lists flow down two columns on wide screens when the document has at least 30rem of space. Phone layouts, including landscape, use one column. Keep each bullet and its nested list together; numbered instructions remain a single sequence. This is a presentation rule, not a change to the saved Markdown.
- Debounced autosave to SQLite, with visible saving/error status and no blocking network calls.
- Without a hero image, show a quiet “Add image” action above the title, with no large empty placeholder. An existing image has a corner menu for “Replace image” and “Remove image”; show its trigger on hover/keyboard focus and always on touch devices. Keep image actions out of the header dropdown.
- Delete action requires confirmation; use soft deletion for sync.

### 3.3 Create recipe

- Choose “Add recipe” from the dropdown to open a small metadata dialog for title, category and tags.
- On creation, open the recipe detail immediately with an empty TipTap document and optional image action at the top.
- The main recipe view has no form layout or permanent formatting toolbar. TipTap formats the document in place, with contextual controls on text selection.

### 3.4 AI assistant

- Icon-only launcher at the bottom right; responsive chat panel with safe-area-aware composer. Native backend connection is implemented; browser chat remains disabled.
- Distinguish “Your recipes” from “Cookbook reference” in answers.
- Recipe suggestions render actionable cards referencing existing recipe IDs.
- Assistant cannot directly edit/delete recipes in MVP.

### 3.5 Settings

Settings use a dedicated page at `#/settings`, with “Cantina › Settings” in the header. Start with an Appearance section for Light, Dark and System theme options, applied immediately and persisted in browser/WebView storage for the prototype. System tracks device appearance changes. Default font size is an installation-local preference from 12px to 20px in 1px steps, defaulting/resetting to 16px. Restore it before mounting the UI. Apply it to body/editor text and typography tokens, while keeping the root rem baseline stable so icons, spacing and controls do not zoom with the text. On native iOS/iPadOS, multiply the saved base size by UIKit’s preferred Body text-size ratio, refreshed on foreground/focus; retain the full accessibility range. At larger system sizes, controls wrap/grow and recipe/title lists use one column. The old interface-scale preference is no longer used. Future preferences are added as sections on this page; do not use a modal dialog or sheet for the main Settings destination.

The Chatbot section already provides a plain Markdown instructions textarea with Edit, Save and Cancel. Instructions are currently installation-local. Settings also provides secure token entry and connection controls; never store the token alongside these ordinary preferences.

### 3.6 iPhone usability

Recipes remain directly editable, with no reading/editing mode switch. Phone recipe pages use reduced top spacing and a shorter hero image, including landscape. A VisualViewport-aware Done bar dismisses the keyboard; the editor keeps the insertion point above it, and chat/dialog layouts use the visible viewport while the keyboard is open.

Settings includes Cooking → Keep screen awake, off by default. On iOS, a main-thread UIKit bridge disables the idle timer only while a recipe is visible; leaving the recipe, backgrounding or losing native focus restores normal locking. Supported browsers use Screen Wake Lock with release/reacquisition on visibility changes; unsupported platforms disable the setting. Show active state and failures honestly. This does not prevent manual locking.

Automated browser coverage simulates keyboard viewport changes, system text scaling and wake-lock lifecycle. Native iOS compilation/signing is verified; actual iPhone keyboard, Dynamic Type, idle timer and suspension/restart behavior remain pending because agent device access is disabled.

## 4. Canonical recipe model

```ts
export interface Recipe {
  id: string;                  // UUID for new recipes; legacy IDs retained during migration
  title: string;
  category: string;            // free-form in MVP
  tags: string[];
  heroImageId: string | null;  // logical asset ID, not an absolute path
  content: string;             // Markdown
  createdAt: string;           // ISO 8601 UTC
  updatedAt: string;           // ISO 8601 UTC
  revision: number;            // server-issued revision after sync
  deletedAt: string | null;    // tombstone for synchronized deletion
}

export interface AssetMetadata {
  id: string;                  // UUID
  mimeType: string;
  byteLength: number;
  checksumSha256: string;       // lowercase hex, over the stored file bytes
}

export interface CloudAsset extends AssetMetadata {
  remoteObjectKey: string;      // server-generated immutable object; ready assets only
}

export interface ImageAsset extends AssetMetadata {
  localRelativePath: string | null; // relative to app asset directory; null until downloaded
  remoteObjectKey: string | null;
  uploadStatus: 'not_uploaded' | 'uploading' | 'ready' | 'error';
  localStatus: 'missing' | 'downloading' | 'available' | 'error';
}

export interface LocalRecipeSyncState {
  recipeId: string;
  localGeneration: number;      // increases on each committed local mutation
  ackedGeneration: number;      // latest generation accepted by server or discarded explicitly
  serverSnapshot: Recipe | null; // last acknowledged/applied server record
}
```

**Important:** The app's five user-facing recipe fields are title, category, tags, hero image, and Markdown. The other fields are internal identifiers and sync metadata. Never persist absolute machine-specific image paths in cloud recipe records.

`Recipe` is the cloud wire model. Local generations, outbox state, file paths and download status never go into cloud recipe records. `recipes.revision` is the last acknowledged/applied server revision, not an edit counter. A local recipe is dirty when `localGeneration > ackedGeneration` or an unresolved outbox/conflict entry exists. Each local database belongs to one library; bind it to the authenticated library before sync and reject a different library identity instead of mixing accounts.

### 4.1 SQLite schema

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS image_assets (
  id TEXT PRIMARY KEY,
  local_relative_path TEXT,
  mime_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0),
  checksum_sha256 TEXT NOT NULL,
  remote_object_key TEXT,
  upload_status TEXT NOT NULL DEFAULT 'not_uploaded'
    CHECK (upload_status IN ('not_uploaded', 'uploading', 'ready', 'error')),
  local_status TEXT NOT NULL DEFAULT 'missing'
    CHECK (local_status IN ('missing', 'downloading', 'available', 'error')),
  last_error TEXT,
  CHECK (local_status != 'available' OR local_relative_path IS NOT NULL),
  CHECK (upload_status != 'ready' OR remote_object_key IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  hero_image_id TEXT REFERENCES image_assets(id),
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS recipe_sync_state (
  recipe_id TEXT PRIMARY KEY REFERENCES recipes(id),
  local_generation INTEGER NOT NULL DEFAULT 0,
  acked_generation INTEGER NOT NULL DEFAULT 0,
  server_snapshot_json TEXT,
  CHECK (local_generation >= acked_generation AND acked_generation >= 0)
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  local_generation INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'in_flight', 'conflict')),
  base_revision INTEGER,
  request_json TEXT,
  request_sha256 TEXT,
  created_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  CHECK (
    (state = 'pending' AND base_revision IS NULL AND request_json IS NULL AND request_sha256 IS NULL)
    OR (state IN ('in_flight', 'conflict') AND base_revision IS NOT NULL
        AND request_json IS NOT NULL AND request_sha256 IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS one_pending_operation_per_recipe
  ON sync_outbox(recipe_id) WHERE state = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS one_frozen_operation_per_recipe
  ON sync_outbox(recipe_id) WHERE state IN ('in_flight', 'conflict');

CREATE TABLE IF NOT EXISTS sync_conflicts (
  recipe_id TEXT PRIMARY KEY REFERENCES recipes(id),
  remote_recipe_json TEXT NOT NULL,
  remote_revision INTEGER NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
  recipe_id UNINDEXED, title, category, tags, content
);
```

Maintain FTS index on recipe writes/deletes in the Rust repository, in the same transaction as recipe updates. Exclude tombstoned recipes from search. Treat FTS as rebuildable derived data. Verify FTS5 availability in packaged Tauri SQLite builds. Create the sync metadata tables in Phase 1; the sync transport and conflict UI start in Phase 4.

### 4.2 Markdown example

```markdown
## Notes
Bright, savory pasta with anchovies, capers and lemon.

## Ingredients
- 200 g spaghetti
- 4 anchovy fillets
- 2 tbsp capers

## Method
Cook the spaghetti in salted water.

Gently cook the garlic and anchovies in olive oil. Add capers and lemon zest.
```

TipTap may use an internal JSON document while editing, but save canonical Markdown to `recipes.content`. Test Markdown round trips for headings, lists, emphasis, links and paragraphs. Restrict editor extensions to those that serialize reliably; avoid persisting unsupported TipTap-specific nodes.

## 5. Local architecture

```text
React components
  -> application hooks/services
  -> RecipeRepository interface
  -> typed Tauri commands
  -> Rust repository / sqlx transaction / SQLite

ImageService
  -> Tauri filesystem app-data/images/<image-id>.<ext>

SyncService (optional online)
  -> local outbox
  -> AWS API
```

- All recipe creation/editing/deletion is committed locally first.
- Debounce text autosave (e.g. 500–1000 ms); flush on blur, navigation and app suspension where supported.
- Persist local generation and pending outbox changes transactionally with edits. Coalesce only unfrozen pending work; never change a request that may have reached the server (section 7).
- Use UUID-based filenames for images; generate thumbnails as a later optimization.
- Validate MIME type, maximum file size and decode images safely before storing.
- Store credentials in OS-secure storage, never in SQLite plaintext or frontend environment variables.

### 5.1 Transaction ownership

Rust owns the SQLite pool and versioned migrations. Every mutation command starts one `sqlx` transaction, runs all associated statements through that transaction handle, commits once and returns success only after commit. Use a shared Rust writer mutex to serialize local edits, sync acknowledgements, pull application and conflict resolution; do not hold it across network or filesystem work. Configure foreign keys on every connection, WAL mode and a bounded busy timeout at pool creation.

A local save atomically updates the recipe, increments its local generation, updates FTS and inserts/updates its single pending outbox entry. A pull-page command atomically updates asset metadata, recipes/FTS or durable conflicts, and the cursor. An acknowledgement command atomically updates sync metadata and removes only the acknowledged frozen operation. Failure rolls back the entire command.

Do not implement these transactions using separate frontend `BEGIN`, statement and `COMMIT` calls. The standard [Tauri SQL JavaScript API](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/sql/guest-js/index.ts) has no transaction handle and [executes through a pool](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/sql/src/wrapper.rs). Use one database implementation, the Rust repository, instead of mixing plugin writes with command writes.

The frontend serializes autosaves per recipe and includes `expectedLocalGeneration` in each mutation. A stale generation is rejected without writing; pending editor content must be retained and reconciled rather than silently overwritten. Flush waits for commit on controlled navigation. A forced termination can lose the current uncommitted debounce window; saving/error status must accurately distinguish it from committed data.

Image filesystem operations cannot join the SQLite transaction. Import to a temporary file, validate/decode, hash and atomically rename into the managed directory before committing its asset row and recipe reference. A failed DB commit can leave an orphan file for later cleanup; it must not leave a committed recipe pointing to an unfinished import.

## 6. AWS architecture

```text
Tauri client
   | HTTPS + Cantina bearer token
API Gateway REST API + Lambda authorizer
   |-- Lambda Recipe API ------ DynamoDB Recipes + Change Log
   |-- Lambda Asset API ------- S3 presigned uploads/downloads
   |-- Lambda Backup API ------ S3 versioned portable snapshots
   |-- Lambda Chat API -------- Bedrock ConverseStream -> SSE to client
   |                                |-- Recipe query tool -> DynamoDB
   |                                `-- KB retrieve tool -> Bedrock KB + S3 Vectors
   |
DynamoDB Streams / event queue
   `-- KB projection worker -> S3 recipe Markdown -> Bedrock ingestion

S3 separate prefixes/buckets: images, backups, recipe KB projection, cookbook sources
```

### 6.1 Cloud data authority

- DynamoDB stores canonical synchronized recipe records, including revision and tombstone.
- S3 stores binary images, recoverable portable backups and generated documents, not primary editable recipe records. Backup/restore is available before cloud sync; it is not a mechanism for merging edits between devices.
- A durable DynamoDB change log is the client sync feed. DynamoDB Streams are only a trigger for derived KB work, not the client cursor or the only copy of a change.
- Scope every key and object to a stable user/library identifier, even if deployment is single-user.

### 6.2 API contract


| Method | Endpoint                                | Purpose                                                                 |
| ------ | --------------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/v1/sync/changes?cursor=...&limit=...` | Replay ordered changes; absent cursor starts at sequence zero           |
| GET    | `/v1/recipes?limit=...&pageToken=...`   | Paginated current recipe listing; not a sync cursor                     |
| GET    | `/v1/recipes/{id}`                      | Fetch canonical recipe                                                  |
| PUT    | `/v1/recipes/{id}`                      | Upsert with `baseRevision` and idempotency key                          |
| DELETE | `/v1/recipes/{id}`                      | Soft-delete with `baseRevision`, library epoch and idempotency key      |
| POST   | `/v1/assets/upload-url`                 | Reserve asset metadata and request scoped presigned PUT to staging      |
| POST   | `/v1/assets/{id}/complete`              | Verify staged bytes, publish immutable object and return ready manifest |
| GET    | `/v1/assets/{id}`                       | Fetch ready asset manifest                                              |
| GET    | `/v1/assets/{id}/download-url`          | Return ready manifest plus scoped, expiring presigned GET               |
| POST   | `/v1/chat`                              | Stream SSE answer events, then validated references and completion      |
| GET    | `/v1/identity`                          | Validate token and return the server-bound library identity             |
| POST   | `/v1/backups/upload-url`                | Reserve an immutable backup ID and scoped upload                        |
| POST   | `/v1/backups/{id}/complete`             | Verify and publish completed backup manifest                            |
| GET    | `/v1/backups`                           | List completed backups for the authenticated library                    |
| GET    | `/v1/backups/{id}/download-url`         | Authorize restore download                                              |


**Example write request:**

```json
{
  "libraryEpoch": "eac1efb9-184f-4dd7-b5c5-695537712bc4",
  "baseRevision": 4,
  "idempotencyKey": "e50e5bb7-9d4c-4a6d-b260-2bb2bd7d16d5",
  "recipe": {
    "id": "f3b6c6f0-63a2-4c12-9380-3a193a02cba9",
    "title": "Spaghetti alla Puttanesca Bianca",
    "category": "Pasta",
    "tags": ["Italian", "Quick"],
    "heroImageId": null,
    "content": "## Ingredients\n...",
    "createdAt": "2026-11-07T12:00:00Z",
    "updatedAt": "2026-11-07T12:05:00Z",
    "deletedAt": null
  }
}
```

On success, return the idempotency key, authoritative recipe/new revision, referenced ready asset manifest (if any), and committed change sequence. On revision mismatch return HTTP 409 `REVISION_CONFLICT` with the current server record and revision. Both upsert and delete use the same commit/idempotency protocol. A new recipe requires `baseRevision: 0` and an absent server item; deletion writes a tombstone with a new revision. Tombstones cannot be resurrected by ordinary upsert; retaining a recipe after a remote delete creates a new recipe ID.

Enforce payload validation, auth, object ownership and rate limits. Use shared limits from Phase 1, including a maximum 256 KiB UTF-8 serialized recipe, and validate each resulting DynamoDB item against its item-size limit. Use the personal-token authentication defined in section 6.5 before exposing any public API. Bundled shared keys and API Gateway usage-plan keys are **not** authentication.

### 6.3 Atomic commit and durable idempotency

Use one DynamoDB table with partition key `LIB#<authorized-library-id>` and these sort-key families:


| Sort key                        | Content                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| `META`                          | Stable library epoch and latest committed sequence                     |
| `RECIPE#<id>`                   | Canonical recipe, including tombstones                                 |
| `CHANGE#<zero-padded-sequence>` | Full recipe snapshot, operation ID and referenced ready asset manifest |
| `OP#<idempotency-key>`          | Canonical request hash and original successful response                |
| `ASSET#<id>`                    | Immutable asset metadata and publication state                         |


The Lambda derives the library from the authenticated identity; the client cannot select an arbitrary partition. Use one AWS Region for the Phase 4 write authority. Recipe revisions are per recipe; change sequences are monotonically increasing across the whole library. Encode sequences as decimal strings in JSON and fixed-width keys to preserve ordering without JavaScript integer precision loss.

For each write:

1. Check the durable operation receipt with a strongly consistent read. A matching request hash returns the original successful response, even if the recipe has since changed. A reused key with a different canonical request returns HTTP 409 `IDEMPOTENCY_KEY_REUSED`. The hash covers method, path, epoch, base revision and validated recipe payload; transport credentials are excluded.
2. Strongly read `META` and the recipe. Reject an incorrect library epoch or base revision. Compute recipe revision `r + 1` and library sequence `n + 1`.
3. In one `TransactWriteItems`, conditionally update `META` from `n` to `n + 1` in the same epoch; write the recipe conditioned on its base revision (or nonexistence for create); insert the immutable change event; and insert the receipt conditioned on its absence. If an image is referenced, also condition-check that the same-library asset is ready. Conditions belong to their write actions; do not add a separate condition check targeting an item already written in the transaction.
4. On transaction cancellation, first recheck the receipt for a concurrent duplicate. Retry counter contention with bounded backoff after rereading; return `REVISION_CONFLICT` only for an actual recipe revision mismatch. Do not turn transient contention into a user conflict.

No recipe mutation is visible without its change event and receipt, and failed transactions consume no sequence. Never allocate the sequence separately or append to the feed after returning success. Persist receipts in DynamoDB: the native transaction request token alone has only a [10-minute idempotency window](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html), which is insufficient for retries after an offline restart. The per-library counter intentionally serializes cloud commits; this is acceptable for a personal library.

### 6.4 Pull cursor, bootstrap and retention

The feed uses strongly consistent base-table `Query` reads on `CHANGE#` keys, not a GSI or stream. A server-validated opaque cursor binds the library, epoch, protocol version and last applied sequence. The client persists the cursor only after committing the returned changes locally. Base-table consistency and index restrictions follow [DynamoDB read-consistency semantics](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html).

At the start of each catch-up cycle, strongly read the committed high-water sequence `H`. Keep `H` in the opaque cursor across pages and query `lastSequence < sequence <= H`, ascending. Return `changes`, `nextCursor`, `libraryEpoch`, `highWaterSequence` and `hasMore`, including for an empty library. Each event contains its full recipe and hero asset manifest, so replay does not depend on another mutable recipe lookup. Only advance to the last returned sequence; an unexpected gap is a server error, not permission to skip it. At the end of a cycle, the next cycle obtains a new `H` for concurrent commits. A write response's change sequence is informational and must not advance the pull cursor past unread changes from other devices.

A clean install bootstraps by replaying this same feed from sequence zero. Fold events by recipe revision, including tombstones. There is no initial table scan and no scan-to-feed handoff. A restart resumes from the last transactionally committed page; duplicate delivery is harmless. Text can be materialized before image bytes are downloaded.

**Phase 4 retention:** Retain change events, operation receipts, tombstones and published assets indefinitely; configure no TTL on them. Cursors have no time-based expiry within the same protocol and epoch. This trades modest storage and initial replay time for a simple recovery guarantee. Measure history size; compaction requires a later versioned snapshot/checkpoint protocol before any history or tombstone is purged.

Malformed or wrong-library cursors return HTTP 400/403 without changing local state. An incompatible cursor version returns HTTP 409 `CURSOR_RESET_REQUIRED`: pause pushes, retain dirty recipes, frozen operations and conflicts, then rebuild the clean server materialization in staging by replaying from zero. Reconcile uncertain frozen operations using their original idempotency keys before new writes; preserve divergent local records as conflicts. Swap the rebuilt state and cursor atomically, retaining local edits made during replay. A changed library epoch (for example after a destructive restore) returns `LIBRARY_EPOCH_MISMATCH` and blocks automatic retry; preserve local data for explicit restore/rebind reconciliation. Do not silently attach old operations to a new epoch.

### 6.5 Personal-token authentication

The initial deployment is one personal library. Settings accepts a revocable Cantina access token; send it in `Authorization: Bearer ...` over HTTPS. This is an application credential, not an AWS access key or an API Gateway usage-plan key. A Lambda authorizer validates the token and derives its library identity and scopes; never accept the library identity from the client as authority. Issue separate tokens per device so a lost device can be revoked independently.

Store native tokens in the Apple Keychain through a narrow Rust command interface. Keep authenticated networking in Rust so persistent token material is not exposed to WebView storage. The browser preview remains local-only initially. Use a high-entropy random token, store only its cryptographic digest and library binding in a protected server-side token registry, and support explicit rotation/revocation. For the first personal deployment, manage this registry with Secrets Manager; a cloud recipe database is not required for chat. Bound authorizer caching to a documented revocation window. Keep AWS service credentials in IAM roles on the backend. Reconsider account login if Cantina becomes multi-user.

Settings adds token entry/replacement, connection check, status and disconnect. Never display or log the full saved token. Existing saved Markdown chatbot instructions remain editable with explicit Save/Cancel and are included with each chat request. They are preferences, not permission to bypass server authorization or source validation.

### 6.6 Backup and restore

Before sync, produce a consistent portable export containing versioned JSON metadata, recipe Markdown, saved chatbot instructions and referenced image files with checksums. Exclude credentials, device paths and transient sync state. Use a consistent local snapshot and ensure its referenced images remain available while exporting; do not upload a live SQLite file as a sync mechanism.

Upload to a library-scoped immutable backup ID, verify contents, then publish a completed manifest. Enable S3 versioning and keep historical backups separate from active recipe projections; never ingest backups into the knowledge base. Interrupted uploads must not appear as restorable backups. Show backup time and failures explicitly.

Restore validates schema, checksums and asset references before changing local data, provides a preview and requires confirmation. Retain a pre-restore recovery copy. Before sync, import through the native repository; after sync, restore as explicit version-checked changes through the normal outbox, preserving conflict handling. Never rewind a live sync cursor or silently overwrite another device's edits.

## 7. Sync algorithm

### 7.1 Local edits and immutable requests

1. Commit the local recipe, incremented generation, FTS and pending outbox entry together. Repeated edits update only the pending entry's generation/operation. A pending entry has no frozen request or base revision yet. Keep it durable even when cloud sync is disabled.
2. One sync worker per library claims a pending entry only if the recipe has no frozen operation or unresolved conflict. Under the Rust writer lock, snapshot the recipe, current base revision, local generation and library epoch into `request_json`; compute its canonical hash; change the entry to `in_flight`. Its ID becomes the idempotency key. Commit before any network request.
3. Once frozen, ID, generation, operation, request bytes, hash and base revision are immutable. New edits create/coalesce a separate pending entry. Only attempt count and error metadata change during retries; `in_flight` also means an uncertain request retained after restart or timeout.
4. Upload/complete any asset referenced by the frozen snapshot, then send that exact request. Permit only one frozen operation per recipe. Retry transport errors, throttling and server errors with exponential backoff/jitter and the original key/payload; never resnapshot an uncertain request. Validation/auth failures remain visible and retain local data.

Deleting a never-sent local creation with revision zero, no server snapshot and no frozen request cancels its pending create in the same local transaction; keep its local tombstone and mark that generation acknowledged. No remote delete is needed. If a create is already frozen/uncertain, resolve it first, then send the pending delete against its acknowledged server revision.

### 7.2 Acknowledgement without overwriting newer edits

Apply an acknowledgement in one Rust transaction, matched by operation ID and request hash. If that frozen row is already absent, the duplicate acknowledgement is a no-op. Advance the acknowledged generation and server snapshot/revision, and delete only that frozen row. If the current local generation equals the acknowledged generation, apply the authoritative recipe fields and FTS. If a newer generation exists, preserve every newer local field and its pending entry; the next request freezes against the newly acknowledged server revision. Never replace the whole local record with an older request's response. Never move a known server revision backwards.

Example: A at local generation 7 is sent against server revision 4; B creates generation 8 while A is in flight. A's success at revision 5 acknowledges only generation 7. B remains pending and later sends against revision 5. A crash before local acknowledgement replays A with the same key; the receipt returns its original result. A crash after local acknowledgement leaves B durable.

### 7.3 Pull application and conflicts

- Before branching, ignore any event no newer than the recipe's acknowledged/applied server revision, while still advancing the page cursor. This includes the client's own committed event arriving after its acknowledgement; it must not turn newer local edits into a spurious conflict.
- For every newer event, upsert its ready asset manifest before handling the recipe, including events retained as conflicts; preserve any already-verified local path/status for the same immutable asset.
- Clean recipe: apply only newer revisions; insert its asset manifest before the recipe foreign-key reference, update FTS and store the server snapshot. Clean pulled records begin with equal local/acknowledged generations and create no outbox work.
- Dirty recipe or frozen request: keep the local working copy and persist the newest observed remote recipe in `sync_conflicts` before advancing the cursor. Never discard a skipped remote event. Defer resolution until an uncertain frozen request succeeds or returns a definitive conflict. If the saved observation is no newer than the eventual acknowledged snapshot, remove it as already accounted for; otherwise retain it for resolution.
- On `REVISION_CONFLICT`, retain the frozen local request, current working copy, last server snapshot and returned remote record. Mark the frozen entry `conflict`, block automatic pushes for that recipe and present “Keep local” / “Use cloud.” Local editing remains available.
- Resolution includes the displayed local generation and remote revision. If either changed, refresh the comparison before accepting the choice. “Keep local” retires the rejected request, records the displayed remote version as the new server base and creates new pending work with a fresh operation ID; if the remote version is a tombstone, apply it to the old ID and create a new recipe ID containing the retained local content. “Use cloud” explicitly discards the displayed local work, applies the remote record and clears its pending/conflicted work, marking the current local generation acknowledged. Clear the resolved conflict observation in either case and perform the choice atomically. A subsequent concurrent cloud edit may cause another conflict; never force-overwrite it.

Apply each ordered pull page, persisted remote observations and next cursor in one SQLite transaction. Local writer serialization prevents acknowledgement/pull/edit transactions from interleaving halfway through a mutation. The worker continues to pull other recipes while one recipe has a conflict.

### 7.4 Asset upload and download lifecycle

Asset metadata is immutable for an ID. Replacing or transforming image bytes creates a new ID and checksum; never overwrite a published image in place. A ready manifest contains `id`, `mimeType`, `byteLength`, `checksumSha256` and server-generated `remoteObjectKey`. Asset APIs authorize ownership from the request identity, not a client-supplied S3 key.

**Upload:** `upload-url` reserves the declared metadata and returns an expiring URL for a unique staging key. Sign the expected checksum/content type and enforce the configured byte limit during completion. `/complete` verifies actual object length/checksum and supported image format, publishes a verified copy at a separate server-only immutable key, then marks the asset ready and returns its manifest. Verify and copy the same pinned staging object version, so an intervening PUT cannot substitute unverified bytes; use versioned staging objects. Completion is idempotent; a retry returns the same ready manifest. No client upload URL targets a published key, so replaying a staging PUT cannot change an already published image. A recipe commit requires a ready same-library asset; uploading alone is insufficient.

**Download:** Pull events/write responses carry the ready manifest; `GET /assets/{id}` can fetch it independently. Upsert a remote-only local row with `uploadStatus: 'ready'`, `localStatus: 'missing'` and null local path before linking the recipe. Render recipe text and an image placeholder immediately. When needed, request `download-url`, mark `downloading`, download to a temporary file, verify length/SHA-256 and decode, then atomically rename and commit the relative path plus `available` status. A URL expiry requests a new URL; network/decode/checksum failures retain metadata and set a retryable local error. Never mark a file available on a failed verification.

On restart, interrupted downloads return to `missing` unless a completed file verifies; uncertain uploads retry reservation/completion for the same immutable metadata. Missing cached files do not change cloud readiness and can be downloaded again. An offline local-only image remains available even while its upload is pending. Separate UI indicators report recipe sync and local image availability.

Clean up abandoned staging uploads after a seven-day grace period. Retain published assets in Phase 4 because history, tombstones and long-offline clients may reference them. Future garbage collection must account for those references; do not delete published objects merely because the current recipe changed its hero image.

## 8. AI / knowledge base design

### 8.1 Two retrieval paths

**Structured recipe search:** Lambda tools query recipe records and/or a dedicated search index for deterministic title/category/tag filters, full library listing and exact recipe ID lookup. DynamoDB alone is not a full-text search engine: do not assume arbitrary substring search over Markdown is efficient. For a small personal library, a bounded scan may be acceptable initially; use an appropriate search index if scale requires it.

**Semantic retrieval:** Bedrock Knowledge Bases uses S3 Vectors for its vector index, separate from ordinary S3 document/backup storage. Verify regional/model availability at provisioning. It retrieves relevant recipe/cookbook passages for conceptual questions, technique explanations, substitutions and similar dishes.

Chat orchestrator decides which tools to invoke. Use Bedrock [`Retrieve`](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_Retrieve.html) for KB passages and Converse for synthesis so Lambda controls the source registry and validation. It must not claim exhaustive results from top-k vector retrieval. It should cite sources and return exact recipe IDs for app navigation. Library tools read synchronized cloud data. Each request may additionally include the current local recipe snapshot, including pending edits, as explicitly labeled user-provided context. Treat it as untrusted content, not proof of a cloud record or ownership. Distinguish this snapshot from synchronized revisions. Before sync exists, chat uses the supplied recipe and conversation only; it must not claim to have searched the whole library.

### 8.2 Recipe projection

Generate one Markdown document per recipe, for example:

```markdown
# Spaghetti alla Puttanesca Bianca
Recipe ID: f3b6c6f0-63a2-4c12-9380-3a193a02cba9
Category: Pasta
Tags: Italian, Quick
Source: Personal recipe library

## Ingredients
...

## Method
...
```

Place at `s3://<kb-bucket>/recipes/<library-id>/<recipe-id>.md`. The projection worker also writes supported metadata containing library ID, recipe ID, recipe revision and source type. These values come from the committed server record, not recipe body text. Cookbook documents live under a distinct prefix/data source with a server-maintained source ID, source title, page/chapter where possible, and appropriate usage rights. Keep an authoritative document/source registry for mapping retrieval locations to their library and provenance.

Update projection only after cloud recipe commit. Coalesce rapid edits; process via durable queue and idempotent worker. Bedrock S3 data-source ingestion is asynchronous, so allow for indexing lag and show freshness state where useful. Evaluate direct document ingestion for faster individual updates, subject to supported data-source constraints. On deletion, remove/de-index the projection and preserve deletion consistency.

### 8.3 Chat behavior

- Prefer personal recipe matches when user asks “my recipes.”
- Clearly distinguish cookbook ideas from saved recipes.
- Do not invent saved recipes or IDs.
- Answer exact collection-wide queries via deterministic recipe API, not semantic retrieval alone.
- Return `recipeRefs: string[]` with response so UI can link to recipe detail.
- Require explicit user confirmation before any future AI-generated recipe write.
- Treat recipe/cookbook text as untrusted context, not instructions to the model.

### 8.4 Streaming and server-enforced references

Use an authenticated streaming POST to `/v1/chat`, consumed through the native networking bridge. Enable API Gateway REST API response streaming and Lambda streaming; use Bedrock ConverseStream. The request carries bounded conversation history, the latest saved instructions and optional current-recipe snapshot. Keep server rules separate from user instructions and recipe content.

The SSE contract has `start`, `delta`, `references`, `replace`, `done` and `error` events, with a request ID and ordered event sequence. Text deltas are provisional and may be displayed immediately, without actionable citations or model-generated navigation links. Buffer incomplete Markdown safely. `references` is emitted only after server validation. If validation requires regeneration, replace the provisional answer using `replace`; never append a correction as if it were continuation of the original answer. Emit `done` only for the final validated result. This deliberately replaces the earlier requirement that no unverified answer text be shown; the guarantee now applies to actionable references, not to provisional prose.

Support Stop, cancellation propagation, bounded time/token/tool limits and explicit interrupted/error states. After headers are sent, report errors as SSE events. Do not silently replay a failed generation or mark a disconnected partial answer complete. The app renders no actionable references for supplied local snapshots; cloud recipe cards require server-verified records. The current recipe remains accessible through the normal app navigation.

Model output and model-supplied tool parameters are untrusted. Prompts alone do not enforce the recipe-link guarantee. The Chat Lambda must:

1. Authorize every tool call and constrain all recipe/KB queries to the authenticated library and permitted cookbook sources. Scope retrieval before passing content to the model, and reject any result whose server-owned location/metadata cannot be matched to the authorized source registry. IDs or source labels appearing inside document text confer no authority.
2. Build a per-turn registry of opaque source handles from trusted tool results. Each entry records source type, canonical source/recipe ID, library and recipe revision or cookbook location. For personal KB hits, fetch the canonical recipe with a strongly consistent read, exclude missing/tombstoned records and replace stale recipe passages with current canonical content before synthesis. Assign a handle only to context actually supplied to the model.
3. Accumulate the streamed answer, then obtain a bounded structured candidate containing `answer` and selected `sourceHandles`. The model selects handles from that registry; it does not author public `recipeRefs`, provenance fields or navigation targets. Validate the candidate schema, every handle and the authenticated library. An ID copied from the user prompt or invented in prose is never sufficient.
4. Re-read referenced personal recipes before returning the response, checking existence, ownership, tombstone and revision. If a recipe changed since synthesis, retrieve its current content and regenerate; do not merely attach an updated revision to an answer generated from stale content. Validate cookbook source metadata against the registry as well. Build `recipeRefs` and `sources` server-side from the validated handles, deduplicated.
5. If any validation fails, allow one bounded regeneration using corrected trusted context. If validation still fails, return a deterministic verification-failure answer with empty references/sources. Clear provisional references and replace any provisional answer with that fallback; never expose unverified reference fields. Bound tool calls, total request time and `maxTokens` explicitly.

The UI builds recipe cards and citation navigation only from the validated response fields. Render generated prose as text/sanitized Markdown, with app navigation schemes and raw HTML disabled; never turn an arbitrary model-written ID or URL into a recipe card. A recipe deleted after validation is handled as “Recipe no longer available” when opened. Validated existence/provenance does not prove every factual statement in generated prose; recipe relevance and citation support still require evaluation.

### 8.5 Example validated chat response

```json
{
  "answer": "Try your lemon and caper pasta...",
  "recipeRefs": ["f3b6c6f0-63a2-4c12-9380-3a193a02cba9"],
  "sources": [
    {
      "handle": "source_1",
      "type": "personal_recipe",
      "id": "f3b6c6f0-63a2-4c12-9380-3a193a02cba9",
      "revision": 5,
      "title": "Spaghetti alla Puttanesca Bianca"
    }
  ]
}
```

## 9. Security, privacy and cost

- Use revocable personal tokens validated by a Lambda authorizer (section 6.5). Authorize every recipe, backup, image and chat request; no AWS secrets or Bedrock credentials in the app.
- Encrypt S3 and DynamoDB at rest; HTTPS in transit; least-privilege IAM per Lambda.
- Limit presigned URL lifetime, content type, file size and S3 key scope.
- Set Bedrock usage budgets, token limits, throttling and observability; avoid logging full private recipe/cookbook content by default.
- Check cookbook copyright/licensing before ingestion; private ownership does not automatically grant redistribution rights.
- Price the Bedrock KB vector backend independently: its baseline cost can dominate a small personal deployment. Consider delaying KB provisioning until AI phase and test a lower-cost direct retrieval strategy first.

## 10. Repository layout

Extend the existing `app/` scaffold in place. Preserve its theme, components and responsive shell while replacing placeholder behavior. Introduce the shared package and cloud directories when their phases need them; no frontend move is required.

```text
cantina/
  app/                        # existing React/Vite application
    src/
      components/             # existing shell and shadcn components
      features/library/
      features/recipes/
      features/chat/
      db/                     # typed command adapter; no frontend SQL writes
      services/
      types/
    src-tauri/
      tauri.conf.json         # shared shell and macOS packaging, implemented
      tauri.ios.conf.json     # iOS team configuration, implemented
      gen/apple/             # generated Xcode project and assets, implemented
      src/
        commands/             # typed IPC boundary
        repository/           # sqlx transactions, reads, FTS and sync state
        images/
      migrations/
    README.md                 # web, macOS and iOS build instructions
  packages/
    shared/                 # types, validation, API contracts
  backend/                  # TypeScript CDK project, scaffold implemented
    bin/backend.ts          # CDK entry point
    lib/                    # stacks and constructs
    test/                   # infrastructure tests
    src/                    # future API handlers and recipe projection worker
  Cantina_Technical_Design.md   # this specification
```

Use a shared schema validator (e.g. Zod) at client and API boundaries; validate again at the Rust IPC boundary using matching Rust types/constraints. Keep recipe repository and sync interfaces decoupled from React components so they are unit-testable. Keep frontend command types and Rust request/response types aligned through checked contract fixtures or generated bindings.

## 11. Implementation phases for Codex

### Current milestone — Interaction prototype and native shells

- Extend the existing web scaffold with eight dummy recipes and bundled photos.
- Default grouped list, continuous image grid, local search and recipe navigation.
- Create/edit metadata dialog; hero-image detail and real TipTap Markdown editing.
- Browser-local recipe/image persistence, explicit storage error status and desktop/mobile flow tests.
- Tauri 2 shell, native icons, macOS app/DMG and iOS device/simulator build configurations are implemented.
- macOS local app launch/signature validation and development-signed iOS IPA export are verified. Interactive iOS testing remains outstanding.
- Native SQLite, filesystem image storage, migration, generation-checked autosave, delete confirmation/tombstones and durable pending changes are implemented. Browser previews retain localStorage. AWS and AI remain deferred; the chat shell remains unconnected.

**Acceptance:** Browse both views, open a recipe, create metadata then write a recipe, edit metadata from the dropdown, import/remove an image, and reload without losing browser-saved changes. The recipe body feels like a clean document.

### Phase 1 — Durable native offline MVP

**Implemented:** Native storage, migration, image files, autosave/error/retry flows, guarded macOS close, deletion and repository tests. The UI searches its loaded local records; a transactional SQLite FTS index is maintained for the future database search adapter. Dedicated category/tag filter controls, interactive iOS lifecycle verification and portable backup/export remain follow-up work.

- Extend the existing `app/` frontend and Tauri 2 shell under `app/src-tauri/`.
- SQLite migrations and typed RecipeRepository backed by Rust commands and `sqlx` transactions (section 5.1).
- Local generations, pending outbox metadata and shared payload limits; no cloud transport yet.
- Local image import and relative-path storage.
- Home grid/list, category/tag filters, full-text search.
- Recipe detail with hero image and inline TipTap Markdown editing.
- Autosave, create, delete, empty/error states.
- Unit tests, repeatable macOS/iOS packaging and interactive device/lifecycle smoke tests.

**Acceptance:** Disconnect network; create, edit, search, reopen, and delete recipes with images. Data survives app restart. Markdown survives TipTap round trips. Inject a failure after the recipe write but before FTS/outbox updates: all changes roll back. Rapid edits and navigation do not allow a stale autosave to overwrite newer committed content. Preserve the existing scaffold's theme, header and responsive shell.

### Phase 2 — Authenticated streaming chat

**Deployed and client integration implemented:** regional REST API, no-cache token authorizer, retained digest registry, identity endpoint, Bedrock ConverseStream Lambda, scoped model permissions, request/output/time/concurrency limits, SSE framing and local tests. Native Keychain/network integration is implemented. The backend is deployed to account 164656357320 in us-west-1, using Nova Micro through the us-west-2 US inference profile. An iPad credential is registered; live API identity and streaming passed. Physical-device persistence, interruption and UI validation remain.

- CDK: API Gateway REST API, authorizer, protected token registry, streaming Lambda, Bedrock IAM and bounded usage.
- Native Keychain storage and authenticated streaming networking bridge; Settings connection controls.
- Stream responses using saved Markdown instructions, conversation history and optional current recipe snapshot.
- Stop/retry/error handling and provisional-text/final-reference separation. No library-wide retrieval or cloud recipe database yet.

**Acceptance:** Valid token connects; invalid/revoked token fails without losing local content. Saved instructions affect the next request; unsaved drafts do not. Latest supplied recipe edits are available to chat. Streaming works on macOS and iPad, cancellation stops client consumption and propagates upstream, interrupted output remains incomplete, and no unverified recipe links are created.

### Phase 3 — Portable S3 backup and restore

- Consistent portable JSON/Markdown/image export and validated import.
- Library-scoped immutable backup uploads, completion manifests, S3 versioning and backup listing.
- Explicit restore preview/confirmation, pre-restore recovery copy and visible failure status.

**Acceptance:** Restore a completed backup into a clean installation with matching recipes/images/instructions. Exclude credentials. Reject corrupt, incomplete or foreign-library backups without partial replacement. Backups do not merge concurrent device changes.

### Phase 4 — Cloud sync

- Extend the existing API/auth infrastructure with DynamoDB records/change log, recipe/asset handlers, S3 image storage and scoped IAM.
- Immutable in-flight outbox requests, generation-aware acknowledgements and durable conflicts.
- Atomic recipe/change/receipt commits, library-wide sequences and feed replay bootstrap.
- Indefinite Phase 4 history/tombstone/receipt/published-asset retention and safe cursor reset.
- Staged image upload/completion, ready manifests, verified downloads, independent local availability and retries.
- Sync status and error UI.

**Acceptance:** Create/edit on Mac, sync to a second clean install; verify images and edits appear. Edit B while A is uploading: A's acknowledgement preserves B and B eventually syncs. Kill/restart after a server commit but before local acknowledgement: retry returns the same result and creates no duplicate revision/change. Bootstrap during concurrent writes misses no changes. Offline divergent edits never overwrite silently. Missing image bytes do not block text access; interrupted transfers retry safely and corrupted downloads never become available.

### Phase 5 — Library-aware AI and knowledge base

- Bedrock chat endpoint and scoped tool-calling orchestration.
- Deterministic recipe lookup tool.
- Recipe projection worker and Bedrock KB integration.
- Chat UI with recipe links and provenance.
- Per-turn trusted source registry, server-derived references, current-record checks and bounded validation fallback.
- KB freshness/reindex observability.

**Acceptance:** Chat finds a known recipe by title/ID; answers conceptual queries with source references; distinguishes cookbook results. Fabricated IDs/handles, cross-library hits and stale/deleted personal results never become actionable references. A failed validation produces a bounded retry or deterministic fallback. Offline recipe editing still works.

### Phase 6 — Cookbook ingestion and polish

- Cookbook import pipeline with source metadata and document chunking.
- Evaluation set for recipe matching, substitutions and citations.
- iOS release signing/distribution, filesystem permissions, expanded lifecycle tests and sync hardening.
- Image caching, background behavior, accessibility, backups and export.

## 12. Tests and quality gates

- SQLite migration and CRUD integration tests.
- Run the migration and transaction tests against the same Rust repository used by the app, including rollback after an intermediate write and per-connection foreign-key enforcement.
- Concurrent autosave/stale-generation rejection; acknowledgement, pull and edits serialized without partial updates.
- Markdown parse/serialize round-trip tests.
- Local search indexing updates after edit/delete.
- Image import crash recovery, remote-only manifest/FK insertion, missing cache restore, URL expiry, checksum/decode rejection and interrupted upload/download recovery.
- Staging URL replay cannot mutate a published asset; recipe commits reject unready or foreign-library assets.
- Edit B during in-flight A, acknowledgement replay, restart before/after acknowledgement, and immutable request key/hash checks.
- Server idempotency beyond ten minutes and after later recipe revisions, duplicate concurrent requests and different-payload key reuse.
- Cloud fault injection cannot commit a recipe without its feed event/receipt; counter contention produces no skipped sequences or false recipe conflicts.
- Bootstrap concurrent with creates/edits/deletes, multi-page fixed high-water replay, duplicate-page delivery and pull/cursor transaction rollback.
- Tombstone propagation to a long-offline device; cursor reset preserves dirty work and uncertain requests; epoch mismatch blocks automatic writes.
- Dirty remote observations survive cursor advancement/restart; conflicts and further edits are preserved until generation-checked manual resolution.
- Auth and cross-library access denial tests.
- Bedrock tool contract tests with mocked model responses; invented handles/IDs, text-forged source metadata, unauthorized KB hits, stale/deleted recipes, cookbook/personal provenance swaps and invalid-output fallback.
- UI navigation uses validated reference fields only; model-written app links/raw HTML cannot create navigation actions.
- Streaming event ordering, cancellation, interrupted output, provisional-answer replacement and delayed validated references.
- Token rotation/revocation and Keychain persistence; secrets excluded from logs, exports and WebView storage.
- Consistent backup snapshots, incomplete upload rejection, checksum/schema failures and recovery after failed restore.
- End-to-end desktop test of offline workflow.

## 13. Implementation decisions

1. **Targets:** macOS and iOS/iPadOS shells share the existing frontend; validate native storage on both before adding sync.
2. **Authentication:** revocable per-device Cantina bearer tokens bound to one personal library; native Keychain storage and Lambda authorizer. Cognito is not part of the initial rollout.
3. **Category:** free-form string initially; normalized categories only if needed.
4. **Editor:** Markdown as persisted format; limit TipTap extensions to supported round-trip features.
5. **AI rollout:** streaming current-recipe chat first, S3 backup/restore second, DynamoDB sync third, then library retrieval with Bedrock Knowledge Bases and S3 Vectors.
6. **Conflicts:** explicit manual resolution rather than silent last-write-wins.
7. **Backups:** portable JSON/Markdown + image export and versioned S3 backup/restore before sync. Sync is not a substitute for historical recovery copies.
8. **Application root:** extend `app/` in place and add `app/src-tauri/`; preserve the current UI scaffold.
9. **Local transaction owner:** Rust `sqlx` repository behind typed Tauri commands; include generation/outbox metadata in Phase 1.
10. **Sync correctness:** freeze requests before sending, acknowledge by operation/generation, and commit cloud record/feed/receipt atomically. Bootstrap through the feed; retain history, receipts, tombstones and published images indefinitely in Phase 4.
11. **Image state:** immutable ready cloud manifests and verified local availability are separate concerns.
12. **AI reference guarantee:** Lambda validates trusted source handles/current records and constructs navigation/provenance fields; model prose alone cannot create links.

## 14. Next implementation work

- Finish Phase 2 device validation: rebuild/install the native app, enter its registered key, and verify Keychain persistence, cancellation, revocation, and chat keyboard behavior on physical devices. Backend deployment, client integration and live API streaming are complete.
- Validate the native create/edit/image/delete and suspension/restart flows interactively on iOS. Repository tests and Apple builds do not replace device testing.
- Add portable backup/export and explicit import between a browser preview and a separate native installation.
- Connect the existing SQLite FTS index to a repository search adapter and add dedicated category/tag filters if needed.
- Build Phase 4 on the existing native generations/outbox/schema, following sections 6–7. Keep the existing UI and Rust transaction owner. Add authenticated library binding, immutable in-flight requests, durable receipts, ordered pull pages, asset publication/download, and explicit conflicts. Cloud transport is a separate implementation from the completed local storage layer.

---

**Implementation priority:** Preserve the working offline editor. Deliver streaming chat, then backup/restore, then cloud sync, then knowledge-base retrieval. Treat AI indexing as a derived, asynchronous capability. dalskd jkaj alskdj laksdj laksdj laksjd laksd jalksdjals dsadsasod

das

asd

asd

asd

