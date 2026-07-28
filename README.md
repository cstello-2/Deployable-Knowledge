# Deployable Knowledge: Advanced Offline Multi-Modal RAG Stack

**Version vA0.6.7**

Deployable Knowledge is an edge-first, comprehensive knowledge retrieval and generation tool. Built in TypeScript, it is designed for disconnected or bandwidth-constrained environments, providing high-precision multi-hop reasoning through a unique triple-engine search architecture.

## Overview

Deployable‑Knowledge bundles a local vector store, prompt management and a lightweight web UI around a pluggable large‑language model.  Documents are embedded locally, the frontend is developed in [Sveltekit](https://svelte.dev), the backend is written in [Typescript](https://typescriptlang.org).

🚀 Key Features
 - Multi-Modal Ingestion: Supports high-efficiency extraction of text, tables, formulas, and images via OCR and specialized parsing engines like MinerU and Docling
   - PDF, .docx, .pptx, .csv, and .txt
 - Local Persistence: High-performance chunk storage and application state management utilizing a local SQLite backend
 - Triple Search Architecture: Performs three side-by-side searches to ensure comprehensive retrieval:
   - Semantic Search: Cosine similarity-based vector retrieval for capturing deep semantic meaning
   - Lexical Search: BM25-based keyword matching to ensure precise factual alignment
   - Graph-Based Search: A hybrid of LightRAG and HippoRAG methodologies, utilizing Personalized PageRank (PPR) to follow directed paths through a knowledge graph
 - Neural Reranking: Scored results from the reference searches are processed through a BERT-based Cross-Encoder (e.g., MiniLM-L6) for high-fidelity cross-extraction before being fed to the LLM
 - Knowledge Visualization: A dedicated UI for visualizing directed graph paths and comparing chunk-level retrieval results side-by-side

🏗️ Architecture Overview
1. Offline Indexing (The Hippocampal Index)
- **Ingestion** the system mimics human long-term memory by creating a dual-layer index
  - **Dense Coding** Original document passages are stored as contextual nodes
  - **Sparse Coding** An LLM extracts entities and relationships to form a directed knowledge graph
  - **Structured Backbones** The graph is governed by an automatically generated ontology to transform loose associations into deterministic reasoning paths
2. Online Retrieval (Neural Activation)
 - When a query is received, the system simulates a neural activation process
   - The query is matched against both text chunks and graph triples
   - Recognition Memory Filter: The LLM-based "recognition memory" step filters irrelevant triples to ensure the PPR algorithm travels along high-quality 
"highways" of information
   - Graph Traversal: Personalized PageRank spreads activation across the graph to find relevant documents even without direct keyword overlap
3. Generation and Synthesis
The final retrieved contexts—selected through the re-ranker—are provided to the local LLM for grounded, hallucination-free response generation

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed diagrams and data‑flow breakdowns.

🛠️ Quick Start
Installation
Ensure you have the necessary environments for OCR and local LLM serving (e.g., vLLM or o-llama)

DOCX ingestion requires [pandoc](https://pandoc.org) and [tectonic](https://tectonic-typesetting.github.io) on your PATH - it's rendered through LaTeX (pandoc converts it to LaTeX, tectonic typesets it to PDF) before the standard PDF pipeline ingests it, giving real, stable page numbers instead of an approximation. Layout won't match Word's own rendering exactly, since it's a different typesetting engine.

PPTX/CSV/TXT don't go through PDF at all - they're parsed directly (PPTX/CSV via [officeparser](https://www.npmjs.com/package/officeparser), TXT natively) straight into the same chunker, since each already has a real, unambiguous position: slide number, row number, and line number respectively. Citations for these show "Slide N" / "Row N" / "Line N" instead of "Page N".

# Install dependencies
npm install

# Run the deployment wizard
- **npm run setup**
- **Configuration**
- **Deployable Knowledge** allows role-specific model configurations:
  - **EXTRACT** High-capability models for entity/triple extraction
  - **RERANK** Optimized BERT cross-encoders for re-scoring
  - **GENERATE** Local LLMs for final answer synthesis

📊 Benchmarking and Performance
In multi-hop reasoning tasks (such as MuSiQue), this architecture's semantic backbone pushes accuracy significantly higher than standard vector RAG by effectively "connecting the dots" across disparate documents

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

```bash
# First time setup (don't do this everytime)
npm install
npm run db:generate
npm run db:migrate # to be run if there were upstream database changes
```

## For Knowledge Graph triplets

The default Knowledge Graph extractor is Austin's built-in rule-based TypeScript
implementation. The optional Ollama extractor is also invoked through TypeScript;
the project does not require Python.

```bash
# Rebuild with the default rule-based TypeScript extractor
npm run graph:rebuild

# Explicitly select the rule-based TypeScript extractor
npm run graph:rebuild:fast
```

Optional environment variables:

- `KNOWLEDGE_GRAPH_EXTRACTOR=typescript | ollama`
- `KNOWLEDGE_GRAPH_TRIPLET_MODEL=llama3.2:3b`

# After and every other startup run 
```bash
npm run dev
```

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
