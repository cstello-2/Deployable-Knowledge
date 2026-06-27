"""knowledge 🎓 graph 🕸️ + graph 🔎 search over the embedded corpus 🏺 (the "graph" in GraphRAG).

I think 💭 this is the piece 🧩 that turns 🔄 plain vector ↗️ RAG into graph‑augmented RAG:

  build_graph()   -- read every chunk 🧱 already in ChromaDB 🗃️, pull out the entities 🏷️,
                     and build 🔨 a networkx graph 🕸️ where nodes ⚪ = entities and edges ➰
                     = 2 ✌️ entities co‑occurring 🤝 in the same chunk. Each node remembers
                     the chunk ids 🆔 it lives in, so retrieval can hop 🦘 from a query 🙋
                     entity to its neighbours and pull *their* chunks — context 📜 a plain
                     vector search would likely 🎲 miss.

  graph_search()  -- vector search + knowledge graph expansion + re‑rank.

The extractor is deliberately domain‑agnostic and dependency‑free (regex only, no spaCy,
no network 🌐) to keep the offline‑first 📴 promise of the project 🏗️. The graph is saved 💾
as node‑link JSON under ``config.GRAPH_PATH``.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

import networkx as nx

from config import (
    GRAPH_BOOST,
    GRAPH_EXTRA,
    GRAPH_HOPS,
    GRAPH_MAX_NEIGHBORS,
    GRAPH_PATH,
    GRAPH_VECTOR_TOPK,
)

ProgressCallback = Callable[[int, int, str], None]

# --------------------------------------------------------------------------- #
# entity 🏷️ extraction ⛏️ — generic, regex‑only, offline 📴
# --------------------------------------------------------------------------- #

# multi‑word proper nouns 🏷️ — runs of Capitalised words 🔤 with small connectors
# inside (e.g. "United States Air Force", "Bank of England").
_PROPER = re.compile(
    r"\b([A-Z][a-zA-Z0-9]+(?:[ -](?:of|the|and|for|de|von|van|al)?[ -]?"
    r"[A-Z][a-zA-Z0-9]+){0,4})\b"
)
# hyphen/slash model codes — AV-8B, F/A-18, F-16, B-52, C-130, Su-27 … a lone
# leading letter before a separator, which the pure‑acronym pattern can't say.
_CODE = re.compile(r"\b([A-Z][A-Z0-9]*(?:[/-][A-Z0-9]+)+)\b")
# pure acronyms — USAF, RAG, GPU, NASA — but not a fragment 🧩 of a code (AV-8B).
_ACRONYM = re.compile(r"(?<![\w/-])([A-Z]{2,6})(?![\w/-])")
# articles stripped off the front of a proper‑noun phrase.
_LEADING_ARTICLES = {"the", "a", "an"}
# numeric measurements 📏 -> a tidy "value unit" label. only UNAMBIGUOUS multi‑char
# physical units: single‑letter units (a/g/l/m/v/w/in) and time ⏰ spans ("30 days")
# flooded 🌊 policy docs 📄 with junk 🗑️, so they're deliberately left out.
_MEASURE = re.compile(
    r"\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?"
    r"(lbs?|pounds?|kg|kilograms?|tons?|tonnes?|mg|"
    r"km|kilometers?|miles?|cm|mm|ft|feet|inch(?:es)?|nmi|nm|"
    r"knots?|kt|mph|kph|km/?h|m/s|"
    r"gb|mb|tb|kb|ghz|mhz|hz|kw|mw|volts?|amps?|"
    r"gallons?|gal|liters?|litres?|ml)\b",
    re.IGNORECASE,
)

# common words 📜 that, alone and Capitalised (usually sentence‑start), are noise 🗑️
# rather than entities 🏷️. multi‑word phrases skip 🦘 this filter.
_STOPWORDS: Set[str] = {
    "the", "a", "an", "and", "or", "but", "if", "then", "this", "that", "these",
    "those", "it", "its", "they", "them", "their", "we", "our", "you", "your",
    "he", "she", "his", "her", "i", "me", "my", "us", "to", "of", "in", "on",
    "at", "by", "for", "with", "from", "as", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "can", "could", "should", "may", "might", "must", "shall", "not", "no",
    "yes", "all", "any", "some", "each", "every", "both", "few", "more", "most",
    "other", "such", "only", "own", "same", "so", "than", "too", "very", "just",
    "when", "where", "why", "how", "what", "which", "who", "whom", "while",
    "after", "before", "above", "below", "between", "during", "because", "about",
    "into", "through", "over", "under", "again", "further", "once", "here",
    "there", "also", "however", "therefore", "thus", "hence", "first", "second",
    "third", "next", "last", "new", "old", "one", "two", "three", "figure",
    "table", "section", "chapter", "page", "note", "see", "however",
    # document 📄 ‑structure words that show up Capitalised but aren't entities 🏷️
    "image", "appendix", "paragraph", "attachment", "exhibit", "version",
    "references", "reference", "example", "notes", "figures", "tables",
}
# acronyms that are really stopwords 📜 / formatting noise 🗑️ (incl. latin abbrevs).
_ACRONYM_STOP: Set[str] = {
    "THE", "AND", "FOR", "BUT", "NOT", "ALL", "ANY", "II", "III", "IV",
    "IE", "EG", "ID", "ETC", "VS", "RE", "OK", "AKA", "NA", "TBD",
}

_MIN_ENTITY_LEN = 3


def _norm_measure(value: str, unit: str) -> str:
    """tidy 🧹 a measurement 📏 into one canonical "value unit" label 🏷️."""
    value = value.replace(",", "")
    return f"{value} {unit.lower()}"


def extract_entities(text: str) -> List[Tuple[str, str]]:
    """hand back the ``(label, kind)`` entities 🏷️ found in ``text`` 📃.

    ``kind`` is one 1️⃣ of ``entity`` (proper noun), ``acronym`` or ``measure`` 📏.
    labels are de‑duplicated within the call, keeping first‑seen order.
    """
    found: "dict[str, str]" = {}

    for m in _MEASURE.finditer(text):
        label = _norm_measure(m.group(1), m.group(2))
        found.setdefault(label, "measure")

    for m in _CODE.finditer(text):
        found.setdefault(m.group(1), "acronym")

    for m in _ACRONYM.finditer(text):
        tok = m.group(1)
        # all-caps headers in these military 🛩️ docs spew "OF"/"THE"/"AND" as fake
        # acronyms — drop anything whose lowercase is just a common word 📜.
        if tok in _ACRONYM_STOP or len(tok) < 2 or tok.lower() in _STOPWORDS:
            continue
        found.setdefault(tok, "acronym")

    for m in _PROPER.finditer(text):
        raw = re.sub(r"\s+", " ", m.group(1)).strip(" -")
        toks = raw.split(" ")
        # drop a leading article 📜 ("The AV-8B" -> "AV-8B", the code is already
        # caught; "The United States" -> "United States").
        while toks and toks[0].lower() in _LEADING_ARTICLES:
            toks.pop(0)
        label = " ".join(toks)
        if len(label) < _MIN_ENTITY_LEN:
            continue
        # a single Capitalised word 🔤 that's just a common word -> skip 🦘.
        if " " not in label and label.lower() in _STOPWORDS:
            continue
        # pure‑uppercase tokens are acronym/code turf, handled above.
        if label.upper() == label:
            continue
        found.setdefault(label, "entity")

    return list(found.items())


# --------------------------------------------------------------------------- #
# graph 🕸️ construction 🏗️
# --------------------------------------------------------------------------- #

def _iter_corpus_chunks(db) -> List[Dict[str, Any]]:
    """pull every chunk 🧱 currently sitting in ChromaDB 🗃️."""
    data = db.collection.get(include=["documents", "metadatas"])
    ids = data.get("ids", []) or []
    docs = data.get("documents", []) or []
    metas = data.get("metadatas", []) or []
    out: List[Dict[str, Any]] = []
    for seg_id, doc, meta in zip(ids, docs, metas):
        meta = meta or {}
        out.append(
            {
                "segment_id": seg_id,
                "text": doc or "",
                "source": meta.get("source", "unknown"),
                "page": meta.get("page"),
            }
        )
    return out


def build_graph(
    db=None,
    progress_callback: Optional[ProgressCallback] = None,
    persist: bool = True,
    max_pairs_per_chunk: int = 60,
) -> nx.Graph:
    """build 🔨 the knowledge 🎓 graph 🕸️ from the chunks 🧱 already embedded 🧮 in ChromaDB.

    ``max_pairs_per_chunk`` caps how many co‑occurrence edges ➰ one (entity‑dense)
    chunk may add, so a single huge 🐘 chunk can't dominate the graph.
    """
    if db is None:
        from .retriever import get_db

        db = get_db()

    chunks = _iter_corpus_chunks(db)
    total = len(chunks)
    G = nx.Graph()

    for i, ch in enumerate(chunks):
        if progress_callback and (i % 50 == 0 or i == total - 1):
            progress_callback(i + 1, total, f"Indexing entities ({i + 1}/{total})")

        seg_id = ch["segment_id"]
        source = ch["source"]
        ents = extract_entities(ch["text"])
        labels = [lab for lab, _ in ents]

        for label, kind in ents:
            if G.has_node(label):
                node = G.nodes[label]
                node["count"] += 1
                node["segments"].append(seg_id)
                node["sources"].add(source)
            else:
                G.add_node(
                    label,
                    kind=kind,
                    count=1,
                    segments=[seg_id],
                    sources={source},
                )

        # co‑occurrence edges ➰ (undirected). cap the combinatorial blow‑up 💥.
        n = len(labels)
        pair_budget = max_pairs_per_chunk
        for a in range(n):
            for b in range(a + 1, n):
                if pair_budget <= 0:
                    break
                pair_budget -= 1
                u, v = labels[a], labels[b]
                if u == v:
                    continue
                if G.has_edge(u, v):
                    G[u][v]["weight"] += 1
                else:
                    G.add_edge(u, v, weight=1)
            if pair_budget <= 0:
                break

    if progress_callback:
        progress_callback(total, total, f"Graph built: {G.number_of_nodes()} entities, {G.number_of_edges()} links")

    if persist:
        save_graph(G)
    return G


def save_graph(G: nx.Graph, path: Path = GRAPH_PATH) -> Path:
    """save 💾 the graph 🕸️ as node‑link JSON (sets written as sorted lists 📜)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    H = G.copy()
    for _, node in H.nodes(data=True):
        if isinstance(node.get("sources"), set):
            node["sources"] = sorted(node["sources"])
    data = nx.node_link_data(H, edges="links")
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def load_graph(path: Path = GRAPH_PATH) -> Optional[nx.Graph]:
    """load 📂 a previously built graph 🕸️, or ``None`` if it isn't there yet."""
    path = Path(path)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return nx.node_link_graph(data, edges="links")


# --------------------------------------------------------------------------- #
# Graph index + search
# --------------------------------------------------------------------------- #

class GraphIndex:
    """the loaded knowledge 🎓 graph 🕸️ with entity 🏷️ ‑matching + neighbour‑walk 🚶 helpers."""

    def __init__(self, G: nx.Graph):
        self.G = G
        # longest labels 🏷️ first so "Air Force Base" beats "Air".
        self._labels = sorted(G.nodes, key=len, reverse=True)
        self._label_lc = {lab.lower(): lab for lab in G.nodes}

    @property
    def num_nodes(self) -> int:
        return self.G.number_of_nodes()

    @property
    def num_edges(self) -> int:
        return self.G.number_of_edges()

    def match_entities(self, text: str, limit: int = 12) -> List[str]:
        """hand back graph 🕸️ entities 🏷️ whose label shows up in ``text`` (word‑boundary)."""
        tl = text.lower()
        hits: List[str] = []
        consumed = ""  # don't re‑match a substring of an already‑caught longer span
        for lab in self._labels:
            ll = lab.lower()
            if len(ll) < 3:
                continue
            if re.search(r"\b" + re.escape(ll) + r"\b", tl) and ll not in consumed:
                hits.append(lab)
                consumed += " " + ll
                if len(hits) >= limit:
                    break
        return hits

    def expand(
        self,
        seeds: List[str],
        hops: int = GRAPH_HOPS,
        max_neighbors: int = GRAPH_MAX_NEIGHBORS,
    ) -> Dict[str, int]:
        """walk 🚶 out from ``seeds`` up to ``hops`` edges ➰; give back ``{label: distance}``.

        at each frontier the neighbours are visited strongest‑edge‑first and capped at
        ``max_neighbors``, so a hugely‑connected hub 🛞 doesn't explode 💥 the walk.
        """
        dist: Dict[str, int] = {}
        frontier = [s for s in seeds if self.G.has_node(s)]
        for s in frontier:
            dist[s] = 0
        for d in range(1, hops + 1):
            nxt: List[str] = []
            for node in frontier:
                nbrs = sorted(
                    self.G.neighbors(node),
                    key=lambda m: self.G[node][m].get("weight", 1),
                    reverse=True,
                )[:max_neighbors]
                for m in nbrs:
                    if m not in dist:
                        dist[m] = d
                        nxt.append(m)
            frontier = nxt
            if not frontier:
                break
        return dist

    def candidate_segments(
        self, dist: Dict[str, int], exclude_seeds: bool = True
    ) -> Dict[str, float]:
        """map neighbour entities 🏷️ to chunk 🧱 ids 🆔 with a graph‑proximity 🎯 score.

        a chunk's score is the best (closest) proximity among the entities that point
        to it; proximity fades 🌫️ as ``1 / (1 + distance)``.
        """
        seg_score: Dict[str, float] = {}
        for label, d in dist.items():
            if exclude_seeds and d == 0:
                continue
            prox = 1.0 / (1.0 + d)
            node = self.G.nodes.get(label, {})
            for seg in node.get("segments", []):
                if prox > seg_score.get(seg, 0.0):
                    seg_score[seg] = prox
        return seg_score


# --- lazy singleton 1️⃣ ------------------------------------------------------ #
_index: Optional[GraphIndex] = None


def get_index(reload: bool = False) -> Optional[GraphIndex]:
    """hand back the loaded :class:`GraphIndex`, or ``None`` if no graph 🕸️ is built 🔨 yet."""
    global _index
    if reload:
        _index = None
    if _index is None:
        G = load_graph()
        if G is None:
            return None
        _index = GraphIndex(G)
    return _index


def invalidate_index() -> None:
    """drop 🗑️ the cached index 🗃️ (call after rebuilding the graph 🕸️)."""
    global _index
    _index = None


def graph_stats() -> Dict[str, Any]:
    """summary counts 🔢 for the current graph 🕸️ (feeds the /graph/stats endpoint)."""
    idx = get_index()
    if idx is None:
        return {"built": False, "nodes": 0, "edges": 0}
    kinds: Dict[str, int] = defaultdict(int)
    for _, data in idx.G.nodes(data=True):
        kinds[data.get("kind", "entity")] += 1
    top = sorted(idx.G.degree, key=lambda kv: kv[1], reverse=True)[:15]
    return {
        "built": True,
        "nodes": idx.num_nodes,
        "edges": idx.num_edges,
        "by_kind": dict(kinds),
        "top_entities": [{"entity": n, "degree": d} for n, d in top],
    }


def graph_3d_data(limit: int = 500, max_edges: int = 3000) -> Dict[str, Any]:
    """lay the top entities 🏷️ out in 3‑D 🌌 space for the fly‑through universe 🚀.

    we take the ``limit`` busiest nodes ⚪ by degree, run a 3‑D spring layout so the
    graph 🕸️ becomes a star‑field 🌟, and hand back ``{nodes, links}`` with x/y/z each —
    the browser 🔭 just paints them, no layout maths on the client.
    """
    idx = get_index()
    if idx is None:
        return {"nodes": [], "links": [], "count": 0}
    G = idx.G
    top = [n for n, _ in sorted(G.degree, key=lambda kv: kv[1], reverse=True)[:limit]]
    sub = G.subgraph(top)
    pos = nx.spring_layout(sub, dim=3, seed=42)  # seed so the universe 🌌 is stable run‑to‑run
    SCALE = 600  # blow it up so there's room to fly 🚀 between the stars 🌟
    nodes = []
    for n in top:
        x, y, z = pos[n]
        d = G.nodes[n]
        nodes.append(
            {
                "id": n,
                "kind": d.get("kind", "entity"),
                "count": int(d.get("count", 1)),
                "degree": G.degree[n],
                "x": round(float(x) * SCALE, 2),
                "y": round(float(y) * SCALE, 2),
                "z": round(float(z) * SCALE, 2),
            }
        )
    edges = sorted(sub.edges(data=True), key=lambda e: e[2].get("weight", 1), reverse=True)[:max_edges]
    links = [{"source": u, "target": v, "weight": int(dd.get("weight", 1))} for u, v, dd in edges]
    return {"nodes": nodes, "links": links, "count": len(nodes)}


def subgraph(focus: Optional[str] = None, limit: int = 120, hops: int = 1,
             max_neighbors: int = 14, max_links: int = 600) -> Dict[str, Any]:
    """a bounded slice 🍰 of the graph 🕸️ for the lightweight viewer 🖼️ (no Neo4j 🔷 needed).

    with no ``focus`` we hand back the busiest entities 🏷️; with a ``focus`` we hand back
    that entity + its neighbours, hops 🦘 out. the server 🗄️ ALWAYS caps node ⚪ + link 🔗
    counts, so the browser 🔭 never has to swallow the whole 3k‑page corpus 🏺 at once —
    that's the trick that keeps it smooth.
    """
    idx = get_index()
    if idx is None:
        return {"nodes": [], "links": [], "focus": None}
    G = idx.G
    if focus:
        matches = idx.match_entities(focus, limit=1)
        seed = matches[0] if matches else (focus if G.has_node(focus) else None)
        if seed is None:
            return {"nodes": [], "links": [], "focus": None}
        keep = list(idx.expand([seed], hops=hops, max_neighbors=max_neighbors).keys())[:limit]
    else:
        seed = None
        keep = [n for n, _ in sorted(G.degree, key=lambda kv: kv[1], reverse=True)[:limit]]
    keepset = set(keep)
    nodes = [
        {"id": n, "kind": G.nodes[n].get("kind", "entity"), "count": int(G.nodes[n].get("count", 1)), "degree": G.degree[n]}
        for n in keep
    ]
    links, seen = [], set()
    for u in keep:
        for v in G.neighbors(u):
            if v in keepset and u != v and (v, u) not in seen:
                seen.add((u, v))
                links.append({"source": u, "target": v, "weight": int(G[u][v].get("weight", 1))})
    links.sort(key=lambda l: l["weight"], reverse=True)
    return {"nodes": nodes, "links": links[:max_links], "focus": seed}


def neighbors(entity: str, hops: int = 1, max_neighbors: int = GRAPH_MAX_NEIGHBORS) -> Dict[str, Any]:
    """hand back the neighbourhood 🏘️ of a single entity 🏷️ (feeds the /graph/neighbors endpoint)."""
    idx = get_index()
    if idx is None:
        return {"entity": entity, "found": False, "neighbors": []}
    matches = idx.match_entities(entity, limit=1)
    seed = matches[0] if matches else (entity if idx.G.has_node(entity) else None)
    if seed is None:
        return {"entity": entity, "found": False, "neighbors": []}
    dist = idx.expand([seed], hops=hops, max_neighbors=max_neighbors)
    rows = [
        {"entity": lab, "distance": d, "kind": idx.G.nodes[lab].get("kind", "entity")}
        for lab, d in sorted(dist.items(), key=lambda kv: kv[1])
        if d > 0
    ]
    return {"entity": seed, "found": True, "hops": hops, "neighbors": rows}


def entity_detail(name: str) -> Dict[str, Any]:
    """Look up one entity's card 🪪 — kind, frequency, source docs + a chunk id.

    Powers the click panel in the viewer: the ``segments`` give a provenance 🗞️
    link back to the exact passage via ``doc_at.html?segment=<id>``.
    """
    idx = get_index()
    if idx is None or not idx.G.has_node(name):
        # fall back to a case‑insensitive match so the viewer 🖼️ caption still resolves.
        if idx is not None:
            hit = idx._label_lc.get(name.lower())
            if hit:
                name = hit
        if idx is None or not idx.G.has_node(name):
            return {"found": False, "name": name}
    d = idx.G.nodes[name]
    return {
        "found": True,
        "name": name,
        "kind": d.get("kind", "entity"),
        "count": int(d.get("count", 1)),
        "degree": idx.G.degree[name],
        "sources": sorted(d.get("sources", []) or []),
        "segments": list(d.get("segments", []) or [])[:5],
    }


def graph_search(
    query: str,
    top_k: int = 5,
    exclude_sources: Optional[set] = None,
    vector_k: int = GRAPH_VECTOR_TOPK,
    graph_extra: int = GRAPH_EXTRA,
    hops: int = GRAPH_HOPS,
    boost: float = GRAPH_BOOST,
) -> List[Dict[str, Any]]:
    """graph‑augmented retrieval: vector ↗️ search 🔎 + knowledge 🎓 graph 🕸️ expansion.

    1️⃣ vector search for the strongest ``vector_k`` chunks 🧱 (semantic).
    2️⃣ spot the entities 🏷️ in the query 🙋 *and* in those top chunks.
    3️⃣ walk 🚶 the graph to neighbouring entities and pull *their* chunks (the GraphRAG hop 🦘).
    4️⃣ merge and re‑rank by ``semantic_similarity + boost * graph_proximity`` 🎯.

    falls back to plain vector search when no graph 🕸️ is built yet. the return shape matches
    :func:`core.rag.retriever.search` (with one extra ``via`` key 🗝️).
    """
    from .retriever import get_db, search
    from core.corpus_registry import get_inactive_sources

    vector_rows = search(query, top_k=vector_k, exclude_sources=exclude_sources)
    idx = get_index()
    if idx is None:
        for r in vector_rows:
            r["via"] = "vector"
        return vector_rows[:top_k]

    # seeds 🌱: entities 🏷️ in the query 🙋 plus entities in the strongest vector hits.
    seeds = set(idx.match_entities(query))
    for r in vector_rows[:3]:
        seeds.update(idx.match_entities(r.get("text", "")))

    merged: Dict[str, Dict[str, Any]] = {}
    for r in vector_rows:
        seg = r.get("segment_id")
        r = dict(r)
        r["via"] = "vector"
        r["graph_prox"] = 0.0
        if seg is not None:
            merged[seg] = r

    if seeds:
        dist = idx.expand(list(seeds), hops=hops)
        seg_score = idx.candidate_segments(dist)

        # boost ⬆️ vector chunks 🧱 that the graph 🕸️ also reached.
        for seg, prox in seg_score.items():
            if seg in merged:
                merged[seg]["graph_prox"] = max(merged[seg]["graph_prox"], prox)
                merged[seg]["via"] = "vector+graph"

        # pull graph‑only chunks 🧱 that vector search ↗️ missed.
        new_ids = [s for s in seg_score if s not in merged][: max(graph_extra * 4, graph_extra)]
        if new_ids:
            fetched = get_db().collection.get(ids=new_ids, include=["documents", "metadatas"])
            f_ids = fetched.get("ids", []) or []
            f_docs = fetched.get("documents", []) or []
            f_metas = fetched.get("metadatas", []) or []
            inactive = set(exclude_sources or []) | set(get_inactive_sources())
            extra: List[Dict[str, Any]] = []
            for seg, doc, meta in zip(f_ids, f_docs, f_metas):
                meta = meta or {}
                src = meta.get("source", "unknown")
                if src in inactive:
                    continue
                extra.append(
                    {
                        "text": (doc or "").strip().replace("\n", " "),
                        "source": src,
                        "score": None,
                        "page": meta.get("page"),
                        "segment_id": seg,
                        "via": "graph",
                        "graph_prox": seg_score[seg],
                    }
                )
            # keep only the strongest graph‑only additions 🏆.
            extra.sort(key=lambda r: r["graph_prox"], reverse=True)
            for r in extra[:graph_extra]:
                merged[r["segment_id"]] = r

    # final combined score 🎯: semantic similarity + a graph‑proximity boost ⬆️.
    def combined(r: Dict[str, Any]) -> float:
        sim = r.get("score")
        sim = float(sim) if sim is not None else 0.0
        return sim + boost * r.get("graph_prox", 0.0)

    rows = sorted(merged.values(), key=combined, reverse=True)
    for r in rows:
        r["combined_score"] = round(combined(r), 6)
    return rows[:top_k]


# --------------------------------------------------------------------------- #
# Neo4j loader — push the networkx graph into neo4j 🔷 for the interactive viewer
# --------------------------------------------------------------------------- #

# how many chunk 🧱 ids we keep on each entity 🏷️ node ⚪ for the click-through
# provenance 🗞️ link (a handful is plenty, the whole list 📜 would bloat neo4j).
NEO4J_SEGMENTS_CAP = 25


def load_into_neo4j(
    G: Optional[nx.Graph] = None,
    uri: Optional[str] = None,
    user: Optional[str] = None,
    password: Optional[str] = None,
    segments_cap: int = NEO4J_SEGMENTS_CAP,
) -> Dict[str, int]:
    """mirror 🪞 the networkx knowledge 🎓 graph 🕸️ into Neo4j 🔷 so the browser 🔭 can explore it.

    entities 🏷️ become ``(:Entity {name, kind, count, sources, segments})`` and co‑occurrence
    becomes ``[:CO_OCCURS {weight}]``. reloading is idempotent: the old ``:Entity`` graph is
    wiped 🧽 first. wants a running Neo4j (``docker compose up -d neo4j``); gives back
    ``{nodes, edges}`` counts 🔢.
    """
    from neo4j import GraphDatabase
    from config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

    if G is None:
        G = load_graph()
        if G is None:
            raise RuntimeError("No graph built yet — run `make graph` first.")

    # neo4j 🔷 wants plain lists 📜, not networkx sets — flatten every node ⚪ here.
    nodes = []
    for name, data in G.nodes(data=True):
        nodes.append(
            {
                "name": name,
                "kind": data.get("kind", "entity"),
                "count": int(data.get("count", 1)),
                "sources": sorted(data.get("sources", []) or []),
                "segments": list(data.get("segments", []) or [])[:segments_cap],
            }
        )
    edges = [{"u": u, "v": v, "weight": int(d.get("weight", 1))} for u, v, d in G.edges(data=True)]

    driver = GraphDatabase.driver(
        uri or NEO4J_URI, auth=(user or NEO4J_USER, password or NEO4J_PASSWORD)
    )
    try:
        with driver.session() as s:
            # fresh slate 🧱 — a reload should never leave stale entities behind.
            s.run("MATCH (n:Entity) DETACH DELETE n")
            s.run("CREATE CONSTRAINT entity_name IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE")
            # one UNWIND per batch keeps the load 🪛 fast even on the 3k-page corpus 🏺.
            s.run(
                "UNWIND $rows AS r MERGE (e:Entity {name: r.name}) "
                "SET e.kind = r.kind, e.count = r.count, e.sources = r.sources, e.segments = r.segments",
                rows=nodes,
            )
            s.run(
                "UNWIND $rows AS r MATCH (a:Entity {name: r.u}), (b:Entity {name: r.v}) "
                "MERGE (a)-[c:CO_OCCURS]->(b) SET c.weight = r.weight",
                rows=edges,
            )
    finally:
        driver.close()
    return {"nodes": len(nodes), "edges": len(edges)}


# --------------------------------------------------------------------------- #
# CLI 🖥️: python -m core.rag.graph build | stats | neo4j
# --------------------------------------------------------------------------- #

if __name__ == "__main__":  # pragma: no cover
    import sys

    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "build":
        def _cb(done, total, msg):
            print(f"\r{msg}", end="", flush=True)

        G = build_graph(progress_callback=_cb)
        invalidate_index()
        print(f"\n✓ graph saved to {GRAPH_PATH}")
    elif cmd == "stats":
        print(json.dumps(graph_stats(), indent=2))
    elif cmd == "neo4j":
        counts = load_into_neo4j()
        print(f"✓ loaded into Neo4j: {counts['nodes']} entities, {counts['edges']} links")
    else:
        print("usage: python -m core.rag.graph [build|stats|neo4j]")
