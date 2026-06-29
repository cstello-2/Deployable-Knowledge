# Architecture Overview

The current app is a SvelteKit project with server routes, local persistence, and retrieval code in the same TypeScript codebase.

```text
Browser UI
  -> SvelteKit routes under src/routes
  -> server modules under src/lib/server
  -> SQLite via Drizzle
  -> local embedding / retrieval helpers
  -> configured LLM provider
```

## Main Areas

- `src/routes/(app)` contains the authenticated app routes and JSON endpoints.
- `src/lib/components` contains Svelte UI components and window/popup surfaces.
- `src/lib/server/database` contains Drizzle schema, database connection, and seed code.
- `src/lib/server/providers` contains provider adapters and PDF parse/chunk logic.
- `src/lib/server/rag` contains embedding, retrieval, BM25, semantic search, and hybrid search helpers.
- `drizzle/` contains checked-in database migrations.

## Data Flow

1. A user uploads or selects a document through the UI.
2. Server routes call shared ingest code in `src/lib/server/rag/ingest-document.ts`.
3. PDF text is extracted, chunked, postprocessed, embedded, and stored in SQLite.
4. Chat routes retrieve relevant context from SQLite-backed retrieval helpers.
5. The selected provider generates the assistant response.

Return to [docs](README.md) or browse the [API reference](API_REFERENCE.md).
