# Configuration Guide

Most local configuration is environment-variable driven.

## Database

- `DATABASE_URL`: optional libSQL/SQLite connection URL. If unset, the app uses local SQLite through the repo database helper.

Useful commands:

```bash
npm run db:push
npm run db:migrate
```

## Embeddings

- `SEMANTIC_EMBED_MODEL`: embedding model id. Defaults to `Xenova/all-MiniLM-L6-v2`.
- `SEMANTIC_EMBED_DTYPE`: optional model dtype override.
- `SEMANTIC_EMBED_BATCH_SIZE`: embedding batch size.
- `SEMANTIC_EMBED_ALLOW_REMOTE`: set to `1` to allow first-run model download.
- `SEMANTIC_EMBED_CACHE_DIR`: optional cache path. Defaults to `tmp_model/transformersjs`.

`tmp_model/` is ignored by Git.

## Retrieval

- `RAG_RETRIEVAL_MODE`: default retrieval mode for chat when the UI does not provide one. Expected values are `semantic`, `bm25`, or `hybrid`.

Return to [docs](README.md).
