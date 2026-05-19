from __future__ import annotations

import json
import os
import shutil
import re 
import threading
from pathlib import Path
from typing import Any, Dict, List

from config import (
    UPLOAD_DIR,
    ALLOWED_DOCUMENT_EXTENSIONS,
    FOLDER_SYNC_REGISTRY_PATH,
)
from core.rag.retriever import db, embed_file
from core.corpus_registry import remove_source as registry_remove_source

_lock=threading.Lock()
_sync_lock = threading.Lock()

def _default_registry() -> Dict[str, Any]:
    return {
        "folders":[],
        "files":{}
    }

def _load_raw() -> Dict[str, Any]:
    if not FOLDER_SYNC_REGISTRY_PATH.exists():
        return _default_registry()
    
    try:
        data = json.loads(FOLDER_SYNC_REGISTRY_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _default_registry
        
        data.setdefault("folders", [])
        data.setdefault("files", {})
        return data
    except Exception:
        return _default_registry()
    
def _save_raw(data: Dict[str, Any]) -> None:
    FOLDER_SYNC_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    FOLDER_SYNC_REGISTRY_PATH.write_text(
        json.dumps(data, indent=2),
        encoding="utf-8"
    )

def _supported_file(path: Path) -> bool:
    if not path.is_file():
        return False
    
    if path.name.startswith('.'):
        return False
    
    if path.suffix.lower() not in {e.lower() for e in ALLOWED_DOCUMENT_EXTENSIONS}:
        return False
    
    return True

def _safe_source_name(folder: Path, source_path: Path) -> str:
    """
    Creates a safe source name that perserves subfolder structure.
    
    EX:
    C:/Docs/Aero/file.pdf inside folder C:/Docs
    becomes:
    Docs__Aero__file.pdf
    """
    folder_label = re.sub(r"[^A-za-z0-9._-]", "_", folder.name)

    try:
        rel = source_path.relative_to(folder)
    except ValueError:
        rel = Path(source_path.name)

    rel_text = "__".join(rel.parts)
    rel_text = re.sub(r"[^A-za-z0-9._-]", "_", rel_text)

    name = f"{folder_label}__{rel_text}"

    if name in {"", ".", ".."}:
        raise ValueError("Invalid synced filename")
    
    return name

def list_folders() -> List[str]:
    with _lock:
        data = _load_raw()
        return list(data.get("folders") or [])
    
def add_folder(path: str) -> Dict [str, Any]:
    folder = Path(path).expanduser().resolve()

    if not folder.exists():
        raise ValueError(f"Path does nt exist: {folder}")
    
    if not folder.is_dir():
        raise ValueError(f"Path is not a folder: {folder}")
    
    folder_str = str(folder)

    with _lock:
        data = _load_raw()
        folders = data.setdefault("folders", [])

        if folder_str not in folders:
            folders.append(folder_str)

        _save_raw(data)

    return {
        "status" : "ok",
        "folder" : folder_str,
    }
    
def remove_folder(path: str, remove_synced_documents: bool = False) -> Dict[str, Any]:
    folder = Path(path).expanduser().resolve()
    folder_str = str(folder)

    removed_sources = []

    with _lock:
        data = _load_raw()
        data["folders"] = [f for f in data.get("folders", []) if f != folder_str]

        if remove_synced_documents:
            files = data.get("files", {})
            for source_path, meta in list(files.items()):
                if meta.get("folder") == folder_str:
                    source_name = meta.get("source_name")
                    if source_name:
                        removed_sources.append(source_name)
                    files.pop(source_path, None)

        _save_raw(data)

    if remove_synced_documents:
        for source_name in removed_sources:
            db.delete_by_source(source_name)
            registry_remove_source(source_name)

            copied_file = UPLOAD_DIR / source_name
            if copied_file.exists():
                try:
                    os.remove(copied_file)
                except OSError:
                    pass

    return {
        "status": "ok",
        "removed_folder": folder_str,
        "removed_documents": removed_sources,
    }


def _sync_all_folders_unlocked() -> Dict[str, Any]:
    """
    Scan all registered folders.

    Added or changed files are copied into documents/ and embedded.
    Removed files are deleted from Chroma, the corpus registry, and documents/.
    """
    with _sync_lock:    
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        added = []
        updated = []
        removed = []
        skipped = []

        with _lock:
            data = _load_raw()
            folders = [Path(f).expanduser().resolve() for f in data.get("folders", [])]
            file_registry = data.setdefault("files", {})

        current_source_paths = set()

        for folder in folders:
            if not folder.exists() or not folder.is_dir():
                skipped.append({
                    "folder": str(folder),
                    "reason": "folder missing"
                })
                continue

            for source_path in folder.rglob("*"):
                if not _supported_file(source_path):
                    continue

                source_path = source_path.resolve()
                source_path_str = str(source_path)
                current_source_paths.add(source_path_str)

                stat = source_path.stat()
                mtime = stat.st_mtime
                size = stat.st_size

                previous = file_registry.get(source_path_str)
                source_name = previous.get("source_name") if previous else _safe_source_name(folder, source_path)
                destination = UPLOAD_DIR / source_name

                changed = (
                    previous is None
                    or previous.get("mtime") != mtime
                    or previous.get("size") != size
                    or not destination.exists()
                )

                if not changed:
                    continue

                if previous:
                    db.delete_by_source(source_name)
                    registry_remove_source(source_name)

                shutil.copy2(source_path, destination)
                embed_file(
                    file_path=destination,
                    source_name=source_name,
                    tags=["synced"]
                )

                file_registry[source_path_str] = {
                    "folder": str(folder),
                    "source_name": source_name,
                    "mtime": mtime,
                    "size": size,
                }

                if previous:
                    updated.append(source_name)
                else:
                    added.append(source_name)
        return _sync_all_folders_unlocked()
    registered_paths = set(file_registry.keys())
    missing_paths = registered_paths - current_source_paths

    for missing_path in missing_paths:
        meta = file_registry.get(missing_path) or {}
        source_name = meta.get("source_name")

        if not source_name:
            file_registry.pop(missing_path, None)
            continue

        db.delete_by_source(source_name)
        registry_remove_source(source_name)

        copied_file = UPLOAD_DIR / source_name
        if copied_file.exists():
            try:
                os.remove(copied_file)
            except OSError:
                pass

        file_registry.pop(missing_path, None)
        removed.append(source_name)

    with _lock:
        data = _load_raw()
        data["files"] = file_registry
        _save_raw(data)

    return {
        "status": "ok",
        "added": added,
        "updated": updated,
        "removed": removed,
        "skipped": skipped,
    }

