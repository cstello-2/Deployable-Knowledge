# Knowledge Graph & Graph Search (GraphRAG)

Deployable‑Knowledge can augment plain vector retrieval with a **knowledge graph**
built over the same corpus.  This turns ordinary RAG into *GraphRAG*: a query can
hop from the entities it mentions to neighbouring entities and pull in chunks that
a pure semantic search would miss.

Everything is offline and dependency‑free — entity extraction is regex‑only (no
spaCy, no network) and the graph is stored with `networkx` (already a dependency).

## How it works

```text
ChromaDB chunks ──extract entities──► networkx graph ──persist──► graph_store/graph.json
                                          │
query ──vector search──► top chunks ──detect entities──► walk graph (N hops)
                                          │                       │
                                          └──── merge + re‑rank ◄──┘
                              score = semantic_similarity + GRAPH_BOOST · graph_proximity
```

- **Nodes** = entities found in chunk text: proper nouns (`McDonnell Douglas`),
  acronyms / model codes (`USAF`, `F/A-18`), and measurements (`13968 lbs`).
  Each node stores the chunk ids (Chroma segment ids) and source files it appears in.
- **Edges** = co‑occurrence of two entities within the same chunk, weighted by how
  often they co‑occur.
- **Graph search** ([`core/rag/graph.py`](../core/rag/graph.py) → `graph_search`):
  1. vector search for the strongest `GRAPH_VECTOR_TOPK` chunks,
  2. detect entities in the query *and* in those top chunks,
  3. BFS the graph up to `GRAPH_HOPS` hops to neighbouring entities,
  4. pull up to `GRAPH_EXTRA` graph‑only chunks and re‑rank everything by
     `semantic_similarity + GRAPH_BOOST · graph_proximity`.

If no graph has been built, `graph_search` transparently falls back to plain
vector search, so enabling it is always safe.

## Build the graph

The graph is derived from chunks **already embedded** in ChromaDB, so embed your
documents first, then:

```bash
make graph          # build graph_store/graph.json from the current corpus
make graph-stats    # print node/edge counts + top entities
# or: python -m core.rag.graph build
```

Rebuild it whenever the corpus changes (it is cheap relative to embedding).

## HTTP API

Router: [`api/routers/graph.py`](../api/routers/graph.py) (prefix `/graph`).

| Method & path        | Purpose                                            |
|----------------------|----------------------------------------------------|
| `POST /graph/build`  | (Re)build the graph from the current ChromaDB corpus |
| `GET  /graph/stats`  | Node/edge counts, entity kinds, top entities by degree |
| `GET  /graph/neighbors?entity=USAF&hops=1` | Neighbourhood of one entity |
| `GET  /graph/search?q=...&top_k=5` | Graph‑augmented search (same shape as `/search`, plus a `via` field: `vector` / `graph` / `vector+graph`) |
| `GET  /graph/entity?name=T-38C` | One entity's detail card (kind, count, source docs, provenance chunk ids) |
| `POST /graph/neo4j` | Load the built graph into Neo4j for the interactive viewer |
| `GET  /graph/viz-config` | Bolt URL + initial Cypher the browser viewer connects with |

## Interactive graph viewer (Neo4j)

The same graph can be explored visually — an embedded, NotebookLM/Palantir‑style
force layout you can drag, zoom, search, and expand. The viewer
([`app/static/graph.html`](../app/static/graph.html), opened from **Tools ▾ →
Knowledge Graph**) talks to **Neo4j** directly through a vendored, offline copy of
[neovis.js](https://github.com/neo4j-contrib/neovis.js)
([`app/static/js/vendor/neovis.js`](../app/static/js/vendor/neovis.js)); the glue
is one small TypeScript file ([`app/static/graph.ts`](../app/static/graph.ts),
compiled to `graph.js`, committed so there's **no build step** to run it).

```text
ChromaDB chunks ─► networkx graph ─► load_into_neo4j() ─► Neo4j ◄─bolt─ browser viewer
                                                                       (search · expand · provenance)
```

Neo4j is the one runtime dependency this adds, and it's deliberately out‑of‑box:
a single `docker compose up -d neo4j` (see [`docker-compose.yml`](../docker-compose.yml)).
The offline RAG path above does **not** depend on it — Neo4j powers only the
visual explorer, so an air‑gapped box that just wants retrieval can skip it.

**Viewer features:** colour by kind (entity / acronym / measure), node size by
frequency, hover preview, **search** an entity → its subgraph, **double‑click** a
node → grow its neighbourhood (Cypher), **click** a node → a detail card with the
source documents and a link back to the exact passage (`doc_at.html?segment=…`).

### Run the whole thing

```bash
make setup                              # one‑time online: venv + cache the embed model
cp /path/to/corpus/*.pdf documents/     # stage your PDFs
make embed-dir DATA_DIR=documents       # ingest -> ChromaDB
make graph                              # build the networkx graph from the chunks
make neo4j-up                           # docker compose up -d neo4j  (~15s to be ready)
make graph-neo4j                        # load the graph into Neo4j
make run                                # uvicorn on http://127.0.0.1:8000
# Browser: Tools ▾ -> Knowledge Graph
```

`make neo4j-down` stops Neo4j. Re‑running `make graph-neo4j` is idempotent (it
wipes the old `:Entity` graph first).

## Using it in chat

Set `GRAPH_ENABLED=1` to make the chat pipeline use graph‑augmented retrieval
instead of plain vector search:

```bash
GRAPH_ENABLED=1 make run
```

When enabled (and a graph exists), `core/pipeline.py` routes context retrieval
through `graph_search`; otherwise it uses the normal vector `search`.

## Configuration

All knobs live in [`config.py`](../config.py) and are overridable via env vars:

| Setting | Default | Meaning |
|---------|---------|---------|
| `GRAPH_PATH` | `graph_store/graph.json` | where the graph is persisted |
| `GRAPH_ENABLED` | `0` | use graph retrieval in chat |
| `GRAPH_VECTOR_TOPK` | `10` | semantic hits fetched before expansion |
| `GRAPH_EXTRA` | `5` | max graph‑only chunks added per query |
| `GRAPH_HOPS` | `2` | neighbour‑walk depth |
| `GRAPH_MAX_NEIGHBORS` | `8` | per‑node fan‑out cap during the walk |
| `GRAPH_BOOST` | `0.25` | weight of graph proximity in re‑ranking |
| `NEO4J_URI` | `bolt://localhost:7687` | where the viewer + loader reach Neo4j |
| `NEO4J_USER` | `neo4j` | Neo4j user (matches `docker-compose.yml`) |
| `NEO4J_PASSWORD` | `deployable-knowledge` | Neo4j password (local demo default — change it for real use) |

> **Security note:** the viewer is a classic neovis setup — the browser connects
> to Neo4j directly, so `/graph/viz-config` hands the bolt credentials to the
> client. That's fine for a local/offline demo; for anything exposed, put Neo4j
> behind a read‑only user or a proxy.

## Tests

`tests/test_core_graph.py` covers entity extraction (incl. the all‑caps/abbrev and
ambiguous‑unit cleanup), graph construction, save/load round‑trip, entity matching,
the neighbour walk, end‑to‑end `graph_search`, the `entity_detail` card, and the
Neo4j loader (with a fake driver) — all fully offline, no Neo4j or model required.

Return to the [README](../README.md) or the [Architecture overview](ARCHITECTURE.md).
