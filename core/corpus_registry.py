"""Persistent corpus metadata: approved tags, per-source tags, and activation flags."""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from config import CORPUS_REGISTRY_PATH

_lock = threading.Lock()


def _default_registry() -> Dict[str, Any]:
    return {"approved_tags": [], "sources": {}}


def _load_raw() -> Dict[str, Any]:
    if not CORPUS_REGISTRY_PATH.exists():
        return _default_registry()
    try:
        data = json.loads(CORPUS_REGISTRY_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _default_registry()
        data.setdefault("approved_tags", [])
        data.setdefault("sources", {})
        return data
    except Exception:
        return _default_registry()


def _save_raw(data: Dict[str, Any]) -> None:
    CORPUS_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    CORPUS_REGISTRY_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def normalize_tag(tag: str) -> str:
    t = (tag or "").strip().lower()
    if t.startswith("#"):
        t = t[1:]
    return t


def counts_from_chroma_get(raw: Dict[str, Any]) -> Dict[str, int]:
    """Return map source_name -> segment count from Chroma collection.get() result."""
    doc_map: Dict[str, int] = {}
    for meta in raw.get("metadatas", []) or []:
        source = meta.get("source", "Untitled")
        doc_map[source] = doc_map.get(source, 0) + 1
    return doc_map


def merge_document_list(chroma_raw: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Merge Chroma segment counts with registry tags and active flags."""
    counts = counts_from_chroma_get(chroma_raw)
    with _lock:
        reg = _load_raw()
        sources_meta: Dict[str, Any] = reg.get("sources") or {}
    out: List[Dict[str, Any]] = []
    for title, seg_count in sorted(counts.items(), key=lambda x: x[0].lower()):
        sm = sources_meta.get(title) or {}
        tags = [normalize_tag(t) for t in (sm.get("tags") or []) if normalize_tag(t)]
        active = sm.get("active", True)
        if not isinstance(active, bool):
            active = True
        out.append(
            {
                "title": title,
                "id": title,
                "segments": seg_count,
                "tags": tags,
                "active": active,
            }
        )
    return out


def get_approved_tags() -> List[str]:
    with _lock:
        reg = _load_raw()
        tags = reg.get("approved_tags") or []
        return sorted({normalize_tag(t) for t in tags if normalize_tag(t)})


def set_approved_tags(tags: List[str]) -> List[str]:
    normalized = sorted({normalize_tag(t) for t in tags if normalize_tag(t)})
    with _lock:
        reg = _load_raw()
        reg["approved_tags"] = normalized
        _save_raw(reg)
    return normalized


def _ensure_source(reg: Dict[str, Any], source: str) -> Dict[str, Any]:
    reg.setdefault("sources", {})
    if source not in reg["sources"]:
        reg["sources"][source] = {"tags": [], "active": True}
    return reg["sources"][source]


def patch_source(source: str, tags: Optional[List[str]] = None, active: Optional[bool] = None) -> Dict[str, Any]:
    with _lock:
        reg = _load_raw()
        approved = {normalize_tag(t) for t in (reg.get("approved_tags") or [])}
        entry = _ensure_source(reg, source)
        if tags is not None:
            new_tags: List[str] = []
            for t in tags:
                nt = normalize_tag(t)
                if not nt:
                    continue
                if approved and nt not in approved:
                    continue
                new_tags.append(nt)
            entry["tags"] = sorted(set(new_tags))
        if active is not None:
            entry["active"] = bool(active)
        _save_raw(reg)
        return {"tags": list(entry.get("tags") or []), "active": bool(entry.get("active", True))}


def bulk_update(
    sources: List[str],
    add_tags: Optional[List[str]] = None,
    remove_tags: Optional[List[str]] = None,
    active: Optional[bool] = None,
) -> None:
    add_set = {normalize_tag(t) for t in (add_tags or []) if normalize_tag(t)}
    rem_set = {normalize_tag(t) for t in (remove_tags or []) if normalize_tag(t)}
    with _lock:
        reg = _load_raw()
        approved = {normalize_tag(t) for t in (reg.get("approved_tags") or [])}
        for source in sources:
            entry = _ensure_source(reg, source)
            cur = set(entry.get("tags") or [])
            cur -= rem_set
            for t in add_set:
                if not approved or t in approved:
                    cur.add(t)
            entry["tags"] = sorted(cur)
            if active is not None:
                entry["active"] = bool(active)
        _save_raw(reg)


def _chroma_counts() -> Dict[str, int]:
    from core.rag.retriever import db

    raw = db.collection.get(include=["metadatas"])
    return counts_from_chroma_get(raw)


def activate_by_tags(selected_tags: List[str]) -> None:
    """Set active=True for sources that contain every selected tag; leave all others unchanged."""
    need = {normalize_tag(t) for t in selected_tags if normalize_tag(t)}
    if not need:
        return
    counts = _chroma_counts()
    with _lock:
        reg = _load_raw()
        reg.setdefault("sources", {})
        for name in counts.keys():
            entry = _ensure_source(reg, name)
            have = set(entry.get("tags") or [])
            if need.issubset(have):
                entry["active"] = True
        _save_raw(reg)


def deactivate_all_sources() -> None:
    counts = _chroma_counts()
    with _lock:
        reg = _load_raw()
        reg.setdefault("sources", {})
        for name in counts.keys():
            entry = _ensure_source(reg, name)
            entry["active"] = False
        _save_raw(reg)


def get_inactive_sources() -> Set[str]:
    """Sources marked inactive in registry."""
    with _lock:
        reg = _load_raw()
        sources = reg.get("sources") or {}
        inactive: Set[str] = set()
        for name, meta in sources.items():
            if meta.get("active", True) is False:
                inactive.add(name)
        return inactive


def clear_registry_sources() -> None:
    with _lock:
        reg = _load_raw()
        reg["sources"] = {}
        _save_raw(reg)


def remove_source(source: str) -> None:
    """Drop registry entry when a document is removed from the corpus."""
    with _lock:
        reg = _load_raw()
        reg.setdefault("sources", {})
        reg["sources"].pop(source, None)
        _save_raw(reg)
