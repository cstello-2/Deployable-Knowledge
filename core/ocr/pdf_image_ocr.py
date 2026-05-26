from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List
import tempfile

import fitz

from core.ocr.ocr_service import image_text_tag


def _save_pixmap_as_temp_png(pix, temp_dir: Path, name: str) -> Path:
    image_path = temp_dir / f"{name}.png"

    if pix.alpha:
        pix = fitz.Pixmap(fitz.csRGB, pix)

    pix.save(str(image_path))
    return image_path


def extract_pdf_image_segments(
    pdf_path: str | Path,
    min_confidence: float = 0.50,
    min_width: int = 300,
    min_height: int = 300,
) -> List[Dict[str, Any]]:
    """Return OCR chunks for images embedded in a PDF."""
    pdf_path = Path(pdf_path)

    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    segments: List[Dict[str, Any]] = []

    with fitz.open(pdf_path) as doc, tempfile.TemporaryDirectory() as temp_dir_name:
        temp_dir = Path(temp_dir_name)

        for page_index in range(len(doc)):
            page = doc[page_index]
            page_num = page_index + 1

            for image_index, image_info in enumerate(page.get_images(full=True), start=1):
                xref = image_info[0]

                try:
                    pix = fitz.Pixmap(doc, xref)

                    if pix.width < min_width or pix.height < min_height:
                        continue

                    image_path = _save_pixmap_as_temp_png(
                        pix=pix,
                        temp_dir=temp_dir,
                        name=f"{pdf_path.stem}_page_{page_num}_image_{image_index}",
                    )

                    tag = image_text_tag(
                        image_path=image_path,
                        min_confidence=min_confidence,
                    )

                    if tag:
                        segments.append(
                            {
                                "text": tag,
                                "page": page_num,
                                "content_type": "image_ocr",
                                "image_index": image_index,
                                "source_file": str(pdf_path),
                            }
                        )

                except Exception as e:
                    segments.append(
                        {
                            "text": f"[Image: OCR unavailable for embedded image {image_index}: {e}]",
                            "page": page_num,
                            "content_type": "image_ocr",
                            "image_index": image_index,
                            "source_file": str(pdf_path),
                        }
                    )

    return segments
