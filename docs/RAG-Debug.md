# RAG Debug Notes

This file documents the retrieval debug path and how it is separate from the real chat RAG path.

## Current Chat RAG Path

The actual UI chat answer path can use semantic, BM25, or hybrid retrieval.

Flow:

```text
ChatWindow
  -> POST /sessions/[id]/messages
  -> retrieveRagContext(...)
  -> selected retrieval mode
  -> provider.chat(...)
```

Files:

- `src/lib/components/windows/ChatWindow.svelte`
- `src/routes/(app)/sessions/[id]/messages/+server.ts`
- `src/lib/server/rag/retrieve-rag-context.ts`
- `src/lib/server/rag/semantic-search.ts`
- `src/lib/server/rag/bm25-search.ts`
- `src/lib/server/rag/hybrid-search.ts`

Important:

- Chat uses `retrieveRagContext(...)`, so most of the UI does not care which retrieval mode produced the context.
- ChatWindow has a simple retrieval toggle: `Semantic`, `BM25`, `Hybrid`.
- Hybrid is the UI default for now.
- Set `RAG_RETRIEVAL_MODE=semantic` or `RAG_RETRIEVAL_MODE=bm25` before starting the app to change the server default for requests that do not send `retrieval_mode`.
- The current UI sends `retrieval_mode` explicitly.

Example:

```bash
RAG_RETRIEVAL_MODE=semantic npm run dev
```

## Debug Route

The debug route exists so retrieval can be inspected without calling the LLM.

Route:

```text
GET /rag/debug?q=...&mode=semantic&topK=5
GET /rag/debug?q=...&mode=bm25&topK=5
GET /rag/debug?q=...&mode=hybrid&topK=5
```

Optional filters:

```text
documentId=<id>
document_id=<id>
chunkType=TEXT
chunk_type=TABLE
```

The response includes retrieved matches, scores, page/chunk metadata, full chunk content, timings, source previews, and the context block that would be sent to the LLM.

## Debug Files

### `src/routes/(app)/rag/debug/+server.ts`

Route handler for retrieval debugging.

Why it exists:

- gives one API surface for comparing retrieval modes
- avoids calling the LLM while tuning retrieval
- keeps debug behavior separate from chat behavior

### `src/lib/server/rag/bm25-search.ts`

DB-backed BM25 adapter used by the debug route.

Why it exists:

- loads filtered `document_chunks` from SQLite per request
- supports `documentId` and `chunkType` filters correctly
- builds a request-local BM25 index for debug comparisons
- returns rows in a shape similar to semantic search results

This is intentionally separate from `bm25.ts` because the contributor BM25 file owns a process-level global index and startup seeding.

### `src/lib/server/rag/hybrid-search.ts`

Hybrid retrieval adapter.

Why it exists:

- runs semantic search and DB-backed BM25 search
- passes both ranked lists into `mathRerank.ts`
- returns combined debug rows with semantic rank, BM25 rank, and fused score

Current use:

- used by `/rag/debug?mode=hybrid`
- used by chat through `retrieveRagContext(...)` as the current POC default

## Existing Contributor BM25 / Rerank Files

### `src/lib/server/rag/bm25.ts`

Contributor BM25 engine module.

Current role:

- owns a process-level in-memory BM25 index
- can seed that global index from SQLite
- is called from `src/hooks.server.ts`

Current limitation:

- it does not cleanly support per-request `documentId` filtering for debug comparisons

### `src/lib/server/rag/mathRerank.ts`

Reusable math reranker.

Current role:

- exposes `weightedReciprocalRankRerank(...)`
- keeps legacy `reRankData(...)`
- used by `hybrid-search.ts`

## Testing Examples

Semantic only:

```bash
curl "http://localhost:5173/rag/debug?q=How%20to%20perform%20a%209-line%3F&mode=semantic&topK=3"
```

BM25 only:

```bash
curl "http://localhost:5173/rag/debug?q=How%20to%20perform%20a%209-line%3F&mode=bm25&topK=3"
```

Hybrid:

```bash
curl "http://localhost:5173/rag/debug?q=How%20to%20perform%20a%209-line%3F&mode=hybrid&topK=3"
```

Hybrid with one document:

```bash
curl "http://localhost:5173/rag/debug?q=How%20to%20perform%20a%209-line%3F&mode=hybrid&topK=3&documentId=<document-id>"
```

## Next Decision

Use `/rag/debug` to compare semantic, BM25, and hybrid on real questions.

If hybrid is not clearly better, switch chat back to semantic with:

```bash
RAG_RETRIEVAL_MODE=semantic npm run dev
```
