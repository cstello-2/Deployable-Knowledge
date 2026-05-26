from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List
import tempfile

import fitz

from core.ocr.rapidocr_service import make_image_ocr_tag


def _save_pixmap_as_temp_png(pix, temp_dir: Path, name: str) -> Path:
    image_path = temp_dir / f"{name}.png"

    if pix.alpha:
        pix = fitz.Pixmap(fitz.csRGB, pix)

    pix.save(str(image_path))
    return image_path


def extract_pdf_visual_ocr_segments(
    pdf_path: str | Path,
    dpi: int = 150,
    min_confidence: float = 0.50,
    min_width: int = 80,
    min_height: int = 40,
) -> List[Dict[str, Any]]:
    """
    Extract OCR text from embedded images and drawing/page renders.

    Returns OCR as separate segment records.

    This does NOT embed anything by itself.
    The embedding layer decides what to do with these records.
    """
    pdf_path = Path(pdf_path)

    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    segments: List[Dict[str, Any]] = []

    with fitz.open(pdf_path) as doc, tempfile.TemporaryDirectory() as temp_dir_name:
        temp_dir = Path(temp_dir_name)

        for page_index in range(len(doc)):
            page = doc[page_index]
            page_num = page_index + 1

            # 1. Embedded raster images
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

                    tag = make_image_ocr_tag(
                        image_path=image_path,
                        min_confidence=min_confidence,
                    )

                    if tag:
                        segments.append(
                            {
                                "text": tag,
                                "page": page_num,
                                "content_type": "image_ocr",
                                "visual_type": "embedded_image",
                                "visual_index": image_index,
                                "source_file": str(pdf_path),
                            }
                        )

                except Exception as e:
                    segments.append(
                        {
                            "text": f"[Image<OCR unavailable for embedded image {image_index}: {e}>]",
                            "page": page_num,
                            "content_type": "image_ocr",
                            "visual_type": "embedded_image",
                            "visual_index": image_index,
                            "source_file": str(pdf_path),
                        }
                    )

            # 2. Drawing/vector fallback
            drawings = page.get_drawings()

            if drawings:
                try:
                    pix = page.get_pixmap(dpi=dpi)

                    image_path = _save_pixmap_as_temp_png(
                        pix=pix,
                        temp_dir=temp_dir,
                        name=f"{pdf_path.stem}_page_{page_num}_drawing_render",
                    )

                    tag = make_image_ocr_tag(
                        image_path=image_path,
                        min_confidence=min_confidence,
                    )

                    if tag:
                        segments.append(
                            {
                                "text": tag,
                                "page": page_num,
                                "content_type": "image_ocr",
                                "visual_type": "drawing_render",
                                "visual_index": 1,
                                "source_file": str(pdf_path),
                            }
                        )

                except Exception as e:
                    segments.append(
                        {
                            "text": f"[Image<OCR unavailable for drawings on page {page_num}: {e}>]",
                            "page": page_num,
                            "content_type": "image_ocr",
                            "visual_type": "drawing_render",
                            "visual_index": 1,
                            "source_file": str(pdf_path),
                        }
                    )

    return segments