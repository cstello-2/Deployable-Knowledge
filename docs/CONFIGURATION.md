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
- `PYODIDE_PACKAGE_CACHE_DIR` – optional writable cache for Pyodide's NumPy and
  Matplotlib packages; defaults to a directory under the operating system's
  temporary directory

LLM provider credentials and current chat models are stored in the SQL
database. Use the UI's **Manage API Keys** button, or the `/providers` API, to
save credentials for hosted providers. Ollama is a local provider and does not
require a stored key.

Embeddings are configured through `config.py` and environment variables only. The
settings UI displays `EMBEDDING_MODEL_ID` and the local `MODEL_DIR` as read-only
status.

User chat preferences and auth sessions are stored in the SQL database. Legacy
`users/*.json` settings are imported on first access when present. Legacy
`user_sessions/*.json` auth sessions are imported on startup when present.

Assistant profiles also store `agentMaxTurns` (default `4`, allowed range
`1`–`10`). This is the maximum number of model/tool iterations before the
runner disables tools and asks the model for a final answer. A value of `1`
still permits one tool turn followed by final-answer generation.

Document retrieval settings are tool defaults: `retrievalMode` selects the
default `search` strategy and `ragTopK` sets its default result count. The model
can refine the query or request another search during the configured turn
budget; retrieval is no longer run unconditionally before every chat request.

The `python` tool uses the npm Pyodide runtime in a backend worker. A native
Python installation or browser-side charting libraries are not required. On
first use, the backend needs network access to fetch the official
Pyodide NumPy and Matplotlib packages unless they already exist in
`PYODIDE_PACKAGE_CACHE_DIR`.

Return to [docs](README.md).
