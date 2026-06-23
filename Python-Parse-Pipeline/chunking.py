from pathlib import Path
import argparse
from collections import Counter
import contextlib
import csv
import io
import re


def extract_pdf_images(pdf_path, output_dir=None, print_to_console=True):
    """
    Extract embedded images from a PDF locally.

    This does not connect to any API.
    It can either:
    - print image information to the console
    - optionally save the extracted image files to a folder

    Args:
        pdf_path (str or Path): Path to the PDF file.
        output_dir (str or Path | None): Optional folder to save images.
        print_to_console (bool): Whether to print image info.

    Returns:
        List[Dict]: Information about extracted images.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise RuntimeError("PyMuPDF and its runtime libraries are required for image extraction.")

    pdf_path = Path(pdf_path)
    assert pdf_path.exists(), f"File does not exist: {pdf_path}"

    output_path = None
    if output_dir:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

    extracted_images = []

    with fitz.open(pdf_path) as doc:
        for page_index in range(len(doc)):
            page = doc[page_index]
            image_list = page.get_images(full=True)

            if print_to_console:
                print(f"\nPage {page_index + 1}: found {len(image_list)} embedded image(s)")

            for image_index, image_info in enumerate(image_list, start=1):
                xref = image_info[0]
                width = image_info[2]
                height = image_info[3]
                bits_per_component = image_info[4]
                colorspace = image_info[5]

                saved_file = None

                if output_path:
                    image_data = doc.extract_image(xref)
                    image_bytes = image_data["image"]
                    image_ext = image_data.get("ext", "png")

                    saved_file = output_path / (
                        f"{pdf_path.stem}_page_{page_index + 1:03d}_"
                        f"image_{image_index:03d}_xref_{xref}.{image_ext}"
                    )

                    with open(saved_file, "wb") as f:
                        f.write(image_bytes)

                image_record = {
                    "page": page_index + 1,
                    "image_index": image_index,
                    "xref": xref,
                    "width": width,
                    "height": height,
                    "bits_per_component": bits_per_component,
                    "colorspace": colorspace,
                    "saved_file": str(saved_file) if saved_file else None,
                }

                extracted_images.append(image_record)

                if print_to_console:
                    print(
                        f"  Image {image_index}: "
                        f"xref={xref}, "
                        f"size={width}x{height}, "
                        f"bpc={bits_per_component}, "
                        f"colorspace={colorspace}, "
                        f"saved={saved_file if saved_file else 'not saved'}"
                    )

    if print_to_console:
        print(f"\nDone. Total images found: {len(extracted_images)}")

    return extracted_images


def safe_sent_tokenize(text: str):
    """Lightweight sentence tokenizer based on punctuation."""

    return re.split(r"(?<=[.!?]) +", text.strip())


def pagerank_chunk_text(
    text: str,
    model=None,
    sim_threshold: float = 0.5,
    top_k: int = 5,
    expansion_threshold: float = 0.5,
):
    """Chunk text using PageRank to select representative sentences."""

    from sklearn.metrics.pairwise import cosine_similarity
    import networkx as nx
    import numpy as np
    try:
        from .embeddings import load_embedding_model
    except ImportError:
        from embeddings import load_embedding_model

    sentences = safe_sent_tokenize(text)
    model = model or load_embedding_model()
    embeddings = model.encode(sentences, convert_to_tensor=False)

    sentence_ranges = []
    offset = 0
    for sent in sentences:
        start = text.find(sent, offset)
        end = start + len(sent)
        sentence_ranges.append((start, end))
        offset = end

    G = nx.Graph()
    sim_matrix = cosine_similarity(embeddings)
    for i in range(len(sentences)):
        G.add_node(i)
    for i in range(len(sentences)):
        for j in range(i + 1, len(sentences)):
            sim = sim_matrix[i][j]
            if sim > sim_threshold:
                G.add_edge(i, j, weight=sim)

    pageranks = nx.pagerank(G, weight="weight")
    seed_indices = sorted(pageranks, key=pageranks.get, reverse=True)[:top_k]

    used = set()
    chunks = []
    chunk_idx = 0
    for idx in seed_indices:
        if idx in used:
            continue
        chunk = [idx]
        used.add(idx)

        i = idx - 1
        while (
            i >= 0
            and i not in used
            and cosine_similarity([embeddings[i]], [embeddings[chunk[0]]])[0][0]
            > expansion_threshold
        ):
            chunk.insert(0, i)
            used.add(i)
            i -= 1

        i = idx + 1
        while (
            i < len(sentences)
            and i not in used
            and cosine_similarity([embeddings[i]], [embeddings[chunk[-1]]])[0][0]
            > expansion_threshold
        ):
            chunk.append(i)
            used.add(i)
            i += 1

        chunk_text = " ".join(sentences[i] for i in chunk)
        start_char = sentence_ranges[chunk[0]][0]
        end_char = sentence_ranges[chunk[-1]][1]
        chunks.append(
            (
                chunk_text,
                {
                    "chunk_idx": chunk_idx,
                    "char_range": (start_char, end_char),
                    "num_sentences": len(chunk),
                },
            )
        )
        chunk_idx += 1

    return chunks


def remove_frequent_lines(pages, threshold=0.9):
    """
    Remove lines that appear in more than `threshold` proportion of pages.

    Args:
        pages (List[Dict]): List of dictionaries with page number and text content.
        threshold (float): Proportion of pages a line must appear in to be removed.

    Returns:
        List[Dict]: Filtered list of pages with common lines removed.
    """
    all_lines = [
        line.strip() for page in pages for line in page["text"].split("\n") if line.strip()
    ]
    line_counts = Counter(all_lines)
    total_pages = len(pages)
    common_lines = {line for line, count in line_counts.items() if count / total_pages > threshold}

    filtered_pages = []
    for page in pages:
        lines = page["text"].split("\n")
        filtered_lines = [line for line in lines if line.strip() not in common_lines]
        filtered_pages.append({"page": page["page"], "text": "\n".join(filtered_lines)})
    return filtered_pages


def serialize_table_rows(rows):
    """Serialize PyMuPDF table rows to CSV text."""

    if not rows:
        return ""

    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    for row in rows:
        writer.writerow(["" if cell is None else cell for cell in row])
    return output.getvalue().rstrip("\n")


def _table_marker(csv_data):
    return f"[Table: {csv_data}]"


def _rect_sort_key(rect):
    return (rect.y0, rect.x0)


def _rects_overlap(rect_a, rect_b):
    x_overlap = min(rect_a.x1, rect_b.x1) > max(rect_a.x0, rect_b.x0)
    y_overlap = min(rect_a.y1, rect_b.y1) > max(rect_a.y0, rect_b.y0)
    return x_overlap and y_overlap


def _is_rect_within_margins(
    rect, page, is_landscape, margin_top, margin_bottom, margin_left, margin_right
):
    page_rect = page.rect
    if is_landscape:
        return margin_left < rect.x0 < (page_rect.width - margin_right)
    return margin_top < rect.y0 < (page_rect.height - margin_bottom)


def _extract_tables_from_page(page, fitz_module):
    tables = []
    if not hasattr(page, "find_tables"):
        return tables

    with contextlib.redirect_stdout(io.StringIO()):
        finder = page.find_tables()
    for table_index, table in enumerate(getattr(finder, "tables", []) or [], start=1):
        csv_data = serialize_table_rows(table.extract())
        if not csv_data:
            continue
        tables.append(
            {
                "bbox": fitz_module.Rect(table.bbox),
                "text": _table_marker(csv_data),
            }
        )
    return tables


def _page_blocks(
    page, fitz_module, table_rects, margin_top, margin_bottom, margin_left, margin_right
):
    is_landscape = page.rect.width > page.rect.height or page.rotation in [90, 270]
    blocks = []
    for block in page.get_text("blocks") or []:
        if len(block) < 5:
            continue
        rect = fitz_module.Rect(block[:4])
        text = str(block[4]).strip()
        if not text:
            continue
        if not _is_rect_within_margins(
            rect,
            page,
            is_landscape,
            margin_top,
            margin_bottom,
            margin_left,
            margin_right,
        ):
            continue
        if any(_rects_overlap(rect, table_rect) for table_rect in table_rects):
            continue
        blocks.append({"bbox": rect, "text": text})
    return blocks


def _parse_pdf_document(doc, fitz_module, margin_top, margin_bottom, margin_left, margin_right):
    pages = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        tables = _extract_tables_from_page(page, fitz_module)
        table_rects = [table["bbox"] for table in tables]
        items = _page_blocks(
            page,
            fitz_module,
            table_rects,
            margin_top,
            margin_bottom,
            margin_left,
            margin_right,
        )
        items.extend(tables)
        items.sort(key=lambda item: _rect_sort_key(item["bbox"]))
        pages.append(
            {
                "page": page_idx + 1,
                "text": "\n".join(item["text"] for item in items),
            }
        )

    return pages


def parse_pdf(pdf_path, margin_top=50, margin_bottom=50, margin_left=50, margin_right=50):
    """
    Extracts clean text from a PDF, removing headers and footers based on layout.
    Adapts to portrait and landscape orientation by checking page rotation/shape.

    Args:
        pdf_path (str or Path): Path to the PDF file.
        margin_top (int): Top margin in points to ignore.
        margin_bottom (int): Bottom margin in points to ignore.
        margin_left (int): Left margin in points to ignore.
        margin_right (int): Right margin in points to ignore.

    Returns:
        List[Dict]: List of dictionaries with page number and cleaned text content.
        Each dictionary has keys "page" and "text".
    """
    pdf_path = Path(pdf_path)
    assert pdf_path.exists(), f"File does not exist: {pdf_path}"

    try:
        import fitz  # PyMuPDF
    except ImportError as exc:
        raise RuntimeError(
            "PyMuPDF and its runtime libraries are required for PDF extraction."
        ) from exc

    with fitz.open(pdf_path) as doc:
        all_cleaned_text = _parse_pdf_document(
            doc,
            fitz,
            margin_top,
            margin_bottom,
            margin_left,
            margin_right,
        )

    all_cleaned_text = remove_frequent_lines(all_cleaned_text)  # update this function if needed

    return all_cleaned_text


# Replace input_pdf and output_txt with desired file paths
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Extract clean text from a PDF, removing headers and footers."
    )
    parser.add_argument("input_pdf", type=str, help="Path to the input PDF file")
    parser.add_argument("output_txt", type=str, help="Path to the output text file")
    parser.add_argument(
        "--margin_top", type=int, default=50, help="Top margin in points (default: 50)"
    )
    parser.add_argument(
        "--margin_bottom", type=int, default=50, help="Bottom margin in points (default: 50)"
    )
    parser.add_argument(
        "--margin_left", type=int, default=50, help="Left margin in points (default: 50)"
    )
    parser.add_argument(
        "--margin_right", type=int, default=50, help="Right margin in points (default: 50)"
    )

    parser.add_argument(
        "--extract_images",
        action="store_true",
        help="Print embedded PDF image information to the console",
    )
    parser.add_argument(
        "--image_output_dir",
        type=str,
        default=None,
        help="Optional folder to save extracted images",
    )

    args = parser.parse_args()

    cleaned_text = parse_pdf(
        args.input_pdf,
        margin_top=args.margin_top,
        margin_bottom=args.margin_bottom,
        margin_left=args.margin_left,
        margin_right=args.margin_right,
    )

    output_path = Path(args.output_txt)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    full_text = "\n\n".join(page["text"] for page in cleaned_text)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(full_text)
    print(f"Extracted text saved to {output_path}")

    if args.extract_images:
        extract_pdf_images(args.input_pdf, output_dir=args.image_output_dir, print_to_console=True)
