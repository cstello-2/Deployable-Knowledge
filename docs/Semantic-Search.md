# Semantic Search

Markdown file to document the Deployable-Knowledge semantic search pipeline

## Goal

This is the TypeScript semantic retrieval path for RAG chunk lookup.

For now the design goal is:

- keep the first version simple
- keep the code easy to read
- keep query embeddings on the same model path as chunk embeddings
- support optional narrowing so UI document selection can plug in later
- return timings from the start so bottlenecks are obvious

This is only the semantic search layer.

It does **not** handle:

- BM25 retrieval
- hybrid merging
- BERT / cross-encoder reranking
- UI wiring

Those can plug in later on top of this module.

## Current File

File:
- [semantic-search.ts](../src/lib/server/rag/semantic-search.ts)
- [semantic-search-harness.ts](../src/lib/server/rag/semantic-search-harness.ts)

## High Level Flow

```text
user query
  -> searchSemantic(options)
  -> embedTexts([query])
  -> load filtered chunk rows from SQLite
  -> decode Float32 embedding BLOBs
  -> dot product against query embedding
  -> sort descending
  -> return top k + timings
```

## Why Dot Product

Chunk embeddings are already stored normalized by [embedding-model.ts](../src/lib/server/rag/embedding-model.ts).

The query uses that same helper, so the query embedding is normalized too.

That means ranking can use dot product directly instead of recomputing cosine similarity each time.

Why:

- simpler code
- less per-row math
- same ordering as cosine when both vectors are normalized

## SQLite Retrieval Shape

The current implementation reads from:

- `document_chunks`
- `documents`

It joins both so the result already includes:

- `chunkId`
- `documentId`
- `sourcePath`
- `sourceTitle`
- `pageIndex`
- `chunkIndex`
- `chunkType`
- `content`
- `score`

This result shape is meant to be useful later for:

- hybrid retrieval
- reranking
- RAG context assembly

## Optional Narrowing

The retriever supports optional filters up front:

- `documentIds`
- `sourcePaths`
- `chunkTypes`

Why:

- the UI already has a document selection concept
- narrowing needs to happen before vector scoring when possible
- later scale will depend heavily on avoiding whole-corpus scans when the user already picked a subset

If no filters are sent, the retriever searches all stored chunks for the selected embedding model.

## Timing Output

The retriever returns timings with every search:

- `embedMs`
- `loadCandidatesMs`
- `decodeEmbeddingsMs`
- `scoreMs`
- `sortMs`
- `totalMs`
- `candidateCount`
- `returnedCount`

Why:

- easy testing on the current small corpus
- early visibility into what breaks first as the corpus grows
- helps separate model time from database time from scoring time

## Harness

There is a small CLI harness for inspecting real top-k results without UI wiring yet.

Run it with:

```bash
npm run search:semantic -- --query "tourniquet airway bleeding" --top-k 5
```

Useful flags:

- `--document-id <id>`
- `--source-path <path>`
- `--chunk-type TEXT|TABLE|IMAGE`
- `--json`
- `--full`

Why:

- easy manual retrieval checks
- easy overlap inspection
- easy timing checks while the corpus is still small

## Current Constraints

This first version is an **exact** semantic search.

That means:

- all filtered candidates are loaded
- all filtered embeddings are decoded
- all filtered embeddings are scored
- results are fully sorted in app code

This is acceptable for:

- the current test corpus
- parity debugging
- inspecting output quality before optimizing

This will likely become a bottleneck for very large corpora.

## Expected Bottlenecks

The likely long-term bottlenecks are:

1. reading many embedding BLOBs from SQLite
2. decoding those BLOBs on every query
3. scoring every candidate in JS
4. sorting a very large scored result set

The stored BLOB format itself is not the main problem.

The main scale problem is using SQLite row scans as the search engine.

## Expansion Path

The public semantic search contract should stay stable even if the backend changes later.

That means a future version can swap the exact-scan backend for something indexed while keeping:

- query embedding path
- result shape
- timing output
- optional narrowing contract

This is important because later hybrid retrieval should not need to care how semantic candidates were found.

## Table Chunks

Standalone table chunks are now typed as `TABLE` during postprocess in:

- [chunk-postprocess.ts](../src/lib/server/providers/parse_pipeline/chunk-postprocess.ts)

For now semantic search treats table chunks the same as text chunks unless the caller explicitly filters by `chunkTypes`.

Why:

- simplest behavior for the first version
- no special weighting yet
- keeps future options open without adding complexity now

## Implementation Notes

- Ignore the older `vectorSearch.ts` prototype for this pipeline.
- Use the shared `embedTexts()` helper so chunking, storage, and retrieval stay on one model path.
- Keep the code readable and direct. Avoid helper sprawl unless a helper is doing real work.
- Do not couple this file to UI code yet.

## Next Likely Steps

1. Add a caller or route that uses `searchSemantic(...)`.
2. Inspect top-k outputs for overlap and redundancy.
3. Decide whether neighboring chunk expansion belongs in semantic retrieval or later RAG assembly.
4. Measure timings again on a much larger filtered and unfiltered corpus.
