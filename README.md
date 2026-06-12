# Deployable-Knowledge

**Version vA0.3.0**

Offline‑first retrieval‑augmented generation (RAG) stack for disconnected or bandwidth‑constrained environments.

## Overview

Deployable‑Knowledge bundles a local vector store, prompt management and a lightweight web UI around a pluggable large‑language model.  Documents are embedded locally, the frontend is developed in [Sveltekit](https://svelte.dev), the backend is written in [Typescript](https://typescriptlang.org).

## Features

- **Document ingestion** for PDF and plaintext sources
- **ChromaDB** vector store with sentence‑transformer embeddings
- **Chat and search** endpoints with optional streaming responses
- **Configurable prompts** and persona editing
- **Authentication middleware** with session and CSRF protection

## Quick Start for Development

```bash
# First time setup (don't do this everytime)
npm run db:generate
npm run db:migrate

# After and every other startup run 
npm run dev
```

## Architecture overview

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed diagrams and data‑flow breakdowns.

## Documentation

Additional guides live in the [`docs/`](docs) folder:

- [API reference](docs/API_REFERENCE.md)
- [UI overview](docs/UI_OVERVIEW.md)
- [Backend services](docs/BACKEND_SERVICES.md)
- [Configuration guide](docs/CONFIGURATION.md)
- [Prompt & LLM integration](docs/PROMPTS_LLM.md)

## Contributing

1. Create a fork off this repo
2. Create a feature branch off `cancun` on your fork.
3. Follow the existing coding style (run formatter, before committing `npm run format`). 
4. Open a PR describing the change and link to any relevant issues.

---
Released under the MIT license.
