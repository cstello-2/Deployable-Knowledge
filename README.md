# Deployable Knowledge: Advanced Offline Multi-Modal RAG Stack

**Version vA0.6.7**

Deployable Knowledge is an edge-first, comprehensive knowledge retrieval and generation tool. Built in TypeScript, it is designed for disconnected or bandwidth-constrained environments, providing high-precision multi-hop reasoning through a unique triple-engine search architecture.

## Overview

Deployable‑Knowledge bundles a local vector store, prompt management, and a lightweight web UI around a pluggable large‑language model.  Documents are embedded locally and queried through FastAPI endpoints which power the TypeScript front end.

🚀 Key Features
Multi-Modal Ingestion: Supports high-efficiency extraction of text, tables, formulas, and images via OCR and specialized parsing engines like MinerU and Docling
Local Persistence: High-performance chunk storage and application state management utilizing a local SQLite backend
Triple Search Architecture: Performs three side-by-side searches to ensure comprehensive retrieval:
  Semantic Search: Cosine similarity-based vector retrieval for capturing deep semantic meaning
  Lexical Search: BM25-based keyword matching to ensure precise factual alignment
  Graph-Based Search: A hybrid of LightRAG and HippoRAG methodologies, utilizing Personalized PageRank (PPR) to follow directed paths through a knowledge graph
Neural Reranking: Scored results from the reference searches are processed through a BERT-based Cross-Encoder (e.g., MiniLM-L6) for high-fidelity cross-extraction before being fed to the LLM
Knowledge Visualization: A dedicated UI for visualizing directed graph paths and comparing chunk-level retrieval results side-by-side

🏗️ Architecture Overview
1. Offline Indexing (The Hippocampal Index)
During ingestion, the system mimics human long-term memory by creating a dual-layer index
  Dense Coding: Original document passages are stored as contextual nodes
  Sparse Coding: An LLM extracts entities and relationships to form a directed knowledge graph
  Structured Backbones: The graph is governed by an automatically generated ontology to transform loose associations into deterministic reasoning paths
2. Online Retrieval (Neural Activation)
When a query is received, the system simulates a neural activation process
  Seed Node Activation: The query is matched against both text chunks and graph triples
  Recognition Memory Filter: An LLM-based "recognition memory" step filters irrelevant triples to ensure the PPR algorithm travels along high-quality "highways" of information
  Graph Traversal: Personalized PageRank spreads activation across the graph to find relevant documents even without direct keyword overlap
3. Generation and Synthesis
The final retrieved contexts—selected through the re-ranker—are provided to the local LLM for grounded, hallucination-free response generation

🛠️ Quick Start
Installation
Ensure you have the necessary environments for OCR and local LLM serving (e.g., vLLM or o-llama)

# Install dependencies
npm install

# Run the deployment wizard
npm run setup
Configuration
Deployable Knowledge allows for role-specific model configurations:
  EXTRACT: High-capability models for entity/triple extraction
  RERANK: Optimized BERT cross-encoders for re-scoring
  GENERATE: Local LLMs for final answer synthesis

📊 Benchmarking and Performance
In multi-hop reasoning tasks (such as MuSiQue), this architecture's semantic backbone pushes accuracy significantly higher than standard vector RAG by effectively "connecting the dots" across disparate documents
📜 License
This project is released under the MIT License
Inspired by the neurobiological Hippocampal Indexing Theory and state-of-the-art GraphRAG research

## Features (or future goals)

- **Document ingestion** for PDF and plaintext sources
- **SQLite** vector store with sentence‑transformer embeddings
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
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Use `python -m pip` and `python -m pytest` so installs and tests use the same Python as your shell; this avoids "script location not on PATH" or "pytest not recognized" when the venv Scripts folder is not on PATH.

**Run tests:**

```bash
python -m pytest tests/ -q
```

Visit <http://localhost:8000> once the server starts. Ollama is available by default with the seeded `llama3` model; use **Manage API Keys** in the prompt editor to connect hosted providers.

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
