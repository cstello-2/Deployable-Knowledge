from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from core.folder_sync import (
    add_folder,
    folder_total_bytes,
    list_folder_groups,
    list_folders,
    remove_folder,
    sync_folder,
)
from core.folder_watcher import restart_folder_watcher
from core.progress import create_job, fail_job, finish_job, update_job

router = APIRouter(prefix="/folders", tags=["folders"])


class FolderBody(BaseModel):
    path: str


class SyncFolderBody(BaseModel):
    path: str = ""


class StartSyncFolderBody(BaseModel):
    path: str = ""
    register_folder: bool = False


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

@router.post("/start-sync")
async def start_sync_folder(body: StartSyncFolderBody, background_tasks: BackgroundTasks):
    path = body.path.strip()

    if not path:
        raise HTTPException(status_code=400, detail="No folder path provided")

    total_bytes = await asyncio.to_thread(folder_total_bytes, path)
    job_id = create_job("Embedding")

    update_job(
        job_id,
        label="Embedding",
        phase="sync",
        current=0,
        total=total_bytes,
        message="Starting folder synchronization...",
    )

    async def run_job():
        completed = 0

        def on_progress(delta_bytes: int, message: str):
            nonlocal completed
            completed += max(0, delta_bytes)

            update_job(
                job_id,
                label="Embedding",
                phase="sync",
                current=completed,
                total=total_bytes,
                message=message,
            )

        try:
            result: dict[str, Any]

            if body.register_folder:
                add_result = await asyncio.to_thread(add_folder, path)
                sync_result = await asyncio.to_thread(
                    sync_folder,
                    add_result["folder"],
                    on_progress,
                )
                watch_result = await restart_folder_watcher()

                result = {
                    **add_result,
                    "sync": sync_result,
                    "watcher": watch_result,
                }
            else:
                result = await asyncio.to_thread(sync_folder, path, on_progress)

            update_job(
                job_id,
                phase="complete",
                current=total_bytes,
                total=total_bytes,
                message="Folder synchronization complete.",
            )
            finish_job(job_id, result)

        except Exception as e:
            fail_job(job_id, str(e))

    background_tasks.add_task(run_job)

    return {
        "status": "started",
        "job_id": job_id,
    }


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
