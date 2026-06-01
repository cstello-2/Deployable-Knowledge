"""Corpus tagging, activation, and bulk operations."""

from __future__ import annotations

import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.utils import sanitize_filename
from config import UPLOAD_DIR, ALLOWED_DOCUMENT_EXTENSIONS
from core import corpus_registry as reg
from core.rag.retriever import db

router = APIRouter(prefix="/corpus", tags=["corpus"])


class TagsBody(BaseModel):
    tags: List[str] = Field(default_factory=list)


class PatchDocumentBody(BaseModel):
    source: str
    tags: Optional[List[str]] = None
    active: Optional[bool] = None


class BulkBody(BaseModel):
    sources: List[str] = Field(default_factory=list)
    add_tags: Optional[List[str]] = None
    remove_tags: Optional[List[str]] = None
    active: Optional[bool] = None


class ActivateByTagsBody(BaseModel):
    tags: List[str] = Field(default_factory=list)


@router.get("/tags")
def get_tags():
    return {"approved_tags": reg.get_approved_tags()}


@router.put("/tags")
def put_tags(body: TagsBody):
    return {"approved_tags": reg.set_approved_tags(body.tags)}


@router.patch("/document")
def patch_document(body: PatchDocumentBody):
    try:
        safe = sanitize_filename(body.source)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    meta = reg.patch_source(safe, tags=body.tags, active=body.active)
    return {"id": safe, **meta}


@router.post("/bulk")
def bulk(body: BulkBody):
    if not body.sources:
        raise HTTPException(400, "sources required")
    safe_list = []
    for s in body.sources:
        try:
            safe_list.append(sanitize_filename(s))
        except ValueError:
            continue
    if not safe_list:
        raise HTTPException(400, "no valid sources")
    reg.bulk_update(
        safe_list,
        add_tags=body.add_tags,
        remove_tags=body.remove_tags,
        active=body.active,
    )
    return {"status": "ok", "updated": len(safe_list)}


@router.post("/activate-by-tags")
def activate_by_tags(body: ActivateByTagsBody):
    need = [t for t in body.tags if reg.normalize_tag(t)]
    if not need:
        raise HTTPException(400, "at least one tag required")
    reg.activate_by_tags(need)
    return {"status": "ok"}


@router.post("/deactivate-all")
def deactivate_all():
    reg.deactivate_all_sources()
    return {"status": "ok"}


@router.post("/clear-all")
def clear_all():
    """Remove all vectors, registry source entries, and uploaded files in documents/."""
    try:
        db.clear_collection()
    except Exception as e:
        raise HTTPException(500, str(e)) from e
    reg.clear_registry_sources()
    for p in UPLOAD_DIR.iterdir():
        if p.is_file() and p.suffix.lower() in {e.lower() for e in ALLOWED_DOCUMENT_EXTENSIONS}:
            try:
                os.remove(p)
            except OSError:
                pass
    return {"status": "ok", "message": "Corpus cleared."}
