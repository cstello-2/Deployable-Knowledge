# Backend Services Overview

Backend behavior lives in SvelteKit server routes and shared TypeScript modules.

## Server Modules

- `src/lib/server/database`: SQLite connection, Drizzle schema, and seed data.
- `src/lib/server/providers`: provider registry, local provider adapters, and parse pipeline.
- `src/lib/server/rag`: document ingest, embeddings, semantic search, BM25, hybrid search, and chat retrieval context.
- `src/lib/server/auth`: session/auth helpers used by app routes.

## Route Boundaries

Routes under `src/routes/(app)` should stay thin. They should validate request data, call shared server modules, and return JSON or Svelte-rendered UI. Terminal workflows and UI workflows should share the same backend modules where possible.

Return to [docs](README.md).
