# Document Ingestion and Folder Sync

Status: The core TypeScript folder-sync workflow is implemented. Remaining work is manual validation and bug fixing.

## Current Behavior

The Documents window supports:

- sequential multi-PDF upload through the existing ingestion pipeline;
- a server-backed folder picker rooted at the user's home directory;
- recursive folder synchronization;
- documents grouped by their source folder;
- live per-file status during the initial sync;
- manual folder sync;
- unwatching a folder while keeping its documents;
- removing a folder and its synced documents; and
- removing individual documents.

Registered folders and tracked PDFs are persisted in SQLite. Watchers are restored when the server starts without automatically re-ingesting files.

## Design

There is one ingestion path:

```text
PDF -> TextExtract -> chunkPages -> assembleChunks -> storeDocumentChunks
```

Uploads and folder sync both call `ingestDocument()`.

Watcher events request a complete folder rescan. SQLite and the current filesystem contents determine what changed; individual watcher events are not authoritative.

Only one sync runs for a folder at a time. Events received during a sync request one additional scan after it finishes.

## Registry

`synced_folders` stores the normalized folder path and latest sync error.

`synced_files` stores the source path, managed copy, document ID, modification time, size, and an ignored flag. The ignored flag prevents a manually removed document from immediately returning during the next scan.

Managed copies are stored under `documents/synced/`. Their filenames are based on a hash of the normalized source path, keeping document identity stable across edits.

## Sync Rules

For each registered folder, `syncFolder()`:

1. Recursively finds PDFs.
2. Skips ignored or unchanged files.
3. Copies new or changed files to the managed directory.
4. Calls `ingestDocument()` sequentially.
5. Rolls back the managed copy if replacement ingestion fails.
6. Removes stored documents whose source PDFs disappeared.
7. Returns added, updated, removed, unchanged, and failed counts.

Ignored tombstones remain internal and are not shown as an ingestion status.

## Routes

- `POST /documents` uploads one or more PDFs.
- `GET /documents` returns documents and their source-folder IDs.
- `GET /documents/directories` browses folders inside the user's home directory.
- `GET` and `POST /documents/folders` list and register folders.
- `POST /documents/folders/[id]` manually syncs a folder.
- `DELETE /documents/folders/[id]` unregisters a folder, optionally removing its documents.
- `DELETE /documents/[id]` removes an individual document.

Initial folder registration uses an NDJSON response so the UI can display file-level progress without a separate job system. Selecting an already registered path starts a new sync.

Folder and document deletion wait for an active sync before changing registry state.

## Validation Checklist

- Initial ingestion of a local folder.
- Nested PDF discovery.
- Changed-file re-ingestion.
- Source-file deletion.
- Manual document removal and ignored behavior.
- Restart without automatic re-ingestion.
- Unwatch with and without document removal.
- Multiple PDF upload.

## Non-Goals

- A second ingestion pipeline.
- A durable background-job system.
- A separate ignored-files table.
- Content hashing every watched PDF.
- Restoring the legacy Chroma, tag, or bulk-action systems.

## Legacy Reference

Useful commits on `svelte-rewrite`:

| Commit | Historical behavior |
| --- | --- |
| `92cbb936` | Server-backed file picker. |
| `7e9fa04c` | Recursive folder sync and watcher. |
| `aca28350` | Changed-file and ignored-file handling. |
| `c202a6d4` / `949b97a7` | SQLite folder/file registry. |
| `d1fb4415` | Full Svelte Documents window and folder controls. |
| `11aeee58` | Smaller TypeScript upload/list window. |

The legacy implementation is reference material, not a requirement to restore every old subsystem.
