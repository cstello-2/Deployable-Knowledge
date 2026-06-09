# Deployable-Knowledge

**Version vA0.2.2**

Offline‑first retrieval‑augmented generation (RAG) stack for disconnected or bandwidth‑constrained environments.

## Overview

Deployable‑Knowledge bundles a local vector store, prompt management and a lightweight web UI around a pluggable large‑language model.  Documents are embedded locally and queried through FastAPI endpoints which power the JavaScript front end.

## Features

- **Document ingestion** for PDF and plaintext sources
- **ChromaDB** vector store with sentence‑transformer embeddings
- **Chat and search** endpoints with optional streaming responses
- **Configurable prompts** and persona editing
- **Authentication middleware** with session and CSRF protection

## Quick Start for Usage

- For verbose start/run, simply run (double-click) `Launch-DeployableKnowledge.bat` or `Launch-DeployableKnowledge.ps1`
- For user-friendly/silent start, simply run (double-click) `Launch-DeployableKnowledge.bat-User` or `Launch-DeployableKnowledge-User.ps1`

## Quick Start for Development

**Unix / macOS:**

```bash
make setup
make run
```

**Windows (PowerShell):**

```powershell
py -3.11 -m venv .venv
# If your default python interpreter is already 3.11, you may also use:
# python -m venv .venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Use `python -m pip` and `python -m pytest` so installs and tests use the same Python as your shell; this avoids "script location not on PATH" or "pytest not recognized" when the venv Scripts folder is not on PATH.

> Note: The current pinned requirements target Python 3.11 / 3.13. Python 3.14 is not compatible with `spacy==3.8.7`.

**Run tests:**

```bash
python -m pytest tests/ -q
```

Visit <http://localhost:8000> once the server starts.  `ollama` must be running locally and can be configured via environment variables such as `OLLAMA_MODEL`.

**If you see "script location not on PATH" or "pytest not recognized":** run `pip` and `pytest` as modules so the active Python is used: `python -m pip install -r requirements.txt` and `python -m pytest tests/ -q`.

## Architecture overview

The system is split into three layers:

```text
core/  – retrieval, prompt rendering and LLM adapters
api/   – FastAPI routers translating HTTP ↔ core
app/   – static assets and UI routes
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed diagrams and data‑flow breakdowns.

## Documentation

Additional guides live in the [`docs/`](docs) folder:

- [API reference](docs/API_REFERENCE.md)
- [UI overview](docs/UI_OVERVIEW.md)
- [Backend services](docs/BACKEND_SERVICES.md)
- [Configuration guide](docs/CONFIGURATION.md)
- [Prompt & LLM integration](docs/PROMPTS_LLM.md)

## Contributing

1. Create a feature branch off `main`.
2. Add tests and run `python -m pytest tests/` before submitting a pull request.
3. Follow the existing coding style and keep docstrings concise.
4. Open a PR describing the change and link to any relevant issues.

---
Released under the MIT license.
