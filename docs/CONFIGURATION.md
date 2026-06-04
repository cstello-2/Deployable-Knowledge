# Configuration Guide

Configuration values live in `config.py` and environment variables.

Key paths:

- `UPLOAD_DIR` – directory for user uploaded documents
- `PDF_DIR` – directory scanned for batch ingestion
- `MODEL_DIR` – location of the embedding model
- `DATABASE_PATH` – SQLite database path when `DATABASE_URL` is not set, defaulting to `app.db`

Environment variables:

- `DATABASE_URL` – SQLModel database URL, defaulting to SQLite at `DATABASE_PATH`
- `DATABASE_ECHO` – set to `1` to log SQL statements
- `EMBEDDING_MODEL_ID` – sentence‑transformer to download/cache
- `EMBEDDINGS_DEVICE` – device string for embeddings (e.g. `cpu`)
- `EMBEDDINGS_OFFLINE_ONLY` – set to `1` to require an existing local model cache

LLM provider credentials and current chat models are stored in the SQL
`providers` table. Use the UI's **Manage API Keys** button, or the `/providers`
API, to save keys for OpenAI, Anthropic, Gemini, and GitHub Models. Ollama is
seeded as an available provider without an API key.

Embeddings are configured through `config.py` and environment variables only. The
settings UI displays `EMBEDDING_MODEL_ID` and the local `MODEL_DIR` as read-only
status.

User chat preferences and auth sessions are stored in the SQL database. Legacy
`users/*.json` settings are imported on first access when present. Legacy
`user_sessions/*.json` auth sessions are imported on startup when present.

Return to [docs](README.md).
