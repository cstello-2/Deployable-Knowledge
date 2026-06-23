from __future__ import annotations

import re
import shutil
import threading
from pathlib import Path
from typing import Any, Callable, Dict, List

from sqlmodel import Session, select

from config import UPLOAD_DIR
from core.corpus_registry import remove_source as registry_remove_source
from core.database import engine
from core.database.models import IgnoredSyncedFile, SyncedFile, SyncedFolder
from core.rag.retriever import db, embed_file

registry_lock = threading.Lock()
sync_lock = threading.Lock()
FOLDER_SYNC_EXTENSIONS = {".pdf"}


def default_registry() -> Dict[str, Any]:
    return {"folders": [], "files": {}, "ignored_files": {}}


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def load_raw() -> Dict[str, Any]:
    with Session(engine) as session:
        folders = session.exec(
            select(SyncedFolder).order_by(SyncedFolder.position, SyncedFolder.path)
        ).all()
        files = session.exec(select(SyncedFile).order_by(SyncedFile.source_path)).all()
        ignored_files = session.exec(
            select(IgnoredSyncedFile).order_by(IgnoredSyncedFile.source_path)
        ).all()

        return {
            "folders": [row.path for row in folders],
            "files": {
                row.source_path: {
                    "folder": row.folder,
                    "source_name": row.source_name,
                    "has_segments": row.has_segments,
                    "mtime_ns": row.mtime_ns,
                    "size": row.size,
                }
                for row in files
            },
            "ignored_files": {
                row.source_path: {
                    "folder": row.folder,
                    "source_name": row.source_name,
                    "reason": row.reason,
                }
                for row in ignored_files
            },
        }


def save_raw(data: Dict[str, Any]) -> None:
    folders = data.get("folders") or []
    files = data.get("files") or {}
    ignored_files = data.get("ignored_files") or {}

    with Session(engine) as session:
        for row in session.exec(select(IgnoredSyncedFile)).all():
            session.delete(row)
        for row in session.exec(select(SyncedFile)).all():
            session.delete(row)
        for row in session.exec(select(SyncedFolder)).all():
            session.delete(row)
        session.flush()

        seen_folders: set[str] = set()
        for position, folder in enumerate(folders):
            folder = str(folder)
            if not folder or folder in seen_folders:
                continue
            seen_folders.add(folder)
            session.add(SyncedFolder(path=folder, position=position))

        for source_path, meta in files.items():
            if not isinstance(meta, dict):
                continue
            source_path = str(source_path)
            source_name = meta.get("source_name")
            folder = meta.get("folder")
            if not source_path or not source_name or not folder:
                continue

            session.add(
                SyncedFile(
                    source_path=source_path,
                    folder=str(folder),
                    source_name=str(source_name),
                    has_segments=bool(meta.get("has_segments", True)),
                    mtime_ns=_optional_int(meta.get("mtime_ns")),
                    size=_optional_int(meta.get("size")),
                )
            )

        for source_path, meta in ignored_files.items():
            if not isinstance(meta, dict):
                continue
            source_path = str(source_path)
            if not source_path:
                continue

            session.add(
                IgnoredSyncedFile(
                    source_path=source_path,
                    folder=meta.get("folder"),
                    source_name=meta.get("source_name"),
                    reason=str(meta.get("reason") or ""),
                )
            )

        session.commit()


def supported_file(path: Path) -> bool:
    return (
        path.is_file()
        and not path.name.startswith(".")
        and path.suffix.lower() in FOLDER_SYNC_EXTENSIONS
    )


def folder_total_bytes(path: str) -> int:
    """
    Return the total byte size of supported files in a folder.

    This is used by the loading bar so folder sync progress is based on the
    actual synced document size rather than fake 0B/100B values.
    """
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


def file_signature(path: Path) -> Dict[str, int]:
    """
    Return a cheap signature for detecting whether a synced file changed.

    st_mtime_ns tracks the file's last modification time.
    st_size catches cases where the content size changed.
    """
    stat = path.stat()
    return {
        "mtime_ns": stat.st_mtime_ns,
        "size": stat.st_size,
    }


def signatures_match(previous: Dict[str, Any], current: Dict[str, int]) -> bool:
    return previous.get("mtime_ns") == current.get("mtime_ns") and previous.get(
        "size"
    ) == current.get("size")


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


def forget_synced_source(source_name: str, mark_ignored: bool = True) -> Dict[str, Any]:
    """
    Used when a synced document is manually removed from the document library.

    This removes the synced-file registry entry and optionally marks the original
    folder file as ignored so the watcher does not immediately re-add it.
    """
    ignored_paths: List[str] = []

    with registry_lock:
        data = load_raw()
        files = data.setdefault("files", {})
        ignored_files = data.setdefault("ignored_files", {})

        for source_path, meta in list(files.items()):
            if meta.get("source_name") != source_name:
                continue

            if mark_ignored:
                ignored_files[source_path] = {
                    "folder": meta.get("folder"),
                    "source_name": source_name,
                    "reason": "manually_removed_from_library",
                }
                ignored_paths.append(source_path)

            files.pop(source_path, None)

        save_raw(data)

    return {
        "source_name": source_name,
        "ignored_paths": ignored_paths,
    }


def chroma_sources() -> set[str]:
    data = db.collection.get(include=["metadatas"])
    return {meta.get("source") for meta in data.get("metadatas", []) or [] if meta.get("source")}


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

    grouped: Dict[str, List[Dict[str, Any]]] = {folder: [] for folder in folders}

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
                "has_segments": bool(meta.get("has_segments", True)),
                "mtime_ns": meta.get("mtime_ns"),
                "size": meta.get("size"),
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

    with registry_lock:
        data = load_raw()
        data["folders"] = [f for f in data.get("folders", []) if f != folder_str]

        files = data.setdefault("files", {})
        ignored_files = data.setdefault("ignored_files", {})

        for source_path, meta in list(ignored_files.items()):
            if meta.get("folder") == folder_str:
                ignored_files.pop(source_path, None)

        if remove_synced_documents:
            for source_path, meta in list(files.items()):
                if meta.get("folder") != folder_str:
                    continue

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


def _embed_file_with_optional_progress(
    *,
    file_path: Path,
    source_name: str,
    tags: List[str],
    progress_callback: Callable[[int, int, str], None] | None = None,
) -> None:
    """
    Call embed_file with progress_callback when retriever.py supports it.

    This keeps folder_sync compatible with older embed_file versions while also
    supporting the loading bar version that accepts progress_callback.
    """
    if progress_callback is None:
        embed_file(file_path=file_path, source_name=source_name, tags=tags)
        return

    try:
        embed_file(
            file_path=file_path,
            source_name=source_name,
            tags=tags,
            progress_callback=progress_callback,
        )
    except TypeError as e:
        if "progress_callback" not in str(e):
            raise

        embed_file(file_path=file_path, source_name=source_name, tags=tags)


def sync_folder_into_registry(
    folder_str: str,
    file_registry: Dict[str, Any],
    existing_sources: set[str],
    ignored_files: Dict[str, Any] | None = None,
    progress_callback: Callable[[int, str], None] | None = None,
) -> Dict[str, Any]:
    result = empty_sync_result()
    folder = Path(folder_str).expanduser().resolve()
    folder_str = str(folder)
    ignored_files = ignored_files or {}

    if not folder.exists() or not folder.is_dir():
        result["skipped"].append({"folder": folder_str, "reason": "folder missing"})
        return result

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    current_source_paths = set()

    for source_path in sorted(folder.rglob("*"), key=lambda p: str(p).lower()):
        if not supported_file(source_path):
            continue

        try:
            source_path = source_path.resolve()
            current_signature = file_signature(source_path)
        except OSError as e:
            result["skipped"].append({"file": str(source_path), "reason": str(e)})
            continue

        source_path_str = str(source_path)
        current_source_paths.add(source_path_str)
        file_size = int(current_signature.get("size") or 0)

        if source_path_str in ignored_files:
            if progress_callback:
                progress_callback(file_size, f"Ignored {source_path.name}")
            continue

        previous = file_registry.get(source_path_str)
        previous_source_name = previous.get("source_name") if previous else None
        was_update = previous is not None

        reserved_sources = set(existing_sources)
        if previous_source_name:
            reserved_sources.discard(previous_source_name)

        source_name = unique_source_name(source_path, reserved_sources)

        if previous:
            destination = UPLOAD_DIR / previous_source_name if previous_source_name else None

            file_is_unchanged = (
                previous_source_name == source_name
                and source_name in existing_sources
                and destination is not None
                and destination.exists()
                and signatures_match(previous, current_signature)
            )

            if file_is_unchanged:
                if progress_callback:
                    progress_callback(file_size, f"Skipped unchanged {source_path.name}")
                continue

            if previous_source_name:
                remove_synced_source(previous_source_name)
                existing_sources.discard(previous_source_name)

            file_registry.pop(source_path_str, None)

        if not source_name:
            if progress_callback:
                progress_callback(file_size, f"Skipped {source_path.name}")
            continue

        destination = UPLOAD_DIR / source_name
        embedded_bytes = 0

        try:
            if progress_callback:
                progress_callback(0, f"Copying {source_path.name}")

            shutil.copy2(source_path, destination)

            if progress_callback:
                progress_callback(0, f"Embedding {source_path.name}")

            def on_embed_progress(
                current: int,
                total: int,
                message: str,
                current_file_size: int = file_size,
            ) -> None:
                nonlocal embedded_bytes

                if not progress_callback:
                    return

                next_bytes = int(current_file_size * (current / max(total, 1)))
                delta_bytes = max(0, next_bytes - embedded_bytes)
                embedded_bytes = next_bytes

                if delta_bytes or message:
                    progress_callback(delta_bytes, message)

            _embed_file_with_optional_progress(
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
                remaining_bytes = max(0, file_size - embedded_bytes)
                progress_callback(remaining_bytes, f"Skipped {source_path.name}")

            destination.unlink(missing_ok=True)
            continue

        has_segments = source_has_segments(source_name)

        if not has_segments:
            result["skipped"].append(
                {
                    "file": str(source_path),
                    "source_name": source_name,
                    "reason": "No text segments extracted from PDF; file was still registered.",
                }
            )

        file_registry[source_path_str] = {
            "folder": folder_str,
            "source_name": source_name,
            "has_segments": has_segments,
            **current_signature,
        }

        if was_update:
            result["updated"].append(source_name)
        else:
            result["added"].append(source_name)

        existing_sources.add(source_name)

    for source_path, meta in list(file_registry.items()):
        if meta.get("folder") != folder_str:
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
    restore_ignored: bool = False,
    progress_callback: Callable[[int, str], None] | None = None,
) -> Dict[str, Any]:
    folder_str = str(Path(path).expanduser().resolve())

    if restore_ignored:
        clear_ignored_files_for_folder(folder_str)

    with sync_lock:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        with registry_lock:
            data = load_raw()
            file_registry = dict(data.get("files") or {})
            ignored_files = dict(data.get("ignored_files") or {})

        result = sync_folder_into_registry(
            folder_str,
            file_registry,
            chroma_sources(),
            ignored_files=ignored_files,
            progress_callback=progress_callback,
        )

        with registry_lock:
            data = load_raw()
            data["files"] = file_registry
            save_raw(data)

        return result


def sync_all_folders(
    progress_callback: Callable[[int, str], None] | None = None,
) -> Dict[str, Any]:
    with sync_lock:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

        with registry_lock:
            data = load_raw()
            folder_paths = list(data.get("folders") or [])
            file_registry = dict(data.get("files") or {})
            ignored_files = dict(data.get("ignored_files") or {})

        result = empty_sync_result()
        existing_sources = chroma_sources()

        for folder_str in folder_paths:
            merge_sync_result(
                result,
                sync_folder_into_registry(
                    folder_str,
                    file_registry,
                    existing_sources,
                    ignored_files=ignored_files,
                    progress_callback=progress_callback,
                ),
            )

        with registry_lock:
            data = load_raw()
            data["files"] = file_registry
            save_raw(data)

        return result


def clear_ignored_files_for_folder(folder_str: str) -> Dict[str, Any]:
    """
    Clears ignored/tombstoned files for a folder.

    This is used when the user manually clicks sync on a folder and wants files
    from that folder to be eligible for syncing again.
    """
    folder_str = str(Path(folder_str).expanduser().resolve())
    restored_paths: List[str] = []

    with registry_lock:
        data = load_raw()
        ignored_files = data.setdefault("ignored_files", {})

        for source_path, meta in list(ignored_files.items()):
            if meta.get("folder") == folder_str:
                restored_paths.append(source_path)
                ignored_files.pop(source_path, None)

        save_raw(data)

    return {
        "folder": folder_str,
        "restored_paths": restored_paths,
        "restored_count": len(restored_paths),
    }
