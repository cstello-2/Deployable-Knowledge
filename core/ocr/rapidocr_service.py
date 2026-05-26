from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

import fitz  # PyMuPDF
import numpy as np
from PIL import Image
from rapidocr import RapidOCR


_ocr_engine: Optional[RapidOCR] = None


def get_ocr_engine() -> RapidOCR:
    """
    Lazily load RapidOCR once and reuse it.

    This prevents the app from reinitializing the OCR engine every time
    a file is processed.
    """
    global _ocr_engine

    if _ocr_engine is None:
        _ocr_engine = RapidOCR()

    return _ocr_engine


def _extract_rapidocr_output(result: Any, min_confidence: float) -> List[Dict[str, Any]]:
    """
    Normalize RapidOCR 3.x output into a simple list of dictionaries.

    The app should not depend directly on RapidOCR's internal output shape.
    This keeps the OCR layer easier to connect to ingestion later.
    """
    lines: List[Dict[str, Any]] = []

    boxes = getattr(result, "boxes", None)
    texts = getattr(result, "txts", None)
    scores = getattr(result, "scores", None)

    if not texts:
        return lines

    for idx, text in enumerate(texts):
        score = scores[idx] if scores is not None and idx < len(scores) else None
        box = boxes[idx] if boxes is not None and idx < len(boxes) else None

        if score is not None and score < min_confidence:
            continue

        lines.append(
            {
                "text": str(text),
                "score": float(score) if score is not None else None,
                "box": box.tolist() if hasattr(box, "tolist") else box,
            }
        )

    return lines

def ocr_image_with_rapidocr(
    image_path: str | Path,
    min_confidence: float = 0.50,
) -> Dict[str, Any]:
    """
    Run RapidOCR on a single image file and return structured OCR output.

    This function does NOT embed anything.
    It only extracts OCR text and metadata so image/drawing extraction logic
    can attach OCR context later.
    """
    image_path = Path(image_path)

    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    ocr = get_ocr_engine()

    img = Image.open(image_path).convert("RGB")
    img_np = np.array(img)

    result = ocr(img_np)
    lines = _extract_rapidocr_output(result, min_confidence=min_confidence)

    text = "\n".join(line["text"] for line in lines if line.get("text"))

    return {
        "source": str(image_path),
        "engine": "rapidocr",
        "min_confidence": min_confidence,
        "text": text,
        "lines": lines,
    }


def summarize_ocr_text(
    text: str,
    max_chars: int = 500,
) -> str:
    """
    Clean and shorten OCR output so it can be safely attached to image/drawing output.
    """
    cleaned = " ".join(text.split())

    if not cleaned:
        return ""

    if len(cleaned) > max_chars:
        return cleaned[:max_chars].rstrip() + "..."

    return cleaned


def make_image_ocr_tag(
    image_path: str | Path,
    min_confidence: float = 0.50,
    max_chars: int = 500,
) -> str:
    """
    Return OCR output wrapped in the image OCR tag format.

    Example:
    [Image<TACTICAL COMBAT CASUALTY CARE HANDBOOK Appendix E ...>]

    If OCR fails or no text is found, this returns an empty string.
    """
    try:
        result = ocr_image_with_rapidocr(
            image_path=image_path,
            min_confidence=min_confidence,
        )

        summary = summarize_ocr_text(
            result.get("text", ""),
            max_chars=max_chars,
        )

        if not summary:
            return ""

        return f"[Image<{summary}>]"

    except Exception as e:
        # Do not crash image extraction if OCR fails.
        return f"[Image<OCR unavailable: {e}>]"
    
    
def ocr_pdf_with_rapidocr(
    pdf_path: str | Path,
    dpi: int = 150,
    min_confidence: float = 0.50,
) -> Dict[str, Any]:
    """
    Run OCR on a PDF and return structured OCR output.

    This function does NOT embed anything.
    It only extracts OCR text and metadata so another developer can later
    connect it to chunking/embedding.
    """
    pdf_path = Path(pdf_path)

    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError(f"RapidOCR PDF route only supports PDFs, got: {pdf_path.suffix}")

    ocr = get_ocr_engine()
    doc = fitz.open(pdf_path)

    pages: List[Dict[str, Any]] = []

    try:
        for page_index in range(len(doc)):
            page = doc[page_index]

            pix = page.get_pixmap(dpi=dpi)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img_np = np.array(img)

            result = ocr(img_np)
            lines = _extract_rapidocr_output(result, min_confidence=min_confidence)

            page_text = "\n".join(line["text"] for line in lines if line.get("text"))

            pages.append(
                {
                    "page": page_index + 1,
                    "text": page_text,
                    "lines": lines,
                    "dpi": dpi,
                    "min_confidence": min_confidence,
                }
            )
    finally:
        doc.close()

    combined_text = "\n\n".join(
        f"===== Page {page['page']} OCR Text =====\n{page['text']}"
        for page in pages
        if page.get("text")
    )

    return {
        "source": str(pdf_path),
        "engine": "rapidocr",
        "dpi": dpi,
        "min_confidence": min_confidence,
        "page_count": len(pages),
        "text": combined_text,
        "pages": pages,
    }