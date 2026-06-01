"""Persistent corpus metadata: approved tags, per-source tags, and activation flags."""
from __future__ import annotations

import threading
from typing import Any, Dict, List, Optional, Set

from sqlmodel import Session, select

from core.database import engine
from core.database.models import ApprovedCorpusTag, CorpusSource, CorpusSourceTag

_lock = threading.Lock()


def normalize_tag(tag: str) -> str:
    t = (tag or "").strip().lower()
    if t.startswith("#"):
        t = t[1:]
    return t


def _approved_set(session: Session) -> Set[str]:
    rows = session.exec(select(ApprovedCorpusTag)).all()
    return {normalize_tag(row.tag) for row in rows if normalize_tag(row.tag)}


def _ensure_source(session: Session, source: str) -> CorpusSource:
    entry = session.get(CorpusSource, source)
    if entry is None:
        entry = CorpusSource(name=source, active=True)
        session.add(entry)
        session.flush()
    return entry


def _source_tags(session: Session, source: str) -> List[str]:
    rows = session.exec(
        select(CorpusSourceTag).where(CorpusSourceTag.source_name == source)
    ).all()
    return sorted({normalize_tag(row.tag) for row in rows if normalize_tag(row.tag)})


def _set_source_tags(session: Session, source: str, tags: List[str]) -> None:
    rows = session.exec(
        select(CorpusSourceTag).where(CorpusSourceTag.source_name == source)
    ).all()
    for row in rows:
        session.delete(row)
    session.flush()

    for tag in sorted({normalize_tag(t) for t in tags if normalize_tag(t)}):
        session.add(CorpusSourceTag(source_name=source, tag=tag))


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
    with _lock, Session(engine) as session:
        sources = {row.name: row for row in session.exec(select(CorpusSource)).all()}
        tags_by_source: Dict[str, List[str]] = {}
        for row in session.exec(select(CorpusSourceTag)).all():
            tag = normalize_tag(row.tag)
            if tag:
                tags_by_source.setdefault(row.source_name, []).append(tag)

    out: List[Dict[str, Any]] = []
    for title, seg_count in sorted(counts.items(), key=lambda x: x[0].lower()):
        source = sources.get(title)
        out.append(
            {
                "title": title,
                "id": title,
                "segments": seg_count,
                "tags": sorted(set(tags_by_source.get(title, []))),
                "active": source.active if source is not None else True,
            }
        )
    return out


def get_approved_tags() -> List[str]:
    with _lock, Session(engine) as session:
        return sorted(_approved_set(session))


def set_approved_tags(tags: List[str]) -> List[str]:
    normalized = sorted({normalize_tag(t) for t in tags if normalize_tag(t)})
    with _lock, Session(engine) as session:
        for row in session.exec(select(ApprovedCorpusTag)).all():
            session.delete(row)
        session.flush()
        for tag in normalized:
            session.add(ApprovedCorpusTag(tag=tag))
        session.commit()
    return normalized


def patch_source(
    source: str,
    tags: Optional[List[str]] = None,
    active: Optional[bool] = None,
) -> Dict[str, Any]:
    with _lock, Session(engine) as session:
        approved = _approved_set(session)
        entry = _ensure_source(session, source)

        if tags is not None:
            new_tags: List[str] = []
            for tag in tags:
                normalized = normalize_tag(tag)
                if not normalized:
                    continue
                if approved and normalized not in approved:
                    continue
                new_tags.append(normalized)
            _set_source_tags(session, source, new_tags)

        if active is not None:
            entry.active = bool(active)
            session.add(entry)

        result = {
            "tags": _source_tags(session, source),
            "active": bool(entry.active),
        }
        session.commit()
        return result


def bulk_update(
    sources: List[str],
    add_tags: Optional[List[str]] = None,
    remove_tags: Optional[List[str]] = None,
    active: Optional[bool] = None,
) -> None:
    add_set = {normalize_tag(t) for t in (add_tags or []) if normalize_tag(t)}
    remove_set = {normalize_tag(t) for t in (remove_tags or []) if normalize_tag(t)}

    with _lock, Session(engine) as session:
        approved = _approved_set(session)
        for source in sources:
            entry = _ensure_source(session, source)
            current = set(_source_tags(session, source))
            current -= remove_set
            for tag in add_set:
                if not approved or tag in approved:
                    current.add(tag)

            _set_source_tags(session, source, sorted(current))

            if active is not None:
                entry.active = bool(active)
                session.add(entry)

        session.commit()


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
    with _lock, Session(engine) as session:
        for name in counts.keys():
            entry = _ensure_source(session, name)
            if need.issubset(set(_source_tags(session, name))):
                entry.active = True
                session.add(entry)
        session.commit()


def deactivate_all_sources() -> None:
    counts = _chroma_counts()
    with _lock, Session(engine) as session:
        for name in counts.keys():
            entry = _ensure_source(session, name)
            entry.active = False
            session.add(entry)
        session.commit()


def get_inactive_sources() -> Set[str]:
    """Sources marked inactive in registry."""
    with _lock, Session(engine) as session:
        rows = session.exec(
            select(CorpusSource).where(CorpusSource.active == False)  # noqa: E712
        ).all()
        return {row.name for row in rows}


def clear_registry_sources() -> None:
    with _lock, Session(engine) as session:
        for row in session.exec(select(CorpusSourceTag)).all():
            session.delete(row)
        for row in session.exec(select(CorpusSource)).all():
            session.delete(row)
        session.commit()


def remove_source(source: str) -> None:
    """Drop registry entry when a document is removed from the corpus."""
    with _lock, Session(engine) as session:
        for row in session.exec(
            select(CorpusSourceTag).where(CorpusSourceTag.source_name == source)
        ).all():
            session.delete(row)
        entry = session.get(CorpusSource, source)
        if entry is not None:
            session.delete(entry)
        session.commit()
