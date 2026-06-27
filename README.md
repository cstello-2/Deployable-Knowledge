# Deployable Knowledge 🎓

**Version 0.9.0** — an offline‑first 📴 retrieval‑augmented‑generation (RAG) tool 🧰, now with a knowledge 🎓 graph 🕸️, graph 🔎 search, and an interactive 🕹️ Neo4j 🔷 viewer 🖼️.

I think 💭 the short 📏 story 📖 is this: you point 👉 it at a pile 🗂️ of PDFs 📑, it embeds 🧮 them locally 🏠 into a vector ↗️ store 🏪, and then you can chat 🗨️, search 🔎, and — the new ✨ part — *see* 👀 the knowledge as a living 🌱 graph 🕸️ you can drag, zoom 🔍, and expand 🦘. It's likely 🎲 most useful on a disconnected 📴 or low‑bandwidth 🐌 box 📦, because nothing 🚫 needs the internet 🌐 at run ▶️ time ⏰ (except the optional 🔷 graph viewer, more on that below).

---

## ✨ Features 🌟

- **Document 📄 ingestion 📥** for PDF 📄 and plaintext sources 🗞️ — I try to keep the chunking 🧱 sensible so passages stay readable.
- **ChromaDB 🗃️** vector ↗️ store 🏪 with sentence‑transformer embeddings 🧮 (the `all‑MiniLM‑L6‑v2` model 🔮, cached locally 🏠).
- **Knowledge 🎓 graph 🕸️ + graph 🔎 search** built over the *same* chunks 🧱 — entities 🏷️ become nodes ⚪, co‑occurrence 🤝 becomes edges ➰.
- **Interactive 🕹️ graph viewer 🖼️** (Neo4j 🔷 + neovis), opened 🚪 from **Tools ⚒️ ▾ → Knowledge Graph** — search an entity, double‑click to grow 🦘 its neighbourhood, click a node ⚪ for a detail 🪪 card with a link 🔗 back to the source 🗞️ page 📃.
- **Chat 🗨️ + streaming** answers with configurable 🎚️ prompts and personas 🎭.
- **Auth 🔒 middleware** with session 🪪 + CSRF 🛡️ protection.

---

## 🏗️ Architecture 🗺️

I guess 🤔 the cleanest way to picture 🖼️ it is three 🤟 layers, plus the graph 🕸️ that sits beside them:

```text
core/  – retrieval, prompt rendering, LLM adapters, the knowledge graph
api/   – FastAPI routers translating HTTP <-> core
app/   – static assets + the UI (incl. the graph viewer page)
```

And the graph 🕸️ flow 🌊, which is probably 🤞 the bit you came here for:

```text
PDFs 📑 ──embed──► ChromaDB chunks ──extract entities──► networkx graph ──► graph_store/graph.json
                                                              │                       │
                                       load_into_neo4j() ◄────┘                       │
                                                │                                     │
                              Neo4j 🔷 ◄──bolt──┴── browser viewer 🖼️    chat/search ◄─┘ (graph_search)
```

The important 💡 thing, I believe, is that the offline 📴 RAG path does **not** depend on Neo4j 🔷 — Neo4j only powers the *visual* 👀 explorer 🔭. So an air‑gapped ✂️ machine 🤖 that just wants retrieval can happily skip 🦘 it.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/KNOWLEDGE_GRAPH.md](docs/KNOWLEDGE_GRAPH.md) for the longer 📏 walk‑through 🚶.

---

## 🚀 Quick start

It's likely 🎲 you only need a handful 🤏 of commands. Code blocks are kept literal so you can copy‑paste them:

```bash
# 1) one-time, online: make a venv, cache the embedding model
make setup

# 2) stage your PDFs and embed them into ChromaDB
cp /path/to/corpus/*.pdf documents/
make embed-dir DATA_DIR=documents

# 3) build the knowledge graph from those chunks
make graph
make graph-stats        # peek: node/edge counts + top entities

# 4) run the app
make run                 # http://127.0.0.1:8000
```

That's the whole 💯 offline 📴 tool 🧰. The chat 🗨️ step wants a local 🏠 LLM (Ollama 🦙 by default, configurable 🎚️ via env vars like `OLLAMA_MODEL`), but search 🔎 and the graph 🕸️ work without one.

### 🕹️ Turning on the interactive graph viewer 🖼️

This part adds one out‑of‑box 📦 service 🛎️ — Neo4j 🔷 — through docker 🐋 compose 🎼. I think it's worth it for the demo 🎬, because the graph really comes alive 🌱 when you can grab 🤝 a node ⚪ and pull 🪢:

```bash
make neo4j-up           # docker compose up -d neo4j  (~15s to be ready)
make graph-neo4j        # load the built graph into Neo4j
make run
# then in the browser: Tools ▾ -> Knowledge Graph
make neo4j-down         # stop Neo4j when you're done
```

A small ⚠️ note 📝: the viewer 🖼️ is the classic neovis setup, so the browser 🔭 connects 🔌 to Neo4j 🔷 directly over bolt 🔩. That's lovely 🥰 on localhost 🏠, but it means a *public* 🌐 viewer needs a *public* Neo4j (e.g. Neo4j Aura) — a plain HTTP tunnel 🕳️ will serve the app and search but not the live graph.

---

## 🔎 The knowledge graph, a little deeper

- **Nodes ⚪** = entities 🏷️ pulled from chunk 🧱 text 📃 by plain regex (no spaCy, no network 🌐): proper nouns (`McDonnell Douglas`), acronym/model codes (`F/A-18`, `USAF`), and measurements (`13,968 lbs`). Each node remembers the chunk ids 🆔 and source 🗞️ documents it appears in.
- **Edges ➰** = two entities co‑occurring 🤝 in the same chunk, weighted 🏋️ by how often.
- **graph_search()** = vector ↗️ search for the strongest chunks, detect the entities inside them, walk 🚶 the graph a hop 🦘 or two to neighbours, pull *their* chunks, and re‑rank by `semantic_similarity + GRAPH_BOOST · graph_proximity`. Set `GRAPH_ENABLED=1` to let chat 🗨️ use it; otherwise it stays plain vector search (a safe 🛟 fallback).

The viewer 🖼️ itself gives you the NotebookLM / Palantir‑ish moves: **hover 👀** for a preview, **search 🔎** to jump to one entity's subgraph, **double‑click 🦘** to grow a neighbourhood (a fresh Cypher under the hood), and **click 🖱️** a node ⚪ for a card 🪪 with its source documents and a `open a source passage →` link 🔗 straight to the page 📃.

---

## ⚙️ Configuration 🎚️

Everything lives in [`config.py`](config.py) and is overridable with env vars. The defaults are local 🏠 demo 🎬 values; please change the Neo4j password 🗝️ for anything real.

| Setting | Default | Meaning |
|---|---|---|
| `GRAPH_ENABLED` | `0` | use graph‑augmented retrieval in chat |
| `GRAPH_VECTOR_TOPK` | `10` | semantic hits before graph expansion |
| `GRAPH_HOPS` | `2` | neighbour‑walk depth |
| `GRAPH_BOOST` | `0.25` | weight of graph proximity in re‑ranking |
| `NEO4J_URI` | `bolt://localhost:7687` | where the viewer + loader reach Neo4j |
| `NEO4J_USER` | `neo4j` | Neo4j user |
| `NEO4J_PASSWORD` | `deployable-knowledge` | Neo4j password — **change for real use** |
| `EMBEDDING_MODEL_ID` | `sentence-transformers/all-MiniLM-L6-v2` | local embedding model |

---

## 🌐 HTTP API

Graph router: [`api/routers/graph.py`](api/routers/graph.py) (prefix `/graph`).

| Method & path | Purpose |
|---|---|
| `POST /graph/build` | (re)build the graph from the current ChromaDB corpus |
| `GET  /graph/stats` | node/edge counts + top entities |
| `GET  /graph/search?q=...` | graph‑augmented search (adds a `via` field) |
| `GET  /graph/entity?name=T-38C` | one entity's detail card + provenance chunk ids |
| `POST /graph/neo4j` | load the graph into Neo4j for the viewer |
| `GET  /graph/viz-config` | bolt url + initial Cypher the viewer connects with |

---

## 📴 On staying offline

I consider this the heart ❤️ of the project, so a few honest notes:

- The embedding model 🔮 is cached into `tmp_model/` once (online 🛰️), then loaded locally 🏠 forever after — `make verify-offline` checks it.
- The graph 🕸️ build, `graph_search`, and all the `/graph` data endpoints need **no** network 🌐.
- Neo4j 🔷 is the one runtime add‑on, and it's optional and local 🏠. The vendored neovis 🖼️ library lives in `app/static/js/vendor/` so even the viewer pulls nothing from a CDN.

---

## 🧪 Tests

```bash
make test            # or: python -m pytest tests/ -q
```

`tests/test_core_graph.py` covers entity extraction (including the noise cleanup), graph build, save/load, the neighbour walk, `graph_search`, the entity detail card, and the Neo4j loader (with a fake driver 🛠️) — all fully offline 📴, no Neo4j or model needed.

---

## 🗂️ Project layout

```text
core/rag/graph.py      – entity extraction, networkx graph, graph_search, Neo4j loader
api/routers/graph.py   – the /graph endpoints
app/static/graph.html  – the interactive viewer page
app/static/graph.ts    – viewer logic (TypeScript), compiled to graph.js (committed)
app/static/js/vendor/  – vendored neovis.js (offline)
docker-compose.yml     – the one out-of-box Neo4j service
docs/KNOWLEDGE_GRAPH.md – the full graph + viewer guide
```

---

## 🩹 Troubleshooting

- **Viewer says "Neo4j error"** — it's likely 🎲 Neo4j isn't up or isn't loaded: run `make neo4j-up`, wait ~15s, then `make graph-neo4j`.
- **Graph looks noisy** — rebuild after re‑embedding (`make graph`); the extractor already drops all‑caps stop‑words and ambiguous units, but a messier corpus 🏺 may want a higher min‑degree filter.
- **The model won't download** — corporate SSL is the usual culprit; the error message lists the env‑var workarounds, or you can copy a pre‑downloaded model folder into `tmp_model/`.

---

Released under the MIT license. Contributions welcome — branch off, add tests, and open a PR :)
