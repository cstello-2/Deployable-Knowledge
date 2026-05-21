from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.folder_sync import (
    add_folder,
    list_folder_groups,
    list_folders,
    remove_folder,
    sync_folder,
)
from core.folder_watcher import restart_folder_watcher

router = APIRouter(prefix="/folders", tags=["folders"])


class FolderBody(BaseModel):
    path: str


class SyncFolderBody(BaseModel):
    path: str = ""


class RemoveFolderBody(BaseModel):
    path: str
    remove_synced_documents: bool = False


@router.get("")
def get_folders():
    return {
        "folders": list_folders(),
        "groups": list_folder_groups(),
    }


@router.post("/add")
async def post_add_folder(body: FolderBody):
    if not body.path.strip():
        raise HTTPException(status_code=400, detail="No folder path provided")

    try:
        result = await asyncio.to_thread(add_folder, body.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    sync_result = await asyncio.to_thread(sync_folder, result["folder"])
    watch_result = await restart_folder_watcher()
    return {
        **result,
        "sync": sync_result,
        "watcher": watch_result,
    }


@router.post("/sync")
async def post_sync_folders(body: SyncFolderBody):
    path = body.path.strip()
    if not path:
        raise HTTPException(status_code=400, detail="No folder path provided")
    return await asyncio.to_thread(sync_folder, path)


@router.delete("/remove")
async def delete_folder(body: RemoveFolderBody):
    result = await asyncio.to_thread(
        remove_folder,
        body.path,
        body.remove_synced_documents,
    )
    watch_result = await restart_folder_watcher()
    return {
        **result,
        "watcher": watch_result,
    }
