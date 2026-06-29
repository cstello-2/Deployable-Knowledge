# Deployable-Knowledge

Local first SvelteKit app for document ingestion, chunking, retrieval, and chat.

## Current Stack

- SvelteKit frontend and server routes
- SQLite via Drizzle for documents and chunks
- TypeScript PDF extraction and semantic chunking
- Local embedding generation for RAG retrieval
- Provider adapter layer for local or hosted model backends

## Setup

Install dependencies:

```bash
npm install
```

Initialize or update the local database:

```bash
npm run db:push
```

Start the dev server:

```bash
npm run dev
```

## Useful Commands

```bash
npm run check
npm run build
npm run search:semantic
```

The embedding model cache defaults to `tmp_model/transformersjs`, which is ignored by Git. Set `SEMANTIC_EMBED_ALLOW_REMOTE=1` for the first run if the model is not already cached.

## Documentation

- [Docs index](docs/README.md)
- [UI overview](docs/UI_OVERVIEW.md)
- [Chunk handoff](docs/Chunk.md)
- [Chunk logic](docs/Chunk-Logic.md)
- [Semantic search](docs/Semantic-Search.md)
- [RAG debug](docs/RAG-Debug.md)



