from __future__ import annotations

import json
import os
import re
import shutil
import threading
from pathlib import Path
from typing import Any, Callable, Dict, List

from config import FOLDER_SYNC_REGISTRY_PATH, UPLOAD_DIR
from core.corpus_registry import remove_source as registry_remove_source
from core.rag.retriever import db, embed_file

registry_lock = threading.Lock()
sync_lock = threading.Lock()
FOLDER_SYNC_EXTENSIONS = {".pdf"}


def default_registry() -> Dict[str, Any]:
    return {"folders": [], "files": {}}


def load_raw() -> Dict[str, Any]:
    if not FOLDER_SYNC_REGISTRY_PATH.exists():
        return default_registry()

    try:
        raw = FOLDER_SYNC_REGISTRY_PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return default_registry()

    if not isinstance(data, dict):
        return default_registry()

    data.setdefault("folders", [])
    data.setdefault("files", {})
    return data


def save_raw(data: Dict[str, Any]) -> None:
    FOLDER_SYNC_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = FOLDER_SYNC_REGISTRY_PATH.with_suffix(
        FOLDER_SYNC_REGISTRY_PATH.suffix + ".tmp"
    )
    tmp_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    os.replace(tmp_path, FOLDER_SYNC_REGISTRY_PATH)


def supported_file(path: Path) -> bool:
    return (
        path.is_file()
        and not path.name.startswith(".")
        and path.suffix.lower() in FOLDER_SYNC_EXTENSIONS
    )

def folder_total_bytes(path: str) -> int:
    folder = Path(path).expanduser().resolve()

    if not folder.exists() or not folder.is_dir():
        return 0

    total = 0

    for file_path in folder.rglob("*"):
        if not supported_file(file_path):
            continue

        try:
            total += file_path.stat().st_size
        except OSError:
            pass

    return total

def safe_part(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", text)


def safe_source_name(source_path: Path) -> str:
    name = safe_part(source_path.name)
    if name in {"", ".", ".."}:
        raise ValueError("Invalid synced filename")
    return name


def unique_source_name(source_path: Path, reserved_sources: set[str]) -> str:
    name = safe_source_name(source_path)
    if name not in reserved_sources:
        return name

    parsed = Path(name)
    stem = parsed.stem or "document"
    suffix = parsed.suffix
    counter = 2
    while True:
        candidate = f"{stem}_{counter}{suffix}"
        if candidate not in reserved_sources:
            return candidate
        counter += 1


def remove_synced_source(source_name: str) -> None:
    db.delete_by_source(source_name)
    registry_remove_source(source_name)
    (UPLOAD_DIR / source_name).unlink(missing_ok=True)


def chroma_sources() -> set[str]:
    data = db.collection.get(include=["metadatas"])
    return {
        meta.get("source")
        for meta in data.get("metadatas", []) or []
        if meta.get("source")
    }


def source_has_segments(source_name: str) -> bool:
    data = db.collection.get(where={"source": source_name}, include=["metadatas"])
    return bool(data.get("ids"))


def list_folders() -> List[str]:
    with registry_lock:
        data = load_raw()
        return list(data.get("folders") or [])


def list_folder_groups() -> List[Dict[str, Any]]:
    with registry_lock:
        data = load_raw()
        folders = list(data.get("folders") or [])
        files = data.get("files") or {}

    # Maps each synced folder path to the source records copied from that folder.
    grouped: Dict[str, List[Dict[str, str]]] = {folder: [] for folder in folders}

    for source_path, meta in files.items():
        folder = meta.get("folder")
        source_name = meta.get("source_name")

        if not folder or not source_name:
            continue

        grouped.setdefault(folder, [])
        grouped[folder].append(
            {
                "source_path": source_path,
                "source_name": source_name,
            }
        )

    return [
        {
            "path": folder,
            "documents": sorted(
                grouped.get(folder, []), key=lambda item: item["source_name"].lower()
            ),
        }
        for folder in folders
    ]


def add_folder(path: str) -> Dict[str, Any]:
    folder = Path(path).expanduser().resolve()
    if not folder.exists():
        raise ValueError(f"Path does not exist: {folder}")
    if not folder.is_dir():
        raise ValueError(f"Path is not a folder: {folder}")

    folder_str = str(folder)
    with registry_lock:
        data = load_raw()
        folders = data.setdefault("folders", [])
        if folder_str not in folders:
            folders.append(folder_str)
        save_raw(data)

    return {"status": "ok", "folder": folder_str}


def remove_folder(path: str, remove_synced_documents: bool = False) -> Dict[str, Any]:
    folder_str = str(Path(path).expanduser().resolve())
    removed_sources: List[str] = []

    with sync_lock:
        with registry_lock:
            data = load_raw()
            data["folders"] = [f for f in data.get("folders", []) if f != folder_str]

            if remove_synced_documents:
                files = data.get("files", {})
                for source_path, meta in list(files.items()):
                    if meta.get("folder") == folder_str:
                        source_name = meta.get("source_name")
                        if source_name:
                            removed_sources.append(source_name)
                        files.pop(source_path, None)

            save_raw(data)

        for source_name in removed_sources:
            remove_synced_source(source_name)

    return {
        "status": "ok",
        "removed_folder": folder_str,
        "removed_documents": removed_sources,
    }


def empty_sync_result() -> Dict[str, Any]:
    return {
        "status": "ok",
        "added": [],
        "updated": [],
        "removed": [],
        "skipped": [],
    }


def merge_sync_result(target: Dict[str, Any], source: Dict[str, Any]) -> None:
    for key in ("added", "updated", "removed", "skipped"):
        target[key].extend(source.get(key) or [])


def sync_folder_into_registry(
    folder_str: str,
    file_registry: Dict[str, Any],
    existing_sources: set[str],
    progress_callback: Callable[[int, str], None] | None = None,
) -> Dict[str, Any]:
    result = empty_sync_result()
    folder = Path(folder_str).expanduser().resolve()
    if not folder.exists() or not folder.is_dir():
        result["skipped"].append({"folder": str(folder), "reason": "folder missing"})
        return result

    current_source_paths = set()

    for source_path in sorted(folder.rglob("*"), key=lambda p: str(p).lower()):
        if not supported_file(source_path):
            continue

        source_path = source_path.resolve()
        source_path_str = str(source_path)
        current_source_paths.add(source_path_str)

        previous = file_registry.get(source_path_str)
        previous_source_name = previous.get("source_name") if previous else None
        reserved_sources = set(existing_sources)
        if previous_source_name:
            reserved_sources.discard(previous_source_name)
        source_name = unique_source_name(source_path, reserved_sources)

        if previous:
            destination = (
                UPLOAD_DIR / previous_source_name if previous_source_name else None
            )

            if (
                previous_source_name == source_name
                and source_name in existing_sources
                and destination
                and destination.exists()
            ):
                continue
            if previous_source_name:
                remove_synced_source(previous_source_name)
                existing_sources.discard(previous_source_name)

            file_registry.pop(source_path_str, None)

        if not source_name:
            continue
        destination = UPLOAD_DIR / source_name
        file_size = 0
        embedded_bytes = 0

        try:
            if progress_callback:
                progress_callback(0, f"Copying {source_path.name}")
            shutil.copy2(source_path, destination)

            if progress_callback:
                progress_callback(0, f"Embedding {source_path.name}")

            file_size = source_path.stat().st_size

            def on_embed_progress(current: int, total: int, message: str) -> None:
                nonlocal embedded_bytes
                if not progress_callback:
                    return

                next_bytes = int(file_size * (current / max(total, 1)))
                delta_bytes = max(0, next_bytes - embedded_bytes)
                embedded_bytes = next_bytes
                progress_callback(delta_bytes, message)

            embed_file(
                file_path=destination,
                source_name=source_name,
                tags=["synced"],
                progress_callback=on_embed_progress,
            )

            if progress_callback:
                remaining_bytes = max(0, file_size - embedded_bytes)
                progress_callback(remaining_bytes, f"Embedded {source_path.name}")

        except Exception as e:
            result["skipped"].append({"file": str(source_path), "reason": str(e)})

            if progress_callback:
                try:
                    remaining_bytes = max(
                        0,
                        (file_size or source_path.stat().st_size) - embedded_bytes,
                    )
                    progress_callback(remaining_bytes, f"Skipped {source_path.name}")
                except OSError:
                    progress_callback(0, f"Skipped {source_path.name}")
            destination.unlink(missing_ok=True)
            continue

        if not source_has_segments(source_name):
            result["skipped"].append(
                {"file": str(source_path), "reason": "No text segments extracted from PDF"}
            )
            destination.unlink(missing_ok=True)
            continue

        file_registry[source_path_str] = {
            "folder": str(folder),
            "source_name": source_name,
        }
        result["added"].append(source_name)
        existing_sources.add(source_name)

    for source_path, meta in list(file_registry.items()):
        if meta.get("folder") != str(folder):
            continue
        if source_path in current_source_paths:
            continue

        source_name = meta.get("source_name")
        if source_name:
            remove_synced_source(source_name)
            result["removed"].append(source_name)
            existing_sources.discard(source_name)
        file_registry.pop(source_path, None)

    return result


def sync_folder(
    path: str,
    progress_callback: Callable[[int, str], None] | None = None,
) -> Dict[str, Any]:
    with sync_lock:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        with registry_lock:
            data = load_raw()
            file_registry = dict(data.get("files") or {})

        result = sync_folder_into_registry(
            path,
            file_registry,
            chroma_sources(),
            progress_callback=progress_callback,
        )

        with registry_lock:
            data = load_raw()
            data["files"] = file_registry
            save_raw(data)

        return result


def sync_all_folders() -> Dict[str, Any]:
    with sync_lock:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        with registry_lock:
            data = load_raw()
            folder_paths = list(data.get("folders") or [])
            file_registry = dict(data.get("files") or {})

        result = empty_sync_result()
        existing_sources = chroma_sources()
        for folder_str in folder_paths:
            merge_sync_result(
                result,
                sync_folder_into_registry(folder_str, file_registry, existing_sources),
            )

        with registry_lock:
            data = load_raw()
            data["files"] = file_registry
            save_raw(data)

        return result
