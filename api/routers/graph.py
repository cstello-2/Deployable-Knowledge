"""HTTP 🌐 endpoints for the knowledge 🎓 graph 🕸️ (build / inspect / graph‑search / neo4j 🔷)."""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from core.rag import graph as kg
from api.utils import clamp_int
from config import MIN_TOP_K, MAX_TOP_K, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

router = APIRouter(prefix="/graph", tags=["graph"])

# the first picture 🖼️ the viewer 🔭 paints — top co-occurring entities 🏷️, capped
# so the browser never has to draw the whole 3k-page corpus 🏺 at once.
_INITIAL_CYPHER = (
    "MATCH (n:Entity)-[r:CO_OCCURS]->(m:Entity) "
    "RETURN n, r, m ORDER BY r.weight DESC LIMIT 250"
)


@router.post("/build")
def build():
    """(re)build 🔨 the knowledge 🎓 graph 🕸️ from the chunks 🧱 currently in ChromaDB 🗃️."""
    G = kg.build_graph()
    kg.invalidate_index()
    return {
        "status": "ok",
        "nodes": G.number_of_nodes(),
        "edges": G.number_of_edges(),
    }


@router.get("/stats")
def stats():
    """a summary of the current graph 🕸️: node ⚪ / edge ➰ counts 🔢 + the top entities 🏷️."""
    return kg.graph_stats()


@router.get("/neighbors")
def neighbors(
    entity: str = Query(..., description="Entity to look up"),
    hops: int = Query(1, ge=1, le=3),
):
    """hand back the neighbourhood 🏘️ of a single entity 🏷️."""
    return kg.neighbors(entity, hops=hops)


@router.get("/search")
def search(
    q: str = Query(...),
    top_k: int = Query(5, ge=MIN_TOP_K, le=MAX_TOP_K),
    inactive: Optional[str] = Query(None),
):
    """graph‑augmented search 🔎: vector ↗️ retrieval + knowledge 🎓 graph 🕸️ expansion."""
    exclude = set(json.loads(inactive)) if inactive else None
    results = kg.graph_search(
        q, top_k=clamp_int(top_k, MIN_TOP_K, MAX_TOP_K), exclude_sources=exclude
    )
    return {"results": results}


@router.get("/data")
def data(limit: int = Query(500, ge=10, le=2000)):
    """3‑D 🌌 node‑link data (top entities 🏷️ + positions) for the fly‑through universe 🚀."""
    return kg.graph_3d_data(limit=limit)


@router.get("/entity")
def entity(name: str = Query(..., description="Entity name to describe")):
    """one entity's 🏷️ detail card 🪪 (kind, count, source 🗞️ docs, provenance chunk 🧱 ids 🆔)."""
    return kg.entity_detail(name)


@router.post("/neo4j")
def neo4j_load():
    """push the built graph 🕸️ into Neo4j 🔷 (needs `docker compose up -d neo4j` 🐋)."""
    try:
        return {"status": "ok", **kg.load_into_neo4j()}
    except Exception as e:  # neo4j 🔷 down, or no graph 🕸️ built yet — say so plainly.
        raise HTTPException(status_code=503, detail=f"Neo4j load failed: {e}")


@router.get("/viz-config")
def viz_config():
    """Tell the browser viewer how to reach Neo4j + which picture to draw first.

    The bolt 🔩 url 🔗 + read-only-ish creds 🔑 are local 🏠 demo 🎬 defaults; the
    browser 🔭 talks to Neo4j directly, the classic neovis pattern.
    """
    return {
        "uri": NEO4J_URI,
        "user": NEO4J_USER,
        "password": NEO4J_PASSWORD,
        "initialCypher": _INITIAL_CYPHER,
    }
