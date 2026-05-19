from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from watchfiles import Change, watch

from config import ALLOWED_DOCUMENT_EXTENSIONS
from core.folder_sync import list_folders, _sync_all_folders_unlocked


_state_lock = threading.Lock()
_stop_event: Optional[threading.Event] = None
_thread: Optional[threading.Thread] = None
_last_sync_result: Optional[Dict[str, Any]] = None
_last_error: Optional[str] = None


def _is_supported_watch_path(path: str) -> bool:
    p = Path(path)

    if p.name.startswith("."):
        return False

    if p.name.startswith("~$"):
        return False

    if p.suffix.lower() not in {e.lower() for e in ALLOWED_DOCUMENT_EXTENSIONS}:
        return False

    return True


def _watch_filter(change: Change, path: str) -> bool:
    return _is_supported_watch_path(path)


def _existing_folders() -> List[str]:
    folders = []

    for folder in list_folders():
        p = Path(folder).expanduser().resolve()
        if p.exists() and p.is_dir():
            folders.append(str(p))

    return folders


def _watch_loop(stop_event: threading.Event) -> None:
    global _last_sync_result, _last_error

    while not stop_event.is_set():
        folders = _existing_folders()

        if not folders:
            stop_event.wait(2.0)
            continue

        try:
            for changes in watch(
                *folders,
                watch_filter=_watch_filter,
                debounce=2000,
                step=250,
                stop_event=stop_event,
                recursive=True,
                raise_interrupt=False,
            ):
                if stop_event.is_set():
                    break

                if not changes:
                    continue

                # Small extra delay helps avoid syncing files that are still copying.
                time.sleep(0.75)

                try:
                    _last_sync_result = sync_all_folders()
                    _last_error = None
                except Exception as e:
                    _last_error = str(e)

        except Exception as e:
            _last_error = str(e)
            stop_event.wait(2.0)


def start_folder_watcher() -> Dict[str, Any]:
    global _stop_event, _thread

    with _state_lock:
        if _thread is not None and _thread.is_alive():
            return watcher_status()

        _stop_event = threading.Event()
        _thread = threading.Thread(
            target=_watch_loop,
            args=(_stop_event,),
            name="folder-sync-watcher",
            daemon=True,
        )
        _thread.start()

    return watcher_status()


def stop_folder_watcher() -> Dict[str, Any]:
    global _stop_event, _thread

    with _state_lock:
        if _stop_event is not None:
            _stop_event.set()

        if _thread is not None and _thread.is_alive():
            _thread.join(timeout=5)

        _stop_event = None
        _thread = None

    return watcher_status()


def restart_folder_watcher() -> Dict[str, Any]:
    stop_folder_watcher()
    return start_folder_watcher()


def watcher_status() -> Dict[str, Any]:
    alive = _thread is not None and _thread.is_alive()

    return {
        "running": alive,
        "folders": _existing_folders(),
        "last_sync_result": _last_sync_result,
        "last_error": _last_error,
    }