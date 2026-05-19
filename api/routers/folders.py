from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.folder_sync import (
    add_folder,
    list_folders,
    remove_folder,
    _sync_all_folders_unlocked,
)

from core.folder_watcher import (
    restart_folder_watcher,
    start_folder_watcher,
    stop_folder_watcher,
    watcher_status,
)

router = APIRouter(prefix="/folders", tags=["folders"])


class FolderBody(BaseModel):
    path: str


class RemoveFolderBody(BaseModel):
    path: str
    remove_synced_documents: bool = False


@router.get("")
def get_folders():
    return {
        "folders": list_folders()
    }


@router.post("/add")
def post_add_folder(body: FolderBody):
    try:
        result = add_folder(body.path)
        sync_result = _sync_all_folders_unlocked()
        watch_result = restart_folder_watcher()

        return {
            **result,
            "sync": sync_result,
            "watcher": watch_result,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/sync")
def post_sync_folders():
    try:
        return _sync_all_folders_unlocked()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/remove")
def delete_folder(body: RemoveFolderBody):
    try:
        result = remove_folder(
            body.path,
            remove_synced_documents=body.remove_synced_documents,
        )
        watch_result = restart_folder_watcher()

        return {
            **result,
            "watcher": watch_result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    
@router.get("/watch/status")
def get_watch_status():
    return watcher_status()


@router.post("/watch/start")
def post_watch_start():
    return start_folder_watcher()


@router.post("/watch/stop")
def post_watch_stop():
    return stop_folder_watcher()


@router.post("/watch/restart")
def post_watch_restart():
    return restart_folder_watcher()