# Parse/RAG Cleanup Plan

Working tracker for the review cleanup. Keep `docs/` untouched for now.

## Review Goal

Make the parse-to-embed pipeline simple enough to read and review:

- remove duplicated logic
- remove debug/prototype code from the pass-off version
- avoid parsing metadata back out of text strings
- keep the pipeline linear
- preserve coverage-first chunking behavior

## Current Target Flow

```text
extract text/pages/tables
  -> chunk page text
  -> assemble text chunks + table chunks
  -> embed chunks
  -> store database rows
```

## Agreed Cleanup Batches

### 1. Shared Parse Types And Helpers

- [x] Create one shared parse file, likely `src/lib/server/rag/parse/parse-shared.ts`.
- [x] Move `Source`, `ChunkType`, extracted page/table types, parsed chunk type, `normalizeWhitespace`, `countWords`, and `buildChunkId` there.
- [x] Remove duplicate `wordCount` and `buildChunkId` from chunker/postprocess files.
- [x] Avoid a one-function helper file like `text-normalize.ts`.
- [x] Where practical, derive stored chunk fields from database schema types instead of redefining DB-shaped data.

### 2. Repeated-Line Cleanup Has One Owner

- [x] Keep repeated header/footer removal in `text-extract.ts`.
- [x] Remove `removeRepeatedLines` from `ChunkerOptions`.
- [x] Remove `repeatedLineThreshold` from `ChunkerOptions`.
- [x] Delete repeated-line cleanup from `chunker-semantic.ts`.
- [x] Make `chunkPages()` assume extraction already cleaned repeated page-level lines.
- [x] Validate with `npm run check` and `npm run build`.

### 3. Structured Tables, No Text Marker Parsing

- [x] Stop identifying tables with `text.startsWith("[Table:")`.
- [x] Stop extracting tables with regex over chunk text.
- [x] Have extraction return structured table data on each page.
- [x] Create table chunks from table objects, not from string markers.
- [x] Set `chunkType: "TABLE"` from the table object.
- [x] Remove `isTableChunk()`.
- [x] Remove `tableMarker()` from the storage/chunking path.
- [x] Do not serialize tables into a fake `[Table: ...]` format just so later code can re-parse it.
- [x] Keep any table display formatting as a UI/display concern, not as the stored data contract.
- [x] Re-check what `scribe.extractTextFromTables(...)` returns before choosing the table object shape. If it already returns useful rows/text, preserve that directly.

### 4. Simplify Assembly

- [x] Inline the simple min-word check instead of using `keepChunk()`.
- [x] Consider removing the all-caps filter unless there is a concrete current failure it solves.
- [x] If postprocess only assembles text/table chunks and reindexes, rename it to something like `assembleChunks`.
- [x] Keep final cleanup to direct `.trim()` where possible.
- [x] Decision: remove `isAllCaps()`. Header/footer removal belongs to extraction-level repeated-line cleanup, not broad all-caps dropping.
- [x] Remove the all-caps filter from postprocess.

### 5. Simplify Chunker Helper Sprawl

These helpers currently make `chunker-semantic.ts` feel over-engineered:

- `splitWords`
- `looksLikeLabelLine`
- `stripTrailingShortNumber`
- `startsWithBullet`
- `startsWithNumberedStep`
- `startsStructuralBlock`
- `isShortNumericText`
- `endsWithRepeatedInitials`
- `shouldKeepChunk`
- `shouldSplitAtPeriod`

Proposed direction:

- [x] Remove `splitWords`; use direct `text.trim().split(...)` where needed.
- [x] Remove `looksLikeLabelLine`.
- [x] Remove `stripTrailingShortNumber`.
- [x] Remove bullet and numbered-step special handling unless a validation run proves it is necessary.
- [x] Decision: remove `isShortNumericText`. Do not bother dropping page numbers for now unless validation proves they are a real problem.
- [x] Remove page-number/small-number drop logic from the chunker.
- [x] Remove `endsWithRepeatedInitials` unless sentence splitting is demonstrably broken without it.
- [x] Decision: aggressively reduce the chunker helper pile. Special-structure preservation is making the code hard to review and defend.
- [x] Remove `shouldKeepChunk`; inline `countWords(content) >= minWords`.
- [x] Keep sentence splitting as simple as possible. If abbreviation handling is needed, prefer one small regex/list-based rule over a pile of helper functions.
- [x] Avoid tiny one-line helper functions.
- [x] Remove comments that reference legacy Python/PageRank/testing unless they explain a current design decision.
- [x] Prefer a short centralized list of cleanup regex rules over scattered custom helper functions.
- [x] Keep regex only where it is the clearest way to handle OCR/PDF noise.
- [x] Do not add document-specific cleanup rules.

Current reviewer-aligned simplification target:

```text
clean text lightly
  -> split into sentence-ish spans
  -> group spans up to max size
  -> embed/group with minimal semantic break logic
```

Avoid preserving old Python/PageRank assumptions unless they are still necessary.

### 6. Storage Mapping

- [x] Rename in-memory chunk type away from DB-row language if needed, likely `ParsedChunk`.
- [x] Let `storeDocumentChunks()` map parsed chunks to `NewDocumentChunk`.
- [x] Remove the `ChunkMetadata` wrapper if flat fields are clearer.
- [x] Avoid `chunkId` vs database `id` confusion.

### 7. Ingest Result Surface

- [x] Decide whether live UI still needs ingest timings.
- [x] Consider removing `rawChunkCount`, per-stage timings, and `embeddingModel` from the normal ingest result.
- [x] Keep only user-facing response fields unless debug output is explicitly needed.

### 8. Extraction Simplification Questions

- [x] Re-evaluate `isRectWithinMargins(...)`. It was ported from the Python path and may not translate cleanly to the current `scribe.js-ocr` output.
- [x] Confirm whether margin filtering is actually needed with the current library output.
- [x] Re-evaluate `paragraphText(...)` / paragraph grouping. It may be a best-guess heuristic; remove or simplify if line order from the library is already usable.
- [x] Keep extraction focused on getting page text and structured tables, not reproducing the old Python extraction behavior.

### 9. Search Query Cleanup

- [x] Replace raw SQL in `bm25-search.ts` with Drizzle query builder usage.
- [x] Replace raw SQL in `semantic-search.ts` with Drizzle query builder usage.
- [x] Replace raw SQL in `routes/(app)/documents/list/+server.ts` with Drizzle query builder usage.
- [x] Remove confusing aliases like `type CandidateRow = Bm25SearchMatch` if they do not add meaning.
- [x] Revisit `uniqueClean(...)`; inline it or move to a shared search helper only if multiple search files truly need it.
- [x] Remove search timing/debug result fields from the live retrieval path.
- [x] Remove `matches` from `RagContextResult` unless a live caller actually uses it.
- [x] Keep `retrieveRagContext()` focused on returning the prompt context and user-facing sources.
- [x] Keep raw `databaseClient.execute(...)` limited to the database setup/client layer unless there is a concrete Drizzle limitation.

### 10. Small Consistency Cleanup

- [x] Remove unnecessary `.ts` suffixes from local imports where the rest of the app uses extensionless imports.
- [x] Keep this as a mechanical cleanup only; do not refactor provider or component behavior in this pass.

### Deferred Audit Items

These are intentionally not part of this pass-off cleanup:

- Retrieval mode UI/plumbing in chat. Likely simplify later by picking one live retrieval path.
- `DocumentFilePickerPopup.svelte`. It appears unused/half-disabled.
- `auth/utils.ts` commented/dead auth code.
- README/docs references. User reverted README and docs should stay untouched for now.

## Already Done

- [x] Moved parse files under `src/lib/server/rag/parse/`.
- [x] Moved live search files under `src/lib/server/rag/search/`.
- [x] Removed `/rag/debug` route from this pass-off version.
- [x] Removed `semantic-search-harness.ts`.
- [x] Removed old Voy `vectorSearch.ts` prototype.
- [x] Removed old startup/global `bm25.ts`.
- [x] Removed `voy-search` and `@xenova/transformers` dependencies.
- [x] Removed duplicate `normalizeWhitespace()` from the old postprocess step; use `.trim()` there.

## Validation Rule

After each implementation batch:

```bash
npm run check
npm run build
```

If chunking behavior changes materially, run a focused ingest/chunk validation before continuing.
