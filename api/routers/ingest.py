import logging
import os
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, BackgroundTasks, HTTPException, Form, File
from fastapi.responses import JSONResponse
from typing import List
from pydantic import BaseModel

from core.rag.retriever import db, embed_directory, embed_file
from core.corpus_registry import remove_source as registry_remove_source
from core.folder_sync import forget_synced_source
from core.rag.chunking import parse_pdf
from api.utils import sanitize_filename
from config import UPLOAD_DIR, PDF_DIR, ALLOWED_DOCUMENT_EXTENSIONS
from core.progress import create_job, fail_job, finish_job, update_job

router = APIRouter()
_log = logging.getLogger(__name__)

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PDF_DIR.mkdir(parents=True, exist_ok=True)


class LocalFileUploadBody(BaseModel):
    path: str


def _resolve_picker_file(path: str) -> Path:
    root = (Path.home() / "Documents" / "DeployableKnowledge").resolve()
    source = Path(path).expanduser().resolve()
    if source != root and root not in source.parents:
        raise HTTPException(status_code=400, detail="File path is outside the picker root.")
    if not source.exists():
        raise HTTPException(status_code=404, detail="File not found.")
    if not source.is_file():
        raise HTTPException(status_code=400, detail="Selected path is not a file.")
    sanitize_filename(source.name, {".pdf"})
    return source


@router.post("/upload/start")
async def start_upload_job():
    job_id = create_job("Uploading")

    update_job(
        job_id,
        label="Uploading",
        phase="upload",
        current=0,
        total=0,
        message="Preparing upload...",
    )

    return {
        "status": "started",
        "job_id": job_id,
    }


@router.post("/upload-local/start")
async def start_local_file_upload(body: LocalFileUploadBody, background_tasks: BackgroundTasks):
    source = _resolve_picker_file(body.path)
    safe_name = sanitize_filename(source.name, {".pdf"})
    destination = UPLOAD_DIR / safe_name
    file_size = source.stat().st_size
    job_id = create_job("Embedding")

    update_job(
        job_id,
        label="Embedding",
        phase="embedding",
        current=0,
        total=file_size,
        message=f"Preparing {safe_name}",
    )

    def run_embedding_job():
        try:
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)

            update_job(
                job_id,
                label="Embedding",
                phase="embedding",
                current=0,
                total=file_size,
                message=f"Embedding {safe_name}",
            )

            def on_embed_progress(current: int, total: int, message: str):
                fraction = current / max(total, 1)
                update_job(
                    job_id,
                    label="Embedding",
                    phase="embedding",
                    current=int(file_size * fraction),
                    total=file_size,
                    message=message,
                )

            embed_file(
                file_path=destination,
                source_name=safe_name,
                tags=["uploaded"],
                progress_callback=on_embed_progress,
            )
            result = {"uploads": [{"filename": safe_name, "status": "success"}]}
            update_job(
                job_id,
                label="Complete",
                phase="complete",
                current=file_size,
                total=file_size,
                message="Embedding complete.",
            )
            finish_job(job_id, result)
        except Exception as e:
            fail_job(job_id, str(e))

    background_tasks.add_task(run_embedding_job)

    return {
        "status": "started",
        "job_id": job_id,
    }


@router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    """Persist and embed uploaded documents.

    Parameters
    ----------
    files:
        One or more files supplied via multipart upload.

    Returns
    -------
    JSONResponse
        Status information for each uploaded file.
    """
    results = []
    for file in files:
        try:
            safe_name = sanitize_filename(file.filename, ALLOWED_DOCUMENT_EXTENSIONS)
            destination = UPLOAD_DIR / safe_name
            with open(destination, "wb") as f:
                f.write(await file.read())
            embed_file(file_path=destination, source_name=safe_name, tags=["uploaded"])
            results.append({"filename": safe_name, "status": "success"})
        except Exception as e:
            results.append({"filename": file.filename, "status": "error", "message": str(e)})
    return JSONResponse({"uploads": results})

@router.post("/remove")
async def remove_document(source: str = Form(...)):
    """Remove a document and its embeddings from the store."""
    try:
        safe_name = sanitize_filename(source)

        # If this document came from a synced folder, remember that the user
        # manually removed it so the folder watcher does not re-add it later.
        forget_info = forget_synced_source(safe_name, mark_ignored=True)

        db.delete_by_source(safe_name)
        registry_remove_source(safe_name)

        file_path = UPLOAD_DIR / safe_name
        if file_path.exists():
            os.remove(file_path)

        return JSONResponse(
            {
                "status": "success",
                "message": f"{safe_name} removed.",
                "folder_sync": forget_info,
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ingest")
async def ingest_documents(background_tasks: BackgroundTasks):
    """Parse any PDFs in :data:`PDF_DIR` and schedule embedding."""
    pdf_dir = PDF_DIR.resolve()
    txt_dir = UPLOAD_DIR.resolve()
    for pdf_file in pdf_dir.glob("*.pdf"):
        txt_file = txt_dir / f"{pdf_file.stem}.txt"
        try:
            parsed = parse_pdf(str(pdf_file))
            if isinstance(parsed, list):
                parsed_text = "\n\n".join([p.get("text", "") for p in parsed])
            else:
                parsed_text = parsed
            txt_file.write_text(parsed_text, encoding="utf-8")
        except Exception as e:
            _log.warning("Failed to parse %s: %s", pdf_file.name, e)
    background_tasks.add_task(
        embed_directory,
        data_dir=str(txt_dir),
        clear_collection=False,
        default_tags=["auto_ingested"],
    )
    return {"status": "started", "message": "Parsed PDFs and scheduled ingestion."}


# @router.post("/clear_db")
# async def clear_db(): #TAG NOT USED
#     """Delete all vectors from the backing ChromaDB collection."""
#     try:
#         db.clear_collection()
#         return JSONResponse({"status": "success", "message": "ChromaDB collection cleared."})
#     except Exception as e:
#         return JSONResponse({"status": "error", "message": str(e)})
