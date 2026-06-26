# RAG Debug Notes

This file documents the retrieval debug path and how it is separate from the real chat RAG path.

## Current Chat RAG Path

The actual UI chat answer path is still semantic-only.

Flow:

```text
ChatWindow
  -> POST /sessions/[id]/messages
  -> retrieveRagContext(...)
  -> searchSemantic(...)
  -> provider.chat(...)
```

Files:

- `src/lib/components/windows/ChatWindow.svelte`
- `src/routes/(app)/sessions/[id]/messages/+server.ts`
- `src/lib/server/rag/retrieve-rag-context.ts`
- `src/lib/server/rag/semantic-search.ts`

Important:

- BM25 is not currently used to generate chat answers.
- Hybrid reranking is not currently used to generate chat answers.
- Chat should stay semantic-only until debug results show hybrid is better on real queries.

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

Debug-only hybrid retrieval adapter.

Why it exists:

- runs semantic search and DB-backed BM25 search
- passes both ranked lists into `mathRerank.ts`
- returns combined debug rows with semantic rank, BM25 rank, and fused score

This should not be wired into chat until debug comparisons justify it.

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

Only after hybrid clearly helps should chat move from:

```text
retrieveRagContext -> searchSemantic
```

to a hybrid helper.
