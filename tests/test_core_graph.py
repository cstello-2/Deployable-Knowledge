import sys
import pathlib

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from core.rag import graph as kg


# --------------------------------------------------------------------------- #
# Fakes: an in-memory stand-in for the ChromaDB collection / DBManager so the
# graph can be exercised with zero network and no embedding model.
# --------------------------------------------------------------------------- #

class FakeCollection:
    def __init__(self, records):
        # records: list of (id, text, metadata)
        self._records = records

    def get(self, include=None, ids=None):
        if ids is not None:
            wanted = set(ids)
            recs = [r for r in self._records if r[0] in wanted]
        else:
            recs = self._records
        return {
            "ids": [r[0] for r in recs],
            "documents": [r[1] for r in recs],
            "metadatas": [r[2] for r in recs],
        }


class FakeDB:
    def __init__(self, records):
        self.collection = FakeCollection(records)


CORPUS = [
    ("c1", "The AV-8B Harrier is built by McDonnell Douglas and weighs 13,968 lbs.",
     {"source": "harrier.pdf", "page": 1}),
    ("c2", "McDonnell Douglas also produced the F/A-18 Hornet for the U.S. Navy.",
     {"source": "hornet.pdf", "page": 2}),
    ("c3", "The U.S. Navy operates the F/A-18 Hornet from aircraft carriers.",
     {"source": "navy.pdf", "page": 3}),
    ("c4", "Photosynthesis converts sunlight into energy in green plants.",
     {"source": "biology.pdf", "page": 9}),
]


def _build_index():
    G = kg.build_graph(db=FakeDB(CORPUS), persist=False)
    return kg.GraphIndex(G)


# --------------------------------------------------------------------------- #
# Entity extraction
# --------------------------------------------------------------------------- #

def test_extract_entities_kinds():
    ents = dict(kg.extract_entities(
        "The AV-8B Harrier built by McDonnell Douglas weighs 13,968 lbs."
    ))
    assert "McDonnell Douglas" in ents and ents["McDonnell Douglas"] == "entity"
    assert "AV-8B" in ents and ents["AV-8B"] == "acronym"
    assert "13968 lbs" in ents and ents["13968 lbs"] == "measure"


def test_extract_entities_drops_stopwords():
    ents = dict(kg.extract_entities("The dog ran. This is fine."))
    # Sentence-initial common words must not become entities.
    assert "The" not in ents
    assert "This" not in ents


# --------------------------------------------------------------------------- #
# Graph construction
# --------------------------------------------------------------------------- #

def test_build_graph_nodes_and_cooccurrence_edges():
    G = kg.build_graph(db=FakeDB(CORPUS), persist=False)
    assert G.has_node("McDonnell Douglas")
    assert G.has_node("F/A-18")
    # Co-occur in c1 -> edge exists.
    assert G.has_edge("AV-8B", "McDonnell Douglas")
    # "McDonnell Douglas" appears in c1 and c2 -> count 2, two source docs.
    node = G.nodes["McDonnell Douglas"]
    assert node["count"] == 2
    assert set(node["sources"]) == {"harrier.pdf", "hornet.pdf"}


def test_save_and_load_roundtrip(tmp_path):
    G = kg.build_graph(db=FakeDB(CORPUS), persist=False)
    path = tmp_path / "graph.json"
    kg.save_graph(G, path=path)
    G2 = kg.load_graph(path=path)
    assert G2 is not None
    assert G2.number_of_nodes() == G.number_of_nodes()
    assert G2.has_edge("AV-8B", "McDonnell Douglas")


# --------------------------------------------------------------------------- #
# Entity matching + neighbour walk
# --------------------------------------------------------------------------- #

def test_match_entities_in_query():
    idx = _build_index()
    hits = idx.match_entities("tell me about the hornet and mcdonnell douglas")
    assert "McDonnell Douglas" in hits
    assert "Hornet" in hits


def test_expand_reaches_neighbours():
    idx = _build_index()
    seeds = idx.match_entities("McDonnell Douglas")
    dist = idx.expand(seeds, hops=2)
    # One hop from McDonnell Douglas should reach the Harrier and the Hornet.
    assert dist.get("Harrier", 99) <= 2
    assert dist.get("F/A-18", 99) <= 2


def test_candidate_segments_pulls_neighbour_chunks():
    idx = _build_index()
    dist = idx.expand(idx.match_entities("McDonnell Douglas"), hops=2)
    segs = idx.candidate_segments(dist)
    # Chunks about the Hornet/Navy should be reachable via the graph.
    assert "c2" in segs or "c3" in segs
    assert all(0.0 < s <= 1.0 for s in segs.values())


# --------------------------------------------------------------------------- #
# graph_search end-to-end (vector layer stubbed)
# --------------------------------------------------------------------------- #

def test_graph_search_adds_graph_neighbours(monkeypatch):
    idx = _build_index()
    monkeypatch.setattr(kg, "get_index", lambda reload=False: idx)

    # Stub the vector layer: pretend semantic search only found the Harrier chunk.
    def fake_search(query, top_k=10, exclude_sources=None):
        return [{
            "text": CORPUS[0][1], "source": "harrier.pdf",
            "score": 0.9, "page": 1, "segment_id": "c1",
        }]

    fake_db = FakeDB(CORPUS)
    monkeypatch.setattr("core.rag.retriever.search", fake_search)
    monkeypatch.setattr("core.rag.retriever.get_db", lambda: fake_db)
    monkeypatch.setattr("core.corpus_registry.get_inactive_sources", lambda: set())

    results = kg.graph_search("what does McDonnell Douglas make?", top_k=5)
    seg_ids = {r["segment_id"] for r in results}
    vias = {r["segment_id"]: r["via"] for r in results}

    # The seed chunk survives, and graph expansion surfaces a Hornet/Navy chunk
    # that pure vector search (stubbed to one hit) would have missed.
    assert "c1" in seg_ids
    assert seg_ids & {"c2", "c3"}
    assert vias["c1"] in ("vector", "vector+graph")
    assert any(v == "graph" for v in vias.values())


def test_graph_search_falls_back_without_graph(monkeypatch):
    monkeypatch.setattr(kg, "get_index", lambda reload=False: None)

    def fake_search(query, top_k=10, exclude_sources=None):
        return [{"text": "x", "source": "s", "score": 0.5, "page": 1, "segment_id": "c1"}]

    monkeypatch.setattr("core.rag.retriever.search", fake_search)
    monkeypatch.setattr("core.corpus_registry.get_inactive_sources", lambda: set())

    results = kg.graph_search("anything", top_k=3)
    assert results and results[0]["via"] == "vector"


# --------------------------------------------------------------------------- #
# Extractor cleanup — all-caps headers / ambiguous units must NOT become entities
# --------------------------------------------------------------------------- #

def test_extract_drops_allcaps_stopwords_and_latin_abbrevs():
    ents = dict(kg.extract_entities("DEPARTMENT OF THE AIR FORCE i.e. IE and OF noise"))
    assert "OF" not in ents      # all-caps "of" header word
    assert "THE" not in ents
    assert "IE" not in ents       # latin abbreviation


def test_extract_drops_ambiguous_single_letter_units():
    ents = dict(kg.extract_entities("Section 38 a applies for 30 days within 5 m of the line."))
    # single-letter / time units are excluded; nothing like "38 a" or "30 days".
    assert not any(k.endswith(" a") or k.endswith(" days") or k.endswith(" m") for k in ents)


# --------------------------------------------------------------------------- #
# entity_detail — the click card the viewer shows
# --------------------------------------------------------------------------- #

def test_entity_detail(monkeypatch):
    idx = _build_index()
    monkeypatch.setattr(kg, "get_index", lambda reload=False: idx)
    d = kg.entity_detail("McDonnell Douglas")
    assert d["found"] is True
    assert d["kind"] == "entity"
    assert d["count"] == 2 and d["degree"] >= 1
    assert "harrier.pdf" in d["sources"]
    assert d["segments"]                      # at least one provenance chunk id


def test_entity_detail_case_insensitive(monkeypatch):
    idx = _build_index()
    monkeypatch.setattr(kg, "get_index", lambda reload=False: idx)
    assert kg.entity_detail("mcdonnell douglas")["found"] is True
    assert kg.entity_detail("no-such-entity")["found"] is False


# --------------------------------------------------------------------------- #
# load_into_neo4j — pushes nodes/edges via the driver (fake driver, offline)
# --------------------------------------------------------------------------- #

class FakeSession:
    def __init__(self, log):
        self._log = log

    def run(self, cypher, **params):
        self._log.append((cypher, params))

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeDriver:
    def __init__(self, log):
        self._log = log

    def session(self):
        return FakeSession(self._log)

    def close(self):
        self._log.append(("CLOSE", {}))


def test_load_into_neo4j_builds_nodes_and_edges(monkeypatch):
    G = kg.build_graph(db=FakeDB(CORPUS), persist=False)

    log = []
    import neo4j
    monkeypatch.setattr(neo4j.GraphDatabase, "driver", lambda *a, **k: FakeDriver(log))

    counts = kg.load_into_neo4j(G=G)
    assert counts["nodes"] == G.number_of_nodes()
    assert counts["edges"] == G.number_of_edges()

    cyphers = " ".join(c for c, _ in log)
    assert "DETACH DELETE" in cyphers              # idempotent wipe first
    assert "MERGE (e:Entity" in cyphers            # node upsert
    assert "CO_OCCURS" in cyphers                  # edge upsert
    # the node UNWIND must carry exactly our entities, with provenance fields.
    node_rows = next(p["rows"] for c, p in log if "MERGE (e:Entity" in c and "rows" in p)
    sample = node_rows[0]
    assert {"name", "kind", "count", "sources", "segments"} <= set(sample.keys())
    assert ("CLOSE", {}) in log                    # driver closed
