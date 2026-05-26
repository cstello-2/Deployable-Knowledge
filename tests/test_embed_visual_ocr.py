from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


from core.rag.retriever import get_db, embed_file


TEST_PDF = PROJECT_ROOT / "tests" / "test_material" / "nine_line.pdf"


def main() -> None:
    if not TEST_PDF.exists():
        raise FileNotFoundError(f"Missing test PDF: {TEST_PDF}")

    source_name = "nine_line_visual_ocr_test.pdf"

    db = get_db()
    db.delete_by_source(source_name)

    print("Embedding test PDF with visual OCR enabled...")

    embed_file(
        file_path=TEST_PDF,
        source_name=source_name,
        tags=["test", "visual_ocr"],
        filter_chunks=False,
        include_visual_ocr=True,
    )

    results = db.collection.get(
        where={"source": source_name},
        include=["documents", "metadatas"],
    )

    docs = results.get("documents", [])
    metas = results.get("metadatas", [])

    print(f"Total stored segments: {len(docs)}")

    image_ocr_count = 0
    text_count = 0

    for doc, meta in zip(docs, metas):
        content_type = meta.get("content_type")

        if content_type == "image_ocr":
            image_ocr_count += 1
            print("\n===== IMAGE OCR SEGMENT =====")
            print(f"Page: {meta.get('page')}")
            print(f"Visual type: {meta.get('visual_type')}")
            print(f"Visual index: {meta.get('visual_index')}")
            print(doc[:1000])

        elif content_type == "text":
            text_count += 1

    print("\nSummary:")
    print(f"Text segments: {text_count}")
    print(f"Image OCR segments: {image_ocr_count}")

    if image_ocr_count == 0:
        print("WARNING: No image OCR segments were stored.")
    else:
        print("Success: image OCR was embedded as separate segments.")


if __name__ == "__main__":
    main()