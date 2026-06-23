from __future__ import annotations

from pathlib import Path
import shutil
import tempfile

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse

from core.ocr.ocr_service import read_pdf_image_text
from api.utils import sanitize_filename
from config import ALLOWED_DOCUMENT_EXTENSIONS

router = APIRouter(prefix="/ocr", tags=["ocr"])


@router.post("/pdf")
async def read_pdf_images(
    file: UploadFile = File(...),
    min_confidence: float = Query(0.50, ge=0.0, le=1.0),
):
    """
    Return OCR text from images embedded in an uploaded PDF.
    """
    try:
        safe_name = sanitize_filename(file.filename, ALLOWED_DOCUMENT_EXTENSIONS)

        if not safe_name.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="OCR route only supports PDF files.")

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir) / safe_name

            with open(temp_path, "wb") as f:
                shutil.copyfileobj(file.file, f)

            result = read_pdf_image_text(
                pdf_path=temp_path,
                min_confidence=min_confidence,
            )

        return JSONResponse(
            {
                "status": "success",
                "message": "OCR completed. No embeddings were created.",
                "ocr": result,
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
