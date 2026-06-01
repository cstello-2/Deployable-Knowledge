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
- `OLLAMA_BASE_URL` – Ollama API base URL, defaulting to `http://localhost:11434`
- `OLLAMA_MODEL` – model name for the Ollama backend
- `OPENAI_API_KEY` – enables OpenAI chat provider options and chat requests
- `OPENAI_BASE_URL` – OpenAI-compatible API base URL, defaulting to `https://api.openai.com/v1`
- `OPENAI_MODEL` – fallback OpenAI chat model when user settings do not specify one
- `ANTHROPIC_API_KEY` – enables Anthropic chat provider options and chat requests
- `ANTHROPIC_BASE_URL` – Anthropic API base URL, defaulting to `https://api.anthropic.com`
- `ANTHROPIC_MODEL` – fallback Anthropic chat model when user settings do not specify one
- `ANTHROPIC_VERSION` – Anthropic API version header, defaulting to `2023-06-01`
- `GEMINI_API_KEY` – enables Gemini chat provider options and chat requests
- `GEMINI_BASE_URL` – Gemini API base URL, defaulting to `https://generativelanguage.googleapis.com/v1beta`
- `GEMINI_MODEL` – fallback Gemini chat model when user settings do not specify one
- `EMBEDDING_MODEL_ID` – sentence‑transformer to download/cache
- `EMBEDDINGS_DEVICE` – device string for embeddings (e.g. `cpu`)
- `EMBEDDINGS_OFFLINE_ONLY` – set to `1` to require an existing local model cache

Embeddings are configured through `config.py` and environment variables only. The
settings UI displays `EMBEDDING_MODEL_ID` and the local `MODEL_DIR` as read-only
status.

Secrets and user chat preferences are stored under `users/` as JSON files.

Return to [docs](README.md).
