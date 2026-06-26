# UI Ingestion And RAG Plan

Concrete implementation plan for restoring an end-to-end UI flow in the current TypeScript app.

## Goal

Get the active SvelteKit app to support:

1. PDF upload from the UI
2. automatic parse -> chunk -> embed -> store
3. document listing by stable `documentId`
4. later semantic retrieval in chat

This plan is intentionally split so ingestion is finished first and RAG retrieval can plug in after.

## Current State

The current repo has the important backend pieces, but they are not fully wired together in the active UI path.

### Working TS pipeline pieces

- [src/lib/server/providers/parse_pipeline/text-extract.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/text-extract.ts)
- [src/lib/server/providers/parse_pipeline/chunker-semantic.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/chunker-semantic.ts)
- [src/lib/server/providers/parse_pipeline/chunk-postprocess.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/chunk-postprocess.ts)
- [src/lib/server/rag/embedding.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/rag/embedding.ts)
- [src/lib/server/rag/semantic-search.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/rag/semantic-search.ts)

### Working chat path

- [src/routes/(app)/sessions/[id]/messages/+server.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/routes/(app)/sessions/[id]/messages/+server.ts)

This currently does plain model chat only.

### Existing UI pieces that can help

- [src/lib/components/popups/DocumentProgressPopup.svelte](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/components/popups/DocumentProgressPopup.svelte)
- [src/lib/components/popups/DocumentFilePickerPopup.svelte](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/components/popups/DocumentFilePickerPopup.svelte)

### Existing UI pieces that look retired or incomplete

- [src/lib/components/windows/DocumentsWindow.svelte.bak](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/components/windows/DocumentsWindow.svelte.bak)
- [src/lib/components/windows/index.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/components/windows/index.ts)

## Recommended Order

Do this in order:

1. shared ingest service
2. upload route
3. document list route
4. minimal UI upload flow
5. chat retrieval integration
6. later hybrid retrieval and reranking

This order keeps the code simple and avoids mixing UI upload problems with RAG prompt problems too early.

## Architecture Direction

The main design rule is:

- ingestion writes stable `documentId`s to SQLite
- retrieval uses `documentId`s for narrowing
- chat does not know or care whether candidates came from semantic-only or later hybrid retrieval

That gives a clean later path for:

- semantic search now
- BM25 + semantic later
- reranking later

## Implementation Notes To Preserve

These are decisions / concerns to keep visible before coding starts.

1. `documentId` should stay stable, but upload storage needs to avoid accidental filename collisions. The current backend builds the document row ID from `source.path`, which is useful for replace-on-reprocess behavior and avoiding duplicate PDFs. For the first version this is acceptable, but the upload route should save files in a way that does not accidentally replace a different PDF with the same original filename. A content hash or similarly stable saved path can be handled during implementation or soon after.
2. The first upload progress UI should be indeterminate. A single `POST /documents` route will not report true parse / chunk / embed progress back to the browser yet. Use the existing progress popup as a simple "working" state, and save streaming or polling progress for later if ingest time becomes a real UX problem.
3. Use the active parse-pipeline extractor: `src/lib/server/providers/parse_pipeline/text-extract.ts`. The older `src/lib/server/rag/text-extract.ts` should be treated as retired code and archived separately, not used for the new UI ingest path.
4. Chat currently has a likely duplicate-render bug in `ChatWindow.svelte`, where message content is rendered inside the role branch and again afterward. Fix this before or during RAG chat work so citations / retrieved-source metadata do not make the display messier.
5. The document list route can return `sourcePath` for debugging, but the frontend should not depend on file paths. UI and chat narrowing should use `documentId`.

## Shared Backend Rule

UI integration must **not** replace the current terminal workflow.

The core backend logic should stay in shared server modules, and both of these should call the same code:

- terminal harnesses and backend testing flows
- SvelteKit routes used by the UI

In practice that means:

- do not bury ingest logic directly inside upload route handlers
- do not bury retrieval logic directly inside chat route handlers
- keep the real work in reusable server files

The desired shape is:

```text
shared backend function
  -> called from terminal harness
  -> called from UI route
```

Why:

- backend code stays easy to test without the UI
- terminal debugging still works when UI work is in progress
- UI becomes a thin wrapper instead of the only way to run the pipeline

## Code Style Rules

- ensure code is simple, easy to follow, and not overly bloated. 
- do not over use functions, short one line, one use fucntions should just be coded in place where they are used instead of having lots of short functions. 
- Add // comments in my style (descriptive yet a tad informal, see chunke-semantic.ts for examples)
- This should not appear "vibe coded" yet can not also come across as very expierenced software as nobody working on this project is older than 22.  

## Phase 1: Shared Ingest Service

Create one shared server module that owns the current TS ingest pipeline.

### New module

Suggested file:

- `src/lib/server/rag/ingest-document.ts`

### Responsibility

Input:

- saved PDF file path
- display title

Flow:

1. build the `Source`
2. run `TextExtract(...)`
3. run `chunkPages(...)`
4. run `postprocessChunks(...)`
5. run `storeDocumentChunks(...)`

Output:

- `documentId`
- `chunkCount`
- `embeddingModel`
- maybe `pageCount`
- timings per stage

### Why first

- one place for the real ingest logic
- easy to call from terminal, route handlers, and later tests
- keeps upload route thin

## Phase 2: Upload Route

Add a minimal SvelteKit upload route.

### Suggested file

- `src/routes/(app)/documents/+server.ts`

### First version behavior

- accept multipart form upload
- only allow PDF for now
- save the uploaded file under `documents/`
- call the shared ingest service
- return a JSON payload with:
  - `documentId`
  - `title`
  - `chunkCount`
  - timings

### Important constraints

- no direct file-path assumptions in the frontend
- replace-on-reprocess behavior is fine
- avoid accidental replacement of different PDFs that share the same original filename
- keep single-file upload first unless multi-upload is truly needed now

### Why not use the file picker first

The existing file picker popup is mostly stubbed.

A normal browser upload input is simpler and lower risk than reviving folder-navigation UI immediately.

For progress, the first version should show an indeterminate "working" state while the upload route finishes. Real stage progress can come later.

## Phase 3: Document List Route

Add a route that returns stored documents from SQLite.

### Suggested file

- `src/routes/(app)/documents/list/+server.ts`

### Response fields

- `id`
- `title`
- `sourcePath`
- `updatedAt`

Optional later fields:

- chunk count
- page count
- source type

### Why this matters

- gives the UI stable `documentId`s
- avoids direct file paths in UI state and chat narrowing
- makes later RAG filtering straightforward

## Phase 4: Minimal UI Upload Flow

Keep this intentionally small.

### First version UI

Use:

- a native file input
- an upload button
- the existing progress popup
- a simple document list view

Do not try to restore the old full documents window first unless needed.

### Suggested behavior

1. user selects one PDF
2. UI uploads to `/documents`
3. progress popup shows ingest status
4. document list refreshes on success

### Files likely involved

- existing popup components
- a small new documents panel or minimal controls in an existing settings window

## Phase 5: Chat Retrieval Integration

Only start this after upload + store + list works.

Current status: upload + store + list now work in the UI, and the uploaded document is confirmed in SQLite with stored embeddings.

### Active chat route

- [src/routes/(app)/sessions/[id]/messages/+server.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/routes/(app)/sessions/[id]/messages/+server.ts)

### Integration shape

Add optional `document_ids` to the chat request body.

Default behavior:

- if the user selected one or more documents, search only those documents
- if no documents are selected, search all stored documents
- chat should still work as plain model chat if retrieval returns no chunks

Flow:

1. user sends question
2. route calls `searchSemantic(...)`
3. pass optional `documentIds`
4. build a RAG context block from retrieved chunks
5. send final prompt through the existing provider chat path

### Shared retrieval helper

Add a small server helper instead of putting all retrieval formatting inside the chat route.

Suggested file:

- `src/lib/server/rag/retrieve-rag-context.ts`

Responsibilities:

1. accept question text, `topK`, and optional `documentIds`
2. call `searchSemantic(...)`
3. return retrieved matches plus a compact context block for prompting
4. expose source metadata in a shape the chat UI can display later

Keep this helper simple for now. It should be semantic-only today, but its caller should not care whether candidates later come from semantic search, BM25, reranking, or neighbor expansion.

### Prompt shape

Keep prompt construction readable and explicit.

Suggested context block:

```text
Retrieved document context:

[1] Title: ...
Page: ...
Content:
...

[2] Title: ...
Page: ...
Content:
...
```

Then append the user's question after the retrieved context. The model should be told to use the context when relevant and to say when the context does not contain the answer.

### UI document selection

Use the existing minimal Documents window rather than building a full document manager.

First version behavior:

1. document rows have checkboxes
2. selected document IDs are stored in simple shared client state
3. ChatWindow includes those selected IDs in the message request body
4. DocumentsWindow can show a small selected count

Suggested file for shared client state:

- `src/lib/utils/documentSelection.ts`

This avoids coupling ChatWindow directly to DocumentsWindow.

### Citations / source display

The chat UI already has a source display area based on assistant message metadata.

For the first pass:

- save retrieved source metadata on the assistant message
- include title, page number, chunk id, document id, score, and a short content preview
- do not add complicated citation rendering yet

This keeps the answer auditable without turning this step into a citation UI rewrite.

### Retrieval debug route

Add a route that inspects retrieved chunks without calling the LLM.

Suggested route:

- `GET /rag/debug?q=...&topK=5`

Optional filters:

- `documentId=<id>` repeated or comma-separated
- `document_id=<id>` repeated or comma-separated
- `chunkType=TEXT`
- `chunk_type=TABLE`

Response should include:

- query
- retrieval mode
- matches with title, page, chunk, score, and full content
- source previews
- timings
- the exact context block that chat would send to the LLM

This matters because local LLM generation is slow and GPU-heavy. Retrieval tuning should not require invoking the model every time.

### BM25 / reranker note

The repo now has BM25 and math-based reranker files from other contributors:

- `src/lib/server/rag/bm25.ts`
- `src/lib/server/rag/mathRerank.ts`

Concern: BM25 currently looks like an in-memory index API over chunk records. The active semantic search reads persisted chunks directly from SQLite. Before using BM25 in chat, add a small DB-backed bridge that loads stored `document_chunks`, indexes them, and applies the same `documentId` narrowing rules as semantic search.

Do not wire BM25 or reranking directly into chat until the semantic debug route makes it easy to compare ranked outputs.

### Extended retrieval debug route plan

Next retrieval task: extend `/rag/debug` before changing chat again.

Current status: implemented with semantic, DB-backed BM25, and hybrid modes. Chat still uses semantic retrieval only.

Goal:

- compare retrieval methods without invoking the LLM
- keep all modes using the same stored SQLite chunks
- keep `documentId` filters consistent across semantic, BM25, and hybrid

Route shape:

- `GET /rag/debug?q=...&mode=semantic&topK=5`
- `GET /rag/debug?q=...&mode=bm25&topK=5`
- `GET /rag/debug?q=...&mode=hybrid&topK=5`

Supported modes:

1. `semantic`: current embedding search over `document_chunks`
2. `bm25`: keyword search over the same filtered `document_chunks`
3. `hybrid`: semantic candidates + BM25 candidates passed through `mathRerank.ts`

Suggested implementation files:

- keep `/rag/debug` route as the API surface
- add `src/lib/server/rag/bm25-search.ts` or similar for DB-backed BM25
- add `src/lib/server/rag/hybrid-search.ts` only if the route starts getting cluttered

BM25 bridge requirements:

1. load chunks from SQLite with optional `documentIds` and `chunkTypes`
2. build an in-memory BM25 index for those candidate chunks
3. search the query and return the same basic match shape as semantic search
4. keep the implementation simple even if indexing per request is not final-performance optimal

Hybrid requirements:

1. run semantic search with a slightly wider candidate window
2. run BM25 search with a slightly wider candidate window
3. convert both result lists into the `Document` shape expected by `mathRerank.ts`
4. rerank with `weightedReciprocalRankRerank(...)`
5. return normalized debug rows with rank source fields such as semantic rank, BM25 rank, and combined score

Debug response should clearly show:

- `mode`
- `query`
- `topK`
- `candidateCount`
- `matches`
- score fields relevant to the mode
- page / chunk / document metadata
- full chunk content
- timings per stage where easy

Important constraint:

- do not replace the chat retrieval path with hybrid until `/rag/debug` shows that hybrid is actually better on real queries

### Important design rule

Keep retrieval as its own step, not mixed into prompt construction.

Conceptually:

```text
question
  -> retrieveCandidates()
  -> buildRagPrompt()
  -> provider.chat()
```

Later this can become:

```text
question
  -> semantic candidates
  -> bm25 candidates
  -> rerank
  -> buildRagPrompt()
  -> provider.chat()
```

## Phase 6: Post-Demo Expansion

After the basic UI flow works:

1. multi-file upload
2. richer document activation / selection UI
3. semantic retrieval debug view in chat
4. BM25 integration
5. reranker integration
6. overlap suppression or neighbor expansion if needed

## Demo Priority

For the immediate demo, the smallest meaningful product flow is:

1. upload PDF in UI
2. automatic ingest completes
3. document appears in list
4. chat can query against retrieved chunks from that stored document

If time gets tight, the first acceptable checkpoint is:

1. upload PDF in UI
2. automatic ingest completes
3. document appears in list

Then semantic chat hookup can come after.

## Concrete Build Steps

### Step 1

Create `ingest-document.ts`.

Done when:

- terminal or route code can call one function to ingest one saved PDF

### Step 2

Create `/documents` upload route.

Done when:

- a browser upload stores a PDF and returns `documentId`

### Step 3

Create `/documents/list` route.

Done when:

- frontend can render stored docs from SQLite

### Step 4

Add minimal upload UI.

Done when:

- user can upload from the app and see success without terminal work

### Step 5

Wire semantic retrieval into chat.

Done when:

- chat answers are built from retrieved chunk context
- selected documents narrow retrieval, otherwise all stored documents are searched
- assistant message metadata includes the retrieved source list

### Step 6

Add minimal document selection UI.

Done when:

- DocumentsWindow lets the user select document IDs
- ChatWindow sends selected IDs with the chat request
- no selection means search all stored documents

## Main Risks

### Risk 1

OCR / chunk / embed work may be slow enough that the UI needs better progress handling.

Mitigation:

- keep timings from the start
- stream or poll progress later if needed

### Risk 2

Upload UI can turn into a document-management rewrite.

Mitigation:

- keep first UI to native upload only
- no folder browser yet

### Risk 3

Chat prompt wiring can get tangled with future hybrid retrieval.

Mitigation:

- keep retrieval as a separate step
- use `documentId` narrowing
- keep prompt builder retrieval-agnostic

## Recommended Next Implementation Task

The next code task should be:

1. create the shared ingest service
2. wire the upload route to it

That is the foundation for everything else.
