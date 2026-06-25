// ----------------------------
// Typescript file for chunking extracted PDF/document text 
// In chunking.py, chunks are created via PageRank over embeded sentences in order to find important seed sentences
// This file utilizes a deterministic sentence window chunker for now (easier for testing)
// ARCHIVE FILE!!
// ----------------------------

// Imports
import { createHash } from "node:crypto"; 
//Used for creating deterministic indexes to be used as primary keys in SQL database.
// Also prevents duplicate ids if document is reuploaded. 
import type { Chunk as ExtractedChunk, ChunkType, Source } from "./text-extract";


//Chunk Metadata (Start & End charecters, word & sentence counts)
export type ChunkMetadata = {
  startChar: number;
  endChar: number;
  wordCount: number;
  sentenceCount: number;
};

// chunker.ts output. Stores each chunk as one retrival record. 
export type ChunkRecord = {
  chunkId: string;  
  chunkType: ChunkType;
  source: Source;
  pageIndex: number;
  chunkIndex: number; 
  content: string;
  metadata: ChunkMetadata;
};


// Optional rules for chunking. Can set min/max charecters per chunk, allowed sentence overlap, keep/remove repeated lines
export type ChunkerOptions = {
  maxChars?: number;
  minWords?: number;
  overlapSentences?: number;
  removeRepeatedLines?: boolean;
  repeatedLineThreshold?: number;
};

// Deterministic ChunkOptions default settings
//Kept simple for testing purposes 
const DEFAULT_OPTIONS: Required<ChunkerOptions> = {
  maxChars: 1200,
  minWords: 5,
  overlapSentences: 1,
  removeRepeatedLines: true,
  repeatedLineThreshold: 0.9,
};

type SentenceSpan = {
  text: string;
  start: number;
  end: number;};

// Normalize all line endings & repeated spaces 
function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();}

// Helper function to track word counts
function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

// Rollover from python pipeline to remove very small chunks
function shouldKeepChunk(text: string, minWords: number): boolean {
  return wordCount(text) >= minWords;
}

// Split a page into sentence like spans while keeping character offsets. Offsets used for start/end data. 
// WILL BE BROKEN BY SOMETHING LIKE "Dr. Evil" -> ["Dr.", "Evil"]
function splitSentencesWithOffsets(text: string): SentenceSpan[] {
  const trimmed = normalizeWhitespace(text);
  if (!trimmed) return [];

  const spans: SentenceSpan[] = [];
  const regex = /[^.!?]+(?:[.!?]+|$)/g;

  for (const match of trimmed.matchAll(regex)) {
    const raw = match[0];
    const start = match.index ?? -1;
    const leadingWhitespace = raw ? raw.length - raw.trimStart().length : 0;
    const trailingWhitespace = raw ? raw.length - raw.trimEnd().length : 0;
    const value = raw?.trim();
    const adjustedStart = start + leadingWhitespace;
    if (!value || start < 0) continue;

    spans.push({
      text: value,
      start: adjustedStart,
      end: start + raw.length - trailingWhitespace,
    });
  }

  return spans;
}

// Rollover typescript version of Python's remove_frequent_lines().
// Tries to remove repeated lines like headers or footers 
function removeFrequentLines(
  pages: ExtractedChunk[],
  threshold: number,
): ExtractedChunk[] {
  const textPages = pages.filter((page) => page.chunkType === "TEXT");
  if (textPages.length < 2) return pages;

  const lineCounts = new Map<string, number>();

  for (const page of textPages) {
    const uniqueLines = new Set(
      normalizeWhitespace(page.content)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );

    for (const line of uniqueLines) {
      lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
    }
  }

  const commonLines = new Set<string>();
  for (const [line, count] of lineCounts.entries()) {
    if (count / textPages.length > threshold) {
      commonLines.add(line);
    }
  }

  if (commonLines.size === 0) return pages;

  return pages.map((page) => {
    if (page.chunkType !== "TEXT") return page;

    const filtered = page.content
      .split("\n")
      .filter((line) => !commonLines.has(line.trim()))
      .join("\n");

    return {
      ...page,
      content: filtered,
    };
  });
}

// Used to create deterministic ids.
//  Needed if document is reprocessed and prevents duplicate chunks from occuring. 
function buildChunkId(
  source: Source,
  pageIndex: number,
  chunkIndex: number,
  chunkType: ChunkType,
  content: string,
): string {
  return createHash("sha256")
    .update(source.path)
    .update("\n")
    .update(String(pageIndex))
    .update("\n")
    .update(String(chunkIndex))
    .update("\n")
    .update(chunkType)
    .update("\n")
    .update(content)
    .digest("hex");
}


// Groups spans from splitSentencesWithOffsets() into bounded chunks with small sentence overlap.
//  Stops at charecter budget
function chunkSentenceSpans(
  page: ExtractedChunk,
  spans: SentenceSpan[],
  options: Required<ChunkerOptions>,
): ChunkRecord[] {
  const chunks: ChunkRecord[] = [];
  let index = 0;
  let cursor = 0;

  while (cursor < spans.length) {
    let end = cursor;
    let currentLength = 0;

    while (end < spans.length) {
      const candidateLength =
        spans[end].end - spans[cursor].start + (end > cursor ? 1 : 0);

      if (end > cursor && candidateLength > options.maxChars) {
        break;
      }

      currentLength = candidateLength;
      end += 1;

      if (currentLength >= options.maxChars) {
        break;
      }
    }

    const selected = spans.slice(cursor, end);
    if (selected.length === 0) {
      cursor += 1;
      continue;
    }

    const startChar = selected[0].start;
    const endChar = selected[selected.length - 1].end;
    const content = normalizeWhitespace(
      page.content.slice(startChar, endChar).replace(/\n+/g, " "),
    );

    if (shouldKeepChunk(content, options.minWords)) {
      chunks.push({
        chunkId: buildChunkId(
          page.source,
          Number(page.pageIndex),
          index,
          page.chunkType,
          content,
        ),
        chunkType: page.chunkType,
        source: page.source,
        pageIndex: Number(page.pageIndex),
        chunkIndex: index,
        content,
        metadata: {
          startChar,
          endChar,
          wordCount: wordCount(content),
          sentenceCount: selected.length,
        },
      });
      index += 1;
    }

    if (end >= spans.length) {
      break;
    }

    cursor = Math.max(end - options.overlapSentences, cursor + 1);
  }

  return chunks;
}

// Chunk one extracted page object.
// TEXT pages are sentence-window chunked. IMAGE/TABLE pages are kept as single
// chunks for now because they often already arrive as one coherent block.

//Funciton to turn extracted pages into chunks following the rules set above. 
// Keeps Images & Tables as existing.  

function chunkSinglePage(
  page: ExtractedChunk,
  options: Required<ChunkerOptions>,
): ChunkRecord[] {
  const content = normalizeWhitespace(page.content); //Clean page
  if (!content) return [];

  //Skip over IMAGES & TABLES, keeping them as is
    if (page.chunkType !== "TEXT") {
    return [
      {
        chunkId: buildChunkId(
          page.source,
          Number(page.pageIndex),
          0,
          page.chunkType,
          content,
        ),
        chunkType: page.chunkType,
        source: page.source,
        pageIndex: Number(page.pageIndex),
        chunkIndex: 0,
        content, //Actaual Chunk Text
        metadata: {
          startChar: 0,
          endChar: content.length,
          wordCount: wordCount(content),
          sentenceCount: 1,
        },
      },
    ];
  }

  const spans = splitSentencesWithOffsets(content);
  if (spans.length === 0) {
    return shouldKeepChunk(content, options.minWords)
      ? [
          {
            chunkId: buildChunkId(
              page.source,
              Number(page.pageIndex),
              0,
              page.chunkType,
              content,
            ),
            chunkType: page.chunkType,
            source: page.source,
            pageIndex: Number(page.pageIndex),
            chunkIndex: 0,
            content, //Actaual Chunk Text
            metadata: {
              startChar: 0,
              endChar: content.length,
              wordCount: wordCount(content),
              sentenceCount: 1,
            },
          },
        ]
      : [];
  }
  //Pass normalized text to sentence based chunking:
  return chunkSentenceSpans(
    {
      ...page,
      content,
    },
    spans,
    options,
  );}


// Main entry for parse_pipeline
//Input: page level extractions from text-extract.ts
//Output: retrieval ready chunk records with IDs and metadata attached
export function chunkPages(
  pages: ExtractedChunk[],
  options: ChunkerOptions = {},
): ChunkRecord[] {
  const resolved = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const preparedPages = resolved.removeRepeatedLines
    ? removeFrequentLines(pages, resolved.repeatedLineThreshold)
    : pages;

  return preparedPages.flatMap((page) => chunkSinglePage(page, resolved));
}

// def extract_pdf_images(pdf_path, output_dir=None, print_to_console=True):
//     """
//     Extract embedded images from a PDF locally.
//     """

// def safe_sent_tokenize(text: str):
//     """Lightweight sentence tokenizer based on punctuation."""
//     return re.split(r"(?<=[.!?]) +", text.strip())

// def pagerank_chunk_text(
//     text: str,
//     model=None,
//     sim_threshold: float = 0.5,
//     top_k: int = 5,
//     expansion_threshold: float = 0.5,
// ):
//     """Chunk text using PageRank to select representative sentences."""

//     from sklearn.metrics.pairwise import cosine_similarity
//     import networkx as nx
//     import numpy as np
//     from .embeddings import load_embedding_model

//     sentences = safe_sent_tokenize(text)
//     model = model or load_embedding_model()
//     embeddings = model.encode(sentences, convert_to_tensor=False)

//     sentence_ranges = []
//     offset = 0
//     for sent in sentences:
//         start = text.find(sent, offset)
//         end = start + len(sent)
//         sentence_ranges.append((start, end))
//         offset = end

//     G = nx.Graph()
//     sim_matrix = cosine_similarity(embeddings)
//     for i in range(len(sentences)):
//         G.add_node(i)
//     for i in range(len(sentences)):
//         for j in range(i + 1, len(sentences)):
//             sim = sim_matrix[i][j]
//             if sim > sim_threshold:
//                 G.add_edge(i, j, weight=sim)

//     pageranks = nx.pagerank(G, weight="weight")
//     seed_indices = sorted(pageranks, key=pageranks.get, reverse=True)[:top_k]

//     used = set()
//     chunks = []
//     chunk_idx = 0
//     for idx in seed_indices:
//         if idx in used:
//             continue
//         chunk = [idx]
//         used.add(idx)

//         i = idx - 1
//         while (
//             i >= 0
//             and i not in used
//             and cosine_similarity([embeddings[i]], [embeddings[chunk[0]]])[0][0]
//             > expansion_threshold
//         ):
//             chunk.insert(0, i)
//             used.add(i)
//             i -= 1

//         i = idx + 1
//         while (
//             i < len(sentences)
//             and i not in used
//             and cosine_similarity([embeddings[i]], [embeddings[chunk[-1]]])[0][0]
//             > expansion_threshold
//         ):
//             chunk.append(i)
//             used.add(i)
//             i += 1

//         chunk_text = " ".join(sentences[i] for i in chunk)
//         start_char = sentence_ranges[chunk[0]][0]
//         end_char = sentence_ranges[chunk[-1]][1]
//         chunks.append(
//             (
//                 chunk_text,
//                 {
//                     "chunk_idx": chunk_idx,
//                     "char_range": (start_char, end_char),
//                     "num_sentences": len(chunk),
//                 },
//             )
//         )
//         chunk_idx += 1

//     return chunks

// def remove_frequent_lines(pages, threshold=0.9):
//     """
//     Remove lines that appear in more than `threshold` proportion of pages.
//     """
//     all_lines = [
//         line.strip() for page in pages for line in page["text"].split("\n") if line.strip()
//     ]
//     line_counts = Counter(all_lines)
//     total_pages = len(pages)
//     common_lines = {line for line, count in line_counts.items() if count / total_pages > threshold}

//     filtered_pages = []
//     for page in pages:
//         lines = page["text"].split("\n")
//         filtered_lines = [line for line in lines if line.strip() not in common_lines]
//         filtered_pages.append({"page": page["page"], "text": "\n".join(filtered_lines)})
//     return filtered_pages

// Pyhton chunking.py file for reference


// from pathlib import Path
// import argparse
// from collections import Counter
// import contextlib
// import csv
// import io
// import re


// def extract_pdf_images(pdf_path, output_dir=None, print_to_console=True):
//     """
//     Extract embedded images from a PDF locally.

//     This does not connect to any API.
//     It can either:
//     - print image information to the console
//     - optionally save the extracted image files to a folder

//     Args:
//         pdf_path (str or Path): Path to the PDF file.
//         output_dir (str or Path | None): Optional folder to save images.
//         print_to_console (bool): Whether to print image info.

//     Returns:
//         List[Dict]: Information about extracted images.
//     """
//     try:
//         import fitz  # PyMuPDF
//     except ImportError:
//         raise RuntimeError("PyMuPDF and its runtime libraries are required for image extraction.")

//     pdf_path = Path(pdf_path)
//     assert pdf_path.exists(), f"File does not exist: {pdf_path}"

//     output_path = None
//     if output_dir:
//         output_path = Path(output_dir)
//         output_path.mkdir(parents=True, exist_ok=True)

//     extracted_images = []

//     with fitz.open(pdf_path) as doc:
//         for page_index in range(len(doc)):
//             page = doc[page_index]
//             image_list = page.get_images(full=True)

//             if print_to_console:
//                 print(f"\nPage {page_index + 1}: found {len(image_list)} embedded image(s)")

//             for image_index, image_info in enumerate(image_list, start=1):
//                 xref = image_info[0]
//                 width = image_info[2]
//                 height = image_info[3]
//                 bits_per_component = image_info[4]
//                 colorspace = image_info[5]

//                 saved_file = None

//                 if output_path:
//                     image_data = doc.extract_image(xref)
//                     image_bytes = image_data["image"]
//                     image_ext = image_data.get("ext", "png")

//                     saved_file = output_path / (
//                         f"{pdf_path.stem}_page_{page_index + 1:03d}_"
//                         f"image_{image_index:03d}_xref_{xref}.{image_ext}"
//                     )

//                     with open(saved_file, "wb") as f:
//                         f.write(image_bytes)

//                 image_record = {
//                     "page": page_index + 1,
//                     "image_index": image_index,
//                     "xref": xref,
//                     "width": width,
//                     "height": height,
//                     "bits_per_component": bits_per_component,
//                     "colorspace": colorspace,
//                     "saved_file": str(saved_file) if saved_file else None,
//                 }

//                 extracted_images.append(image_record)

//                 if print_to_console:
//                     print(
//                         f"  Image {image_index}: "
//                         f"xref={xref}, "
//                         f"size={width}x{height}, "
//                         f"bpc={bits_per_component}, "
//                         f"colorspace={colorspace}, "
//                         f"saved={saved_file if saved_file else 'not saved'}"
//                     )

//     if print_to_console:
//         print(f"\nDone. Total images found: {len(extracted_images)}")

//     return extracted_images


// def safe_sent_tokenize(text: str):
//     """Lightweight sentence tokenizer based on punctuation."""

//     return re.split(r"(?<=[.!?]) +", text.strip())


// def pagerank_chunk_text(
//     text: str,
//     model=None,
//     sim_threshold: float = 0.5,
//     top_k: int = 5,
//     expansion_threshold: float = 0.5,
// ):
//     """Chunk text using PageRank to select representative sentences."""

//     from sklearn.metrics.pairwise import cosine_similarity
//     import networkx as nx
//     import numpy as np
//     from .embeddings import load_embedding_model

//     sentences = safe_sent_tokenize(text)
//     model = model or load_embedding_model()
//     embeddings = model.encode(sentences, convert_to_tensor=False)

//     sentence_ranges = []
//     offset = 0
//     for sent in sentences:
//         start = text.find(sent, offset)
//         end = start + len(sent)
//         sentence_ranges.append((start, end))
//         offset = end

//     G = nx.Graph()
//     sim_matrix = cosine_similarity(embeddings)
//     for i in range(len(sentences)):
//         G.add_node(i)
//     for i in range(len(sentences)):
//         for j in range(i + 1, len(sentences)):
//             sim = sim_matrix[i][j]
//             if sim > sim_threshold:
//                 G.add_edge(i, j, weight=sim)

//     pageranks = nx.pagerank(G, weight="weight")
//     seed_indices = sorted(pageranks, key=pageranks.get, reverse=True)[:top_k]

//     used = set()
//     chunks = []
//     chunk_idx = 0
//     for idx in seed_indices:
//         if idx in used:
//             continue
//         chunk = [idx]
//         used.add(idx)

//         i = idx - 1
//         while (
//             i >= 0
//             and i not in used
//             and cosine_similarity([embeddings[i]], [embeddings[chunk[0]]])[0][0]
//             > expansion_threshold
//         ):
//             chunk.insert(0, i)
//             used.add(i)
//             i -= 1

//         i = idx + 1
//         while (
//             i < len(sentences)
//             and i not in used
//             and cosine_similarity([embeddings[i]], [embeddings[chunk[-1]]])[0][0]
//             > expansion_threshold
//         ):
//             chunk.append(i)
//             used.add(i)
//             i += 1

//         chunk_text = " ".join(sentences[i] for i in chunk)
//         start_char = sentence_ranges[chunk[0]][0]
//         end_char = sentence_ranges[chunk[-1]][1]
//         chunks.append(
//             (
//                 chunk_text,
//                 {
//                     "chunk_idx": chunk_idx,
//                     "char_range": (start_char, end_char),
//                     "num_sentences": len(chunk),
//                 },
//             )
//         )
//         chunk_idx += 1

//     return chunks


// def remove_frequent_lines(pages, threshold=0.9):
//     """
//     Remove lines that appear in more than `threshold` proportion of pages.

//     Args:
//         pages (List[Dict]): List of dictionaries with page number and text content.
//         threshold (float): Proportion of pages a line must appear in to be removed.

//     Returns:
//         List[Dict]: Filtered list of pages with common lines removed.
//     """
//     all_lines = [
//         line.strip() for page in pages for line in page["text"].split("\n") if line.strip()
//     ]
//     line_counts = Counter(all_lines)
//     total_pages = len(pages)
//     common_lines = {line for line, count in line_counts.items() if count / total_pages > threshold}

//     filtered_pages = []
//     for page in pages:
//         lines = page["text"].split("\n")
//         filtered_lines = [line for line in lines if line.strip() not in common_lines]
//         filtered_pages.append({"page": page["page"], "text": "\n".join(filtered_lines)})
//     return filtered_pages


// def serialize_table_rows(rows):
//     """Serialize PyMuPDF table rows to CSV text."""

//     if not rows:
//         return ""

//     output = io.StringIO()
//     writer = csv.writer(output, lineterminator="\n")
//     for row in rows:
//         writer.writerow(["" if cell is None else cell for cell in row])
//     return output.getvalue().rstrip("\n")


// def _table_marker(csv_data):
//     return f"[Table: {csv_data}]"


// def _rect_sort_key(rect):
//     return (rect.y0, rect.x0)


// def _rects_overlap(rect_a, rect_b):
//     x_overlap = min(rect_a.x1, rect_b.x1) > max(rect_a.x0, rect_b.x0)
//     y_overlap = min(rect_a.y1, rect_b.y1) > max(rect_a.y0, rect_b.y0)
//     return x_overlap and y_overlap


// def _is_rect_within_margins(
//     rect, page, is_landscape, margin_top, margin_bottom, margin_left, margin_right
// ):
//     page_rect = page.rect
//     if is_landscape:
//         return margin_left < rect.x0 < (page_rect.width - margin_right)
//     return margin_top < rect.y0 < (page_rect.height - margin_bottom)


// def _extract_tables_from_page(page, fitz_module):
//     tables = []
//     if not hasattr(page, "find_tables"):
//         return tables

//     with contextlib.redirect_stdout(io.StringIO()):
//         finder = page.find_tables()
//     for table_index, table in enumerate(getattr(finder, "tables", []) or [], start=1):
//         csv_data = serialize_table_rows(table.extract())
//         if not csv_data:
//             continue
//         tables.append(
//             {
//                 "bbox": fitz_module.Rect(table.bbox),
//                 "text": _table_marker(csv_data),
//             }
//         )
//     return tables


// def _page_blocks(
//     page, fitz_module, table_rects, margin_top, margin_bottom, margin_left, margin_right
// ):
//     is_landscape = page.rect.width > page.rect.height or page.rotation in [90, 270]
//     blocks = []
//     for block in page.get_text("blocks") or []:
//         if len(block) < 5:
//             continue
//         rect = fitz_module.Rect(block[:4])
//         text = str(block[4]).strip()
//         if not text:
//             continue
//         if not _is_rect_within_margins(
//             rect,
//             page,
//             is_landscape,
//             margin_top,
//             margin_bottom,
//             margin_left,
//             margin_right,
//         ):
//             continue
//         if any(_rects_overlap(rect, table_rect) for table_rect in table_rects):
//             continue
//         blocks.append({"bbox": rect, "text": text})
//     return blocks


// def _parse_pdf_document(doc, fitz_module, margin_top, margin_bottom, margin_left, margin_right):
//     pages = []

//     for page_idx in range(len(doc)):
//         page = doc[page_idx]
//         tables = _extract_tables_from_page(page, fitz_module)
//         table_rects = [table["bbox"] for table in tables]
//         items = _page_blocks(
//             page,
//             fitz_module,
//             table_rects,
//             margin_top,
//             margin_bottom,
//             margin_left,
//             margin_right,
//         )
//         items.extend(tables)
//         items.sort(key=lambda item: _rect_sort_key(item["bbox"]))
//         pages.append(
//             {
//                 "page": page_idx + 1,
//                 "text": "\n".join(item["text"] for item in items),
//             }
//         )

//     return pages


// def parse_pdf(pdf_path, margin_top=50, margin_bottom=50, margin_left=50, margin_right=50):
//     """
//     Extracts clean text from a PDF, removing headers and footers based on layout.
//     Adapts to portrait and landscape orientation by checking page rotation/shape.

//     Args:
//         pdf_path (str or Path): Path to the PDF file.
//         margin_top (int): Top margin in points to ignore.
//         margin_bottom (int): Bottom margin in points to ignore.
//         margin_left (int): Left margin in points to ignore.
//         margin_right (int): Right margin in points to ignore.

//     Returns:
//         List[Dict]: List of dictionaries with page number and cleaned text content.
//         Each dictionary has keys "page" and "text".
//     """
//     pdf_path = Path(pdf_path)
//     assert pdf_path.exists(), f"File does not exist: {pdf_path}"

//     try:
//         import fitz  # PyMuPDF
//     except ImportError as exc:
//         raise RuntimeError(
//             "PyMuPDF and its runtime libraries are required for PDF extraction."
//         ) from exc

//     with fitz.open(pdf_path) as doc:
//         all_cleaned_text = _parse_pdf_document(
//             doc,
//             fitz,
//             margin_top,
//             margin_bottom,
//             margin_left,
//             margin_right,
//         )

//     all_cleaned_text = remove_frequent_lines(all_cleaned_text)  # update this function if needed

//     return all_cleaned_text


// # Replace input_pdf and output_txt with desired file paths
// if __name__ == "__main__":
//     parser = argparse.ArgumentParser(
//         description="Extract clean text from a PDF, removing headers and footers."
//     )
//     parser.add_argument("input_pdf", type=str, help="Path to the input PDF file")
//     parser.add_argument("output_txt", type=str, help="Path to the output text file")
//     parser.add_argument(
//         "--margin_top", type=int, default=50, help="Top margin in points (default: 50)"
//     )
//     parser.add_argument(
//         "--margin_bottom", type=int, default=50, help="Bottom margin in points (default: 50)"
//     )
//     parser.add_argument(
//         "--margin_left", type=int, default=50, help="Left margin in points (default: 50)"
//     )
//     parser.add_argument(
//         "--margin_right", type=int, default=50, help="Right margin in points (default: 50)"
//     )

//     parser.add_argument(
//         "--extract_images",
//         action="store_true",
//         help="Print embedded PDF image information to the console",
//     )
//     parser.add_argument(
//         "--image_output_dir",
//         type=str,
//         default=None,
//         help="Optional folder to save extracted images",
//     )

//     args = parser.parse_args()

//     cleaned_text = parse_pdf(
//         args.input_pdf,
//         margin_top=args.margin_top,
//         margin_bottom=args.margin_bottom,
//         margin_left=args.margin_left,
//         margin_right=args.margin_right,
//     )

//     output_path = Path(args.output_txt)
//     output_path.parent.mkdir(parents=True, exist_ok=True)
//     full_text = "\n\n".join(page["text"] for page in cleaned_text)
//     with open(output_path, "w", encoding="utf-8") as f:
//         f.write(full_text)
//     print(f"Extracted text saved to {output_path}")



// CHUNK_OUTPUT_PATH=/tmp/chunker.json npx tsx src/lib/server/providers/parse_pipeline/chunker-test.ts /path/to/file.pdf
// CHUNK_OUTPUT_PATH=/tmp/chunker-semantic.json npx tsx src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts /path/to/file.pdf
