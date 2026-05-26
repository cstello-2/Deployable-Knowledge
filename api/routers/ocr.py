from __future__ import annotations

from pathlib import Path
import shutil
import tempfile

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse

from core.ocr.rapidocr_service import ocr_pdf_with_rapidocr
from api.utils import sanitize_filename
from config import ALLOWED_DOCUMENT_EXTENSIONS


router = APIRouter(prefix="/ocr", tags=["ocr"])


@router.post("/rapidocr/pdf")
async def run_rapidocr_pdf(
    file: UploadFile = File(...),
    dpi: int = Query(150, ge=72, le=300),
    min_confidence: float = Query(0.50, ge=0.0, le=1.0),
):
    """
    Run RapidOCR on an uploaded PDF.

    This endpoint intentionally does NOT embed the OCR output.
    It returns structured OCR text so the ingestion/embedding pipeline
    can connect to it later.
    """
    try:
        safe_name = sanitize_filename(file.filename, ALLOWED_DOCUMENT_EXTENSIONS)

        if not safe_name.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="RapidOCR route only supports PDF files.")

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir) / safe_name

            with open(temp_path, "wb") as f:
                shutil.copyfileobj(file.file, f)

            result = ocr_pdf_with_rapidocr(
                pdf_path=temp_path,
                dpi=dpi,
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