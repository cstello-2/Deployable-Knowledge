from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional
import re

import fitz  # PyMuPDF
import numpy as np
from PIL import Image
from rapidocr import RapidOCR


_ocr_engine: Optional[RapidOCR] = None


def get_ocr_engine() -> RapidOCR:
    """Return the shared OCR engine."""
    global _ocr_engine

    if _ocr_engine is None:
        _ocr_engine = RapidOCR()

    return _ocr_engine


def _extract_text_lines(result: Any, min_confidence: float) -> List[Dict[str, Any]]:
    """Return text lines from an OCR result."""
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


def read_image_text(
    image_path: str | Path,
    min_confidence: float = 0.50,
) -> Dict[str, Any]:
    """Return OCR text and line metadata for an image."""
    image_path = Path(image_path)

    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    ocr = get_ocr_engine()

    img = Image.open(image_path).convert("RGB")
    img_np = np.array(img)

    result = ocr(img_np)
    lines = _extract_text_lines(result, min_confidence=min_confidence)

    text = "\n".join(line["text"] for line in lines if line.get("text"))

    return {
        "source": str(image_path),
        "engine": "rapidocr",
        "min_confidence": min_confidence,
        "text": text,
        "lines": lines,
    }


def clean_ocr_text(
    text: str,
) -> str:
    """Normalize OCR text for storage."""
    return " ".join(text.split())


def image_text_tag(
    image_path: str | Path,
    min_confidence: float = 0.50,
    min_chars: int = 10,
) -> str:
    """Return image OCR text in chunk format."""
    try:
        result = read_image_text(
            image_path=image_path,
            min_confidence=min_confidence,
        )

        summary = clean_ocr_text(
            result.get("text", ""),
        )

        if not summary:
            return ""
        if len(re.sub(r"\W+", "", summary)) < min_chars:
            return ""

        return f"[Image: {summary}]"

    except Exception as e:
        # Do not crash image extraction if OCR fails.
        return f"[Image: OCR unavailable: {e}]"


def read_pdf_image_text(
    pdf_path: str | Path,
    min_confidence: float = 0.50,
    min_width: int = 300,
    min_height: int = 300,
) -> Dict[str, Any]:
    """Return OCR text for images embedded in a PDF."""
    pdf_path = Path(pdf_path)

    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError(
            f"RapidOCR PDF route only supports PDFs, got: {pdf_path.suffix}"
        )

    doc = fitz.open(pdf_path)

    pages: List[Dict[str, Any]] = []

    try:
        for page_index in range(len(doc)):
            page = doc[page_index]
            image_results: List[Dict[str, Any]] = []

            for image_index, image_info in enumerate(
                page.get_images(full=True), start=1
            ):
                xref = image_info[0]
                pix = fitz.Pixmap(doc, xref)

                if pix.width < min_width or pix.height < min_height:
                    continue

                if pix.alpha or pix.n > 3:
                    pix = fitz.Pixmap(fitz.csRGB, pix)

                mode = "L" if pix.n == 1 else "RGB"
                img = Image.frombytes(
                    mode, [pix.width, pix.height], pix.samples
                ).convert("RGB")
                img_np = np.array(img)

                result = get_ocr_engine()(img_np)
                lines = _extract_text_lines(result, min_confidence=min_confidence)
                image_text = "\n".join(
                    line["text"] for line in lines if line.get("text")
                )

                image_results.append(
                    {
                        "image_index": image_index,
                        "text": image_text,
                        "lines": lines,
                        "width": pix.width,
                        "height": pix.height,
                    }
                )

            page_text = "\n\n".join(
                image["text"] for image in image_results if image.get("text")
            )

            pages.append(
                {
                    "page": page_index + 1,
                    "text": page_text,
                    "images": image_results,
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
        "min_confidence": min_confidence,
        "page_count": len(pages),
        "text": combined_text,
        "pages": pages,
    }
