# Knowledge Graph and Graph Galaxy Handoff

This document is a handoff map for the Knowledge Graph and Graph Galaxy work on the
`kg-clean` branch. It is meant to help the next developer understand what is active,
what is prototype or legacy work, and what branch history may still contain useful
functionality.

Important expectation note: this branch demonstrates a functional Knowledge Graph
and Graph Galaxy path, but the graph quality is not yet at the level management wants
for a finished product. The system can build/query/visualize graph evidence, but entity
classification, canonical labeling, relationship quality, and full-corpus rebuild
performance still need focused follow-up work.

## Current branch state

- Working branch: `kg-clean`
- Main upstream project branch to compare against: `MAP9900/chunker-production`
- Local working tree status during this audit: many KG/Galaxy/notebook files were still
  uncommitted. Treat this document as describing the current local working tree, not
  only the last pushed commit.
- Current active Knowledge Graph implementation folder:
  - `src/lib/server/knowledge-graph`
- Current active Graph Galaxy UI file:
  - `src/lib/components/windows/GraphGalaxyWindow.svelte`
- Current active graph API routes:
  - `src/routes/(app)/knowledge-graph/+server.ts`
  - `src/routes/(app)/knowledge-graph/visual/+server.ts`
- Current active RAG integration:
  - `src/lib/server/rag/search/retrieve-rag-context.ts`
  - `src/routes/(app)/search/+server.ts`

Validation last run during handoff prep:

```powershell
npm run check
npm run test:knowledge-graph
```

Both passed locally: Svelte check had 0 errors / 0 warnings, and the Knowledge Graph
test suite passed 19/19 tests.

Critical local-only files to include before final push:

- `docs/KNOWLEDGE_GRAPH_HANDOFF.md`
- `src/lib/server/knowledge-graph/dictionary.ts`
- `src/lib/server/knowledge-graph-new/dictionaries/entities.uniform-appearance.json`
- `src/lib/server/knowledge-graph-new/dictionaries/relations.uniform-policy.json`
- `static/usaf-symbol.svg`

If those files are not committed, parts of this handoff will describe local behavior
that coworkers will not receive from GitHub.

## What the active Knowledge Graph does

The active Knowledge Graph path builds graph structure from chunks that are already
stored by the RAG ingestion pipeline. It does not reparse PDFs during normal search.

The active flow is:

1. PDF/document ingestion stores chunks in the normal document/chunk tables.
2. The Knowledge Graph builder reads stored chunks.
3. The TypeScript extractor identifies entities and directed relationships from those chunks.
4. Graph nodes and edges are built for documents, chunks, entities, mentions, and typed relationships.
5. Knowledge Graph search combines:
   - hybrid retrieval seeds;
   - exact/fuzzy entity seeds;
   - LightRAG-style neighborhood expansion;
   - PathRAG-style relationship traversal.
6. Chat context receives retrieved chunks plus graph-path evidence.
7. Graph Galaxy visualizes the focused graph around a query.

## Main active backend files

- `src/lib/server/knowledge-graph/graph-index.ts`
  - Builds and restores the graph index.
  - Handles selected-document and selected-chunk graph scopes.
  - Stores/loads graph snapshots.
  - Augments graph labels at query time.

- `src/lib/server/knowledge-graph/knowledge-graph-search.ts`
  - Runs KG search.
  - Uses hybrid search as grounded seeds.
  - Adds LightRAG and PathRAG graph evidence.
  - Reweights graph evidence so KG mode is less identical to ordinary hybrid search.

- `src/lib/server/knowledge-graph/typescript-extractor.ts`
  - Default entity and relationship extractor.
  - Uses dictionary-guided labels, corpus text, acronym detection, domain terms, and relation evidence.
  - Attempts to avoid promoting relation phrases into white entity nodes.

- `src/lib/server/knowledge-graph/dictionary.ts`
  - Loads JSON dictionary guidance.
  - Canonicalizes entity aliases.
  - Maps relation trigger phrases to normalized relationship names.

- `src/lib/server/knowledge-graph/light-rag.ts`
  - Finds immediate graph-neighborhood evidence from query seeds.

- `src/lib/server/knowledge-graph/path-rag.ts`
  - Walks short paths through chunk/entity relationships.

- `src/lib/server/knowledge-graph/seed-selection.ts`
  - Selects hybrid, exact entity, and fuzzy entity seeds.

- `src/lib/server/knowledge-graph/utils.ts`
  - Shared graph helpers.
  - Includes label sanitation and noisy-entity filtering.

- `src/lib/server/knowledge-graph/triplet-store.ts`
  - Stores document/entity/chunk graph rows in the database.

## Graph Galaxy UI

The active Galaxy window is:

```text
src/lib/components/windows/GraphGalaxyWindow.svelte
```

It currently supports:

- query input inside the Galaxy pane;
- "Last query" graph visualization;
- manual visualize button;
- zoom controls;
- pan/orbit interaction;
- reset camera;
- layer menu for showing/hiding white entity nodes;
- clickable graph nodes;
- clickable relationship lines;
- connected relationship list inside the node inspector;
- relationship menu entries that select and pan/focus the canvas around a connected line;
- USAF visual marker through `static/usaf-symbol.svg`.

The Galaxy window is registered in:

```text
src/lib/components/windows/index.ts
```

## Active database/schema additions

The relevant database schema additions are in:

```text
src/lib/server/database/schema.ts
```

Important tables:

- `graph_nodes`
- `graph_edges`
- `knowledge_graph_snapshots`
- `notebooks`
- `notebook_pages`
- `notebook_sources`

The graph tables store persisted graph node/edge rows used by rebuild/storage workflows.
The runtime graph path also uses graph snapshots for fast restore. The notebook tables
support saving retrieved chunks/sources into notebook workflows.

## Active scripts

Current active Knowledge Graph scripts in `package.json`:

```json
{
  "test:knowledge-graph": "tsx --test src/lib/server/knowledge-graph/*.test.ts",
  "graph:rebuild": "tsx scripts/rebuild-knowledge-graph.ts",
  "graph:rebuild:fast": "tsx scripts/rebuild-knowledge-graph.ts --extractor=typescript"
}
```

Use:

```powershell
npm run graph:rebuild:fast
```

to rebuild graph rows with the TypeScript extractor.

Important limitation: full-corpus graph rebuilds may be slow for very large corpora.
The current runtime also filters noisy stored entity nodes during search/visualization,
so a complete database rebuild is not always required to see cleaner query graphs.

## Dictionary guidance

The active TypeScript extractor reads dictionaries through:

```text
src/lib/server/knowledge-graph/dictionary.ts
```

That loader currently reads JSON dictionaries from:

```text
src/lib/server/knowledge-graph/dictionaries
src/lib/server/knowledge-graph-new/dictionaries
```

The second path is important: even though `knowledge-graph-new` is mostly prototype
work, its `dictionaries` folder is currently used as active guidance by the TypeScript
extractor.

Dictionary files provide:

- canonical entity labels;
- aliases;
- entity types;
- canonical relation names;
- relation trigger phrases;
- optional priority values.

This is not a full ML GLiNER model. It is a TypeScript-native, dictionary-guided,
rule/heuristic extractor designed to avoid the Python side-system during normal app
operation.

## Prototype and research folder

The folder:

```text
src/lib/server/knowledge-graph-new
```

contains prototype/research work, including:

- `ARCHITECTURE_AND_FINDINGS.md`
- `extraction.ts`
- `knowledge-graph.ts`
- `gliner-extractor.py`
- `requirements.txt`
- `dictionaries/*.json`

This folder should be treated carefully:

- The Python GLiNER prototype is not the default active runtime path.
- The architecture/findings document is useful for future research.
- The dictionaries are useful and are currently read by the active TypeScript extractor.

Do not delete `knowledge-graph-new/dictionaries` unless dictionary loading is moved
into `src/lib/server/knowledge-graph/dictionaries` first.

## Older branch functionality to preserve or check

Several older branches contain historical work. Most active functionality has already
been restored or superseded, but some branch-specific pieces are worth knowing about.

### `graph-galaxy-ui` / `restore-galaxy-controls`

Useful history:

- restored direct Galaxy controls;
- query input inside Galaxy;
- Last query button;
- Visualize button;
- zoom and branding work;
- old `static/usaf-symbol.png`;
- old Python `src/lib/server/knowledge-graph/gliner-extractor.py`.

Current status:

- The current working tree already has the important Galaxy controls.
- The old PNG has been replaced with `static/usaf-symbol.svg`.
- The old Python GLiNER file is not required for the default TypeScript path.
- That old Python file mostly returned entity predictions and weak `CO_OCCURS_WITH`
  relations, so it should not be treated as a superior active extractor by default.

### `knowledge-graph-galaxy-polish`

Useful history:

- graph retrieval polishing;
- Galaxy UI polish;
- notebook workflow merge work;
- relationship and navigation work.

Current status:

- Most of this appears represented or superseded by the current working tree.
- Still useful as history if a UI behavior regresses.

### `knowledge-graph-integration`

Useful history:

- first LightRAG / PathRAG knowledge graph retrieval implementation;
- earlier graph index/search files;
- early semantic search harness work.

Current status:

- Superseded by the current `src/lib/server/knowledge-graph` implementation.
- Good reference branch if future developers want to understand the original
  LightRAG/PathRAG design path.

### `knowledge-graph-clean-pr`

Useful history:

- cleaner early PR containing Knowledge Graph retrieval.

Current status:

- Superseded by current `kg-clean` work.

### `Knowledge-Graph`

Useful history:

- older seeded corpus flow;
- older PDF ingestion / seed database scripts;
- earlier graph retrieval ranking fix;
- previous corpus and TCCC seed work.

Files from this branch that may matter for reproducible corpus handoff:

- `scripts/ingest-pdfs.ts`
- `scripts/create-seed-db.ts`
- `scripts/restore-seed-db.ts`
- `scripts/diagnose-rag.ts`

Current concern:

- The current `package.json` has graph rebuild commands but not the old `ingest:pdfs`,
  `seed:corpus`, `seed:database`, or `seed:restore` commands.
- If coworkers need to recreate a preloaded corpus/database from PDFs, verify whether
  these scripts should be restored, renamed, documented, or replaced by the newer
  document ingestion workflow.

### `upstream/agent/knowledge-graph-new`

Useful history:

- Python GLiNER prototype;
- architecture and findings;
- dictionary experiments;
- recommendations about semantic control, entity resolution, relation direction,
  modality, and document-layout artifacts.

Current status:

- Useful for research and documentation.
- Not the default active runtime path.
- The dictionaries from this line of work are useful and currently feed the active
  TypeScript extractor.

## Known limitations and risks

1. Full-corpus graph rebuild performance

   Full graph rebuilds can be slow on large corpora. For a 21k-page corpus, future
   developers should consider incremental graph rebuilds, per-document rebuild queues,
   caching, or background jobs.

2. Entity quality is functional but below management expectations

   The current TypeScript extractor filters some noisy labels and uses dictionaries,
   but results are still uneven. It is not equivalent to a high-quality trained
   NER/relation extraction model, and it should not be presented as a finished
   management-grade graph intelligence layer. The biggest future improvement area is
   semantic control:

   - canonical entity resolution;
   - relation direction;
   - avoiding document-layout artifacts;
   - modality such as "must", "may", "not authorized";
   - domain-specific dictionaries;
   - confidence scoring.

3. `knowledge-graph-new` naming is confusing

   That folder sounds like the active system, but most active runtime code is in
   `src/lib/server/knowledge-graph`. Rename or document this clearly before final handoff.

4. Branch alignment risk

   `kg-clean` and `chunker-production` have diverged significantly. A direct merge into
   `chunker-production` may conflict in package files, provider files, folder sync, and
   document ingestion. Resolve those carefully so new MAP features are not overwritten.

5. Seed/corpus reproducibility needs a decision

   Decide whether the product should ship with:

   - PDFs in repo;
   - `app.db.seed`;
   - generated graph rows;
   - generated embeddings;
   - or a documented ingestion command.

   The current branch should not silently depend on a local-only database.

## Suggested next steps before coworker handoff

1. Commit the current working tree intentionally.
2. Do not commit local log files:
   - `dev-server.log`
   - `dev-server.err.log`
   - `seed-corpus.log`
   - `seed-corpus.err.log`
3. Decide whether to restore/document old seed scripts from `Knowledge-Graph`.
4. Move active dictionaries into `src/lib/server/knowledge-graph/dictionaries` or clearly
   document why they remain in `knowledge-graph-new/dictionaries`.
5. Merge/rebase against latest `upstream/kg-clean`.
6. Separately plan the merge into latest `upstream/chunker-production`.
7. Re-run:

   ```powershell
   npm run check
   npm run test:knowledge-graph
   ```

8. Smoke test in the browser:

   - select Knowledge Graph search mode;
   - ask a document-specific query;
   - open Graph Galaxy;
   - use Last query / Visualize;
   - click a node;
   - click a relationship line;
   - hide/show white entity nodes;
   - save a source/chunk to Notebook if notebook features are in scope.
