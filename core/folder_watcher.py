from __future__ import annotations

import asyncio
from contextlib import suppress
from pathlib import Path
from typing import Any, Dict, List, Optional

from watchfiles import Change, awatch

from core.folder_sync import list_folders, sync_all_folders

state_lock = asyncio.Lock()
watch_task: Optional[asyncio.Task] = None
last_sync_result: Optional[Dict[str, Any]] = None
last_error: Optional[str] = None
FOLDER_SYNC_EXTENSIONS = {".pdf"}


def is_supported_watch_path(path: str) -> bool:
    p = Path(path)
    return (
        not p.name.startswith(".")
        and not p.name.startswith("~$")
        and p.suffix.lower() in FOLDER_SYNC_EXTENSIONS
    )


def watch_filter(change: Change, path: str) -> bool:
    return is_supported_watch_path(path)


def existing_folders() -> List[str]:
    folders: List[str] = []
    for folder in list_folders():
        path = Path(folder).expanduser().resolve()
        if path.exists() and path.is_dir():
            folders.append(str(path))
    return folders


async def run_sync() -> None:
    global last_sync_result, last_error

    try:
        last_sync_result = await asyncio.to_thread(sync_all_folders)
        last_error = None
    except Exception as e:
        last_error = str(e)


async def watch_loop() -> None:
    global last_error

    while True:
        folders = existing_folders()
        if not folders:
            await asyncio.sleep(2.0)
            continue

        try:
            async for changes in awatch(
                *folders,
                watch_filter=watch_filter,
                debounce=2000,
                step=250,
                recursive=True,
                raise_interrupt=False,
            ):
                if changes:
                    await run_sync()

        except asyncio.CancelledError:
            raise
        except Exception as e:
            last_error = str(e)
            await asyncio.sleep(2.0)


async def start_folder_watcher() -> Dict[str, Any]:
    global watch_task

    async with state_lock:
        if watch_task is not None and not watch_task.done():
            return watcher_status()

        watch_task = asyncio.create_task(watch_loop(), name="folder-sync-watcher")

    return watcher_status()


async def stop_folder_watcher() -> Dict[str, Any]:
    global watch_task

    async with state_lock:
        task = watch_task
        if task is not None and not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        watch_task = None

    return watcher_status()


async def restart_folder_watcher() -> Dict[str, Any]:
    await stop_folder_watcher()
    return await start_folder_watcher()


def watcher_status() -> Dict[str, Any]:
    alive = watch_task is not None and not watch_task.done()
    return {
        "running": alive,
        "folders": existing_folders(),
        "last_sync_result": last_sync_result,
        "last_error": last_error,
    }
