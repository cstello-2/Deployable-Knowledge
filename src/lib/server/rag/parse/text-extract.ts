import scribe from "scribe.js-ocr";
import {
  normalizeWhitespace,
  type ExtractedChunk as Chunk,
  type ExtractedTable,
  type Source,
} from "./parse-shared";

type PageItem = {
  bbox: Bbox;
  text: string;
};

type TableItem = {
  bbox: Bbox;
  table: ExtractedTable;
};

type Bbox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type WordLike = {
  text: string;
};

type LineLike = {
  bbox: Bbox;
  words: WordLike[];
};

type OcrPageLike = {
  lines: LineLike[];
};

type TableLike = {
  boxes: Array<{
    coords: Bbox;
  }>;
};

type LayoutTablePageLike = {
  tables?: TableLike[];
};

type ExtractTextFromTables = (
  page: OcrPageLike,
  layoutPage: LayoutTablePageLike,
) => Array<{ rows: string[][] }>;

// scribe has weak table extraction types, so keep the cast in one place
const extractTextFromTables = scribe.extractTextFromTables as unknown as ExtractTextFromTables;

// Stored table chunks need readable text for embedding, while rows stay available in metadata
function tableRowsToText(rows: string[][]): string {
  if (rows.length === 0) return "";
  return rows
    .map((row) =>
      row
        .map((cell) => normalizeWhitespace(cell))
        .filter(Boolean)
        .join(" | "),
    )
    .filter(Boolean)
    .join("\n");
}

// Sort OCR boxes top to bottom, left to righ. Keeps extraction predictable
function rectSortKey(left: PageItem, right: PageItem): number {
  if (left.bbox.top !== right.bbox.top) {
    return left.bbox.top - right.bbox.top;}
  return left.bbox.left - right.bbox.left;}

// Used to avoid putting table text into the normal page text
function rectsOverlap(left: Bbox, right: Bbox): boolean {
  const xOverlap = Math.min(left.right, right.right) > Math.max(left.left, right.left);
  const yOverlap = Math.min(left.bottom, right.bottom) > Math.max(left.top, right.top);
  return xOverlap && yOverlap;
}

// scribe package gives table boxes as multiple rectangles, but downstream only needs one table box
function unionBboxes(boxes: Bbox[]): Bbox {
  return boxes.reduce(
    (merged, box) => ({
      left: Math.min(merged.left, box.left),
      top: Math.min(merged.top, box.top),
      right: Math.max(merged.right, box.right),
      bottom: Math.max(merged.bottom, box.bottom),
    }),
    { ...boxes[0] },
  );
}

// Extraction owns repeated header/footer cleanup because it can compare all pages at once
// Now done linearly as oppsoed to after chunks were made
function removeFrequentLines(
  pages: Chunk[],
  threshold: number,
): Chunk[] {
  if (pages.length < 2) return pages;

  const lineCounts = new Map<string, number>();

  for (const page of pages) {
    const lines = page.content
      .split("\n")
      .map((line) => normalizeWhitespace(line)) // .trim() not used incase multiple spcaes exist between text
      .filter(Boolean);

    for (const line of new Set(lines)) {
      lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
    }
  }

  const commonLines = new Set<string>();
  for (const [line, count] of lineCounts.entries()) {
    if (count / pages.length > threshold) {
      commonLines.add(line);
    }
  }

  if (commonLines.size === 0) return pages;

  return pages.map((page) => ({
    ...page,
    content: page.content
      .split("\n")
      .filter((line) => !commonLines.has(normalizeWhitespace(line)))
      .join("\n"),
  }));
}

function buildTextItems(
  page: OcrPageLike | undefined,
  tableRects: Bbox[],
): PageItem[] {
  if (!page?.lines?.length) return [];

  // Exclude table overlapping lines so tables are stored as TABLE chunks, not duplicated as TEXT
  return [...page.lines]
    .filter((line) => line.words?.length)
    .sort((left, right) => rectSortKey({ bbox: left.bbox, text: "" }, { bbox: right.bbox, text: "" }))
    .filter((line) => !tableRects.some((tableRect) => rectsOverlap(line.bbox, tableRect)))
    .map((line) => ({
      bbox: line.bbox,
      text: normalizeWhitespace(line.words.map((word) => word.text).join(" ")),
    }))
    .filter((item) => item.text);
}

function buildTableItems(
  page: OcrPageLike | undefined,
  layoutPage: LayoutTablePageLike | undefined,
  pageIndex: number,
): TableItem[] {
  if (!page || !layoutPage?.tables?.length) return [];

  // Keep the library's table rows intact and create display/embed text from those rows one time
  const tablePages = extractTextFromTables(page, layoutPage);

  return layoutPage.tables
    .map((table, index) => {
      const rows = tablePages[index]?.rows ?? [];
      const content = tableRowsToText(rows);
      if (!content || table.boxes.length === 0) return null;

      return {
        bbox: unionBboxes(table.boxes.map((box) => box.coords)),
        table: {
          tableIndex: index,
          pageIndex,
          content,
          rows,
        },
      } satisfies TableItem;
    })
    .filter((item): item is TableItem => item !== null);
}

export async function TextExtract(
  file: Source,
  repeatedLineThreshold: number = 0.9,
): Promise<Chunk[]> {
  const doc = await scribe.openDocument([file.path]);

  try {
    const pages: Chunk[] = [];
    const pageCount = doc.ocr?.active?.length ?? 0;

    // Each extracted page carries plain text plus any structured tables found on that page
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const page = doc.ocr.active[pageIndex] as OcrPageLike | undefined;
      const layoutPage = doc.layoutDataTables?.pages?.[pageIndex] as LayoutTablePageLike | undefined;
      const tableItems = buildTableItems(page, layoutPage, pageIndex);
      const textItems = buildTextItems(page, tableItems.map((item) => item.bbox));
      const content = textItems.sort(rectSortKey).map((item) => item.text).filter(Boolean).join("\n");

      pages.push({
        chunkType: "TEXT",
        source: file,
        pageIndex,
        content,
        tables: tableItems.map((item) => item.table),
      });
    }

    return removeFrequentLines(pages, repeatedLineThreshold);
  } finally {
    // scribe keeps worker resources alive unless both document and library are terminated
    await doc.terminate();
    await scribe.terminate();
  }
}
