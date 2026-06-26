from __future__ import annotations
import json
import sys
from hashlib import sha256
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
REPO_ROOT = THIS_DIR.parent

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from chunking import pagerank_chunk_text, parse_pdf


PDF_PATH = Path(
    "/Users/matthewplambeck/Desktop/Deployable-Knowledge/documents/17-13-tactical-casualty-combat-care-handbook-v5-may-17-distro-a.pdf")
OUTPUT_PATH = Path("/Users/matthewplambeck/Desktop/Deployable-Knowledge/outputs-test/chunker-python.json")


def build_chunk_id(pdf_path: Path, page_index: int, chunk_index: int, content: str) -> str:
    return sha256(
        "\n".join([str(pdf_path), str(page_index), str(chunk_index), content]).encode("utf-8")
    ).hexdigest()


def main() -> int:
    pages = parse_pdf(PDF_PATH)
    exported: list[dict[str, object]] = []

    for page in pages:
        page_number = int(page["page"])
        page_text = str(page["text"]).strip()
        if not page_text:
            continue

        chunks = pagerank_chunk_text(page_text)
        for chunk_text, metadata in chunks:
            chunk_index = int(metadata["chunk_idx"])
            exported.append(
                {
                    "chunkId": build_chunk_id(PDF_PATH, page_number - 1, chunk_index, chunk_text),
                    "chunkIndex": chunk_index,
                    "pageIndex": page_number - 1,
                    "content": chunk_text,
                }
            )

    OUTPUT_PATH.write_text(json.dumps(exported, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH} with {len(exported)} chunks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
