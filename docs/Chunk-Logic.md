# Chunk Logic

Markdown file to document the Deployable-Knowledge Chunking & Embedding Pipeline

## High Level Flow

```text
PDF
  -> TextExtract()
  -> page-level TEXT records
  -> chunkPages()
  -> semantic_raw
  -> postprocessChunks()
  -> semantic_ts
  -> storeDocumentChunks()
  -> embeddings + SQLite rows
```

## Stage 1: PDF Extraction

File:
- [text-extract.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/text-extract.ts)


`TextExtract()` opens the PDF with `scribe.js-ocr`, walks page by page, and returns page-level extracted text records.

Each returned record currently looks like:

- `chunkType`
- `source`
- `pageIndex`
- `content`

Note: Even though `ChunkType` includes `"TEXT" | "IMAGE" | "TABLE"`, the current `TextExtract()` path returns page records as `chunkType: "TEXT"` only.
- table content is not emitted as a separate `"TABLE"` page record
- table content is injected into page text as inline markers like `[Table: ...]`
- later stages treat those table markers specially

### Extraction logic

For each page:

1. OCR lines are read from `doc.ocr.active`.
2. Table boxes are read from `doc.layoutDataTables`.
3. `buildTableItems()` extracts table rows and serializes them to CSV-like text.
4. Each table is turned into one inline marker:
   - `[Table: ...csv text...]`
5. `buildTextItems()`:
   - sorts OCR lines top-to-bottom, left-to-right
   - filters by page margins
   - removes OCR lines overlapping table boxes
   - groups nearby lines by paragraph id
6. Text items and table items are merged back into reading order.
7. Their text is joined with newlines into one page `content` string.

### Why 

- page margins reduce obvious header/footer noise
- table overlap removal avoids duplicate table text
- paragraph grouping gives more coherent page text than raw word/line order
- inline table markers preserve table content without mixing it directly into prose

### Repeated line removal

After all pages are built, `removeFrequentLines()` runs across the extracted pages.

It:

- counts unique normalized lines per page
- removes lines repeated across more than `threshold` of pages

Default threshold here is `0.9`.

Why:

- reduce running headers/footers repeated throughout the PDF

Important:

- this happens in extraction
- a similar repeated-line cleanup also exists later inside `chunker-semantic.ts`

## Stage 2: Semantic Chunking

File:
- [chunker-semantic.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/chunker-semantic.ts)

### What goes in

`chunkPages(pages, options)` takes the page-level extracted records from `TextExtract()`.

### What comes out

It returns `ChunkRecord[]`, which is the pre-postprocessing chunk set.

Important naming:

- this output is what the test harness writes to `chunker-semantic-raw.json`
- this is the **pre-postprocessing** chunk set
- this is usually referred to as `semantic_raw`

### Default chunker settings

Current defaults:

- `maxChars: 1200`
- `minWords: 5`
- `overlapSentences: 1`
- `removeRepeatedLines: true`
- `repeatedLineThreshold: 0.9`

### Cleanup before splitting

Each page goes through `prepareTextContent()`:

1. `cleanPageText()`
2. `stripInlineTables()`

#### `cleanPageText()` does:

- normalize spaces and line endings
- drop very short numeric-only lines
- normalize bullets like `• • text` to `* text`
- detect short label/caption-like lines
- remove short trailing page numbers from those labels

Why:

- page numbers and repetitive OCR noise hurt retrieval quality
- bullet normalization makes list content more consistent
- generic label handling tries to remove page-number suffixes without hardcoding document-specific rules

#### `stripInlineTables()` does:

- removes `[Table: ...]` markers from the text sent into semantic chunking

Why:

- the semantic text chunker should not mix table marker blobs into prose chunks
- tables are reintroduced later as standalone retrieval chunks

### Sentence-like span splitting

`splitSentencesWithOffsets()` converts cleaned page text into sentence-like spans while keeping character offsets.

This is not a pure sentence tokenizer. It is a pragmatic splitter for OCR text.

It protects against bad splits for:

- decimals like `1.5`
- known abbreviations like `dr.`, `capt.`, `lt.`
- repeated initials like `A.B.`

It also treats some lines as structural starts:

- bullet lines
- numbered steps
- label/caption-like lines

Why:

- OCR text is noisy
- structural lines often should start their own semantic unit
- offsets are needed for later metadata like `startChar` and `endChar`

### Semantic grouping logic

This is the core chunk-building step.

The chunker:

1. embeds all sentence spans with `embedTexts()`
2. walks spans in source order
3. keeps growing the current chunk until one of the stop conditions hits

Stop conditions:

- adding another span would exceed `maxChars`
- a structural shift occurs after the chunk is already fairly large
- the chunk is already very long and local semantic similarity drops

Current thresholds:

- `STRUCTURAL_BREAK_THRESHOLD = 0.35`
- `LONG_CHUNK_BREAK_THRESHOLD = 0.25`
- `MIN_BREAK_RATIO = 0.55`
- `LONG_BREAK_RATIO = 0.8`

Why:

- preserve full text coverage
- use semantics only to place better breaks
- avoid the old PageRank-style “representative sentence” logic that could drop real content

### Overlap behavior

After a chunk is emitted, the cursor moves to:

- `end - overlapSentences`

with a floor of advancing by at least one span.

Current default:

- `overlapSentences = 1`

Why:

- preserve some boundary context between neighboring chunks

### Minimum-word behavior

`shouldKeepChunk()` drops tiny chunks unless they start with a recognized structural block.

Why:

- keep list items / labels when they are structurally meaningful
- drop trivial noise chunks that are too small to be useful

### Chunk IDs and metadata

Each semantic chunk gets:

- deterministic `chunkId`
- `pageIndex`
- `chunkIndex`
- `content`
- `metadata.startChar`
- `metadata.endChar`
- `metadata.wordCount`
- `metadata.sentenceCount`

The `chunkId` is built from:

- source path
- page index
- chunk index
- chunk type
- content

Why:

- stable IDs make reprocessing and DB replacement simpler

## Stage 3: Postprocessing

File:
- [chunk-postprocess.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/chunk-postprocess.ts)

### What goes in

- original extracted pages
- semantic chunk list from `chunkPages()`

### What comes out

- final chunk list used for embedding/storage

Important naming:

- this output is what the test harness writes to `chunker-semantic.json`
- this is the **post-postprocessing** chunk set
- this is usually referred to as `semantic_ts`

### What postprocessing actually does

Postprocessing does **not** merge semantic text chunks together.

It does four things:

1. add standalone table chunks
2. dedupe exact duplicates per page
3. filter some chunks out
4. reindex and rebuild chunk IDs

### 1. Add standalone table chunks

`extractTableChunks()` scans the original page `content` for `[Table: ...]` markers and creates separate chunks for them.

Why:

- semantic text chunks had table markers stripped out
- this puts tables back into the final retrieval set
- tables become retrievable without polluting prose chunk boundaries

Important current behavior:

- the extracted table chunks inherit `page.chunkType`
- since `TextExtract()` currently emits pages as `"TEXT"`, these table chunks are also currently stored as `"TEXT"`
- so “table chunk” is currently identified by content beginning with `[Table:`, not by `chunkType: "TABLE"`

### 2. Dedupe exact duplicate chunk text per page

The postprocess step removes exact duplicate chunk contents on the same page.

Why:

- table extraction plus semantic chunking can otherwise create duplicate retrieval content

### 3. Filter chunks

Current final filter rules:

- always keep table chunks
- drop all-caps chunks if `filterChunks` is enabled
- drop chunks below `minWords`

Current defaults:

- `filterChunks: true`
- `minWords: 5`

Why:

- remove obvious visual noise
- keep very small chunks from bloating retrieval unless they are table chunks

Important current behavior:

- the old repeated-substring/ellipsis filter was removed because it dropped real content like page 127 in the notebook test
- the all-caps filter still removes some figure-label pages

### 4. Reindex and rebuild IDs

After dedupe/filtering, the page chunk list is reindexed and each surviving chunk gets a new deterministic ID.

Why:

- final chunk ordering should stay deterministic
- final IDs should reflect the final stored chunk set

### What changes between `semantic_raw` and `semantic_ts`

Typical changes are:

- all-caps label/caption chunks may be dropped
- standalone table chunks may be added
- duplicate chunk texts may be removed
- page-local chunk indexes and IDs may change

What does **not** happen:

- semantic text chunks are not merged into larger text chunks here

## Stage 4: Embedding Model

File:
- [embedding-model.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/rag/embedding-model.ts)

### What it does

`embedTexts(texts)` creates normalized embedding vectors for text batches.

It is used in two places:

- during semantic chunking, to compare nearby sentence spans
- during final storage, to embed the final chunks

### Why that matters

Using the same embedding helper in both places keeps:

- model choice consistent
- cache behavior consistent
- vector generation path consistent

### Current configuration

Key env vars:

- `SEMANTIC_EMBED_MODEL`
- `SEMANTIC_EMBED_DTYPE`
- `SEMANTIC_EMBED_BATCH_SIZE`
- `SEMANTIC_EMBED_ALLOW_REMOTE`

Current default model:

- `Xenova/all-MiniLM-L6-v2`

Current model cache dir:

- `tmp_model/transformersjs`

Important:

- if `SEMANTIC_EMBED_ALLOW_REMOTE` is not `1`, the model must already exist locally in cache

## Stage 5: Store Final Chunks in SQLite

File:
- [embedding.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/rag/embedding.ts)

### What goes in

- final chunk list only

This should be the postprocessed `semantic_ts`-style chunk set, not `semantic_raw`.

### What it does

`storeDocumentChunks(chunks)`:

1. builds one `documents` row
2. embeds each final chunk content
3. builds `document_chunks` rows
4. upserts the document row
5. deletes existing chunk rows for that document
6. inserts the new chunk rows in batches

### Why it deletes old chunks first

This is a replace-on-reprocess model.

If the same source PDF is processed again:

- the document row is updated
- all old chunk rows for that document are removed
- the new final chunk rows are inserted

Why:

- keeps storage in sync with the current chunk logic
- avoids stale old chunks from earlier logic versions

### Embedding storage format

Embeddings are stored as:

- Float32 values packed into a BLOB buffer

Why:

- compact vector storage
- ready for later cosine similarity search or vector retrieval logic

## SQLite Schema

File:
- [schema.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/database/schema.ts)

### `documents`

Stores one row per source document:

- `id`
- `title`
- `sourcePath`
- `sourceType`
- `createdAt`
- `updatedAt`

Current `documents.id` is a sha256 of the source path.

### `document_chunks`

Stores one row per final chunk:

- `id`
- `documentId`
- `chunkType`
- `pageIndex`
- `chunkIndex`
- `content`
- `startChar`
- `endChar`
- `wordCount`
- `sentenceCount`
- `metadata`
- `embedding`
- `embeddingModel`
- `createdAt`

Important:

- `chunkIndex` is page-local in the current logic, not global across the whole document
- the chunk ID is what is truly unique

## Test Harness and Output Files

File:
- [chunker-semantic-test.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts)

### Output meaning

- `chunker-semantic-raw.json`
  - output of `chunkPages()`
  - pre-postprocessing
  - usually called `semantic_raw`

- `chunker-semantic.json`
  - output of `postprocessChunks(...)`
  - final chunk set intended for RAG storage
  - usually called `semantic_ts`

This is the most important distinction when reading the notebook.

## Notebook Interpretation

File:
- Historical notebook comparisons were removed from the repo artifact tree; regenerate analysis outputs outside the repo when needed.

### Current datasets in the notebook

- `cleaned_source`
  - cleaned extracted page text baseline
- `semantic_raw`
  - pre-postprocessing chunk output
- `semantic_ts`
  - final postprocessed chunk output
- `python_legacy`
  - legacy reference only

### What the coverage table means

The source coverage table is set-based, not count-of-occurrences based.

- `source_unique_count`
  - number of unique normalized items in `cleaned_source`
- `chunk_unique_count`
  - number of unique normalized items found in the chunk output
- `missing_unique_from_chunks`
  - source items absent from the chunk output
- `extra_unique_in_chunks`
  - chunk items not present in `cleaned_source`
- `source_recall_pct`
  - percent of source items recovered by the chunk output

### Important notebook caveats

1. Sentence-based comparison is noisy.

Small formatting changes can create:

- one “missing” sentence
- one “extra” sentence

without any real text loss.

2. Table chunks distort the notebook’s sentence-count approximation.

The notebook estimates “sentence count” by splitting on periods. For table CSV text, that is only a rough proxy.

3. `cleaned_source` is not a raw OCR baseline.

It is built using the same cleanup path as the chunker:

- `cleanPageText()`
- `stripInlineTables()`

So the notebook is best for checking:

- whether chunking/postprocess drops content after cleanup

It is not a fully independent test of whether the cleanup stage itself removed useful text.

## Current Known Behavior on the Handbook Test PDF

Based on the current notebook results:

- `semantic_raw` preserves all unique cleaned-source words
- `semantic_ts` also preserves all unique cleaned-source words
- `semantic_ts` still drops some all-caps figure-label pages due to the all-caps filter
- page 127 is now preserved in the final output after removing the old ellipsis-based filter behavior

## Practical Summary

If you need the short version:

1. Extraction builds page text and inline table markers.
2. Semantic chunking removes inline tables from prose, cleans the page text, splits into sentence-like spans, embeds those spans, and groups them into source-order chunks.
3. Postprocessing adds standalone table chunks back in, dedupes, filters, and reindexes.
4. The final postprocessed chunk set is embedded and stored in SQLite.

The most important current conceptual rule is:

- semantics are used to decide **where to break**
- semantics are **not** used to decide **what text to keep**
