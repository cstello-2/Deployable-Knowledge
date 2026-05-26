from pathlib import Path
import json
import time
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


from core.ocr.rapidocr_service import ocr_pdf_with_rapidocr


TEST_MATERIAL_DIR = PROJECT_ROOT / "tests" / "test_material"
TEST_OUTPUT_DIR = PROJECT_ROOT / "tests" / "test_outputs"

PDF_PATH = TEST_MATERIAL_DIR / "nine_line.pdf"


def main() -> None:
    TEST_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not PDF_PATH.exists():
        raise FileNotFoundError(f"Test PDF not found: {PDF_PATH}")

    print(f"Testing RapidOCR service on: {PDF_PATH}")

    start = time.perf_counter()

    result = ocr_pdf_with_rapidocr(
        pdf_path=PDF_PATH,
        dpi=150,
        min_confidence=0.50,
    )

    elapsed = time.perf_counter() - start

    text_output_path = TEST_OUTPUT_DIR / "rapidocr_service_output.txt"
    json_output_path = TEST_OUTPUT_DIR / "rapidocr_service_output.json"

    text_output_path.write_text(result.get("text", ""), encoding="utf-8")

    json_output_path.write_text(
        json.dumps(result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print("\nRapidOCR service test complete.")
    print(f"Elapsed time: {elapsed:.2f} seconds")
    print(f"Engine: {result.get('engine')}")
    print(f"Page count: {result.get('page_count')}")
    print(f"Text length: {len(result.get('text', ''))}")
    print(f"Text output: {text_output_path}")
    print(f"JSON output: {json_output_path}")

    if not result.get("text", "").strip():
        print("\nWARNING: OCR completed, but no text was returned.")
    else:
        print("\nPreview:")
        print(result["text"][:1000])


if __name__ == "__main__":
    main()