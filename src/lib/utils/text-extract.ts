// Typescript file for PDF/Document text extraction used in the parse pipeline

// Imports:
import scribe from "scribe.js-ocr"; //Extraxtion Library

// Add media types as needed:
export type MediaType = "PDF";

export type ChunkType = "TEXT" | "IMAGE" | "TABLE";


//Define definitions
export type Chunk = {
  chunkType: ChunkType;
  source: Source;
  pageIndex: number;
  content: string;
};

export type Source = {
  title: string;
  type: MediaType;
  path: string;
};

type PageItem = {
  bbox: Bbox;
  text: string;
};

type Bbox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type PageMetricsLike = {
  dims?: {
    width: number;
    height: number;
  };
};

type WordLike = {
  text: string;
};

type LineLike = {
  bbox: Bbox;
  words: WordLike[];
  par?: {
    id?: string;
  } | null;
};

type ParLike = {
  id?: string;
};

type OcrPageLike = {
  lines: LineLike[];
  pars?: ParLike[];
};

type TableLike = {
  boxes: Array<{
    coords: Bbox;
  }>;
};

type LayoutTablePageLike = {
  tables?: TableLike[];
};

// Normalize repeated spaces while keeping line structures for filtering
function normalizeLineWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

// Simple CSV serializer kept local for table text output
function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, "\"\"")}"`;
}

// Serialize extracted table rows into CSV text
function serializeTableRows(rows: string[][]): string {
  if (rows.length === 0) return "";
  return rows.map((row) => row.map((cell) => csvEscape(cell)).join(",")).join("\n");
}

// Sorts top down, left to right
function rectSortKey(left: PageItem, right: PageItem): number {
  if (left.bbox.top !== right.bbox.top) {
    return left.bbox.top - right.bbox.top;
  }

  return left.bbox.left - right.bbox.left;
}

// Overlap check to remove text inside table boxes
function rectsOverlap(left: Bbox, right: Bbox): boolean {
  const xOverlap = Math.min(left.right, right.right) > Math.max(left.left, right.left);
  const yOverlap = Math.min(left.bottom, right.bottom) > Math.max(left.top, right.top);
  return xOverlap && yOverlap;
}

//Page margin filter matching the Python piepline
function isRectWithinMargins(
  rect: Bbox,
  metrics: PageMetricsLike | undefined,
  marginTop: number,
  marginBottom: number,
  marginLeft: number,
  marginRight: number,
): boolean {
  const width = metrics?.dims?.width ?? 0;
  const height = metrics?.dims?.height ?? 0;
  const isLandscape = width > height;

  if (isLandscape) {
    return rect.left > marginLeft && rect.left < width - marginRight;
  }

  return rect.top > marginTop && rect.top < height - marginBottom;
}

// Union join a list of boxes into one bounding box.
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

//Repeated line remover matching the Python pipeline
function removeFrequentLines(
  pages: Chunk[],
  threshold: number,
): Chunk[] {
  if (pages.length < 2) return pages;

  const lineCounts = new Map<string, number>();

  for (const page of pages) {
    const lines = page.content
      .split("\n")
      .map((line) => normalizeLineWhitespace(line))
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
      .filter((line) => !commonLines.has(normalizeLineWhitespace(line)))
      .join("\n"),
  }));
}

//Group paragraphs by order
function paragraphText(lines: LineLike[]): string {
  return normalizeLineWhitespace(
    lines
      .map((line) => line.words.map((word) => word.text).join(" "))
      .filter(Boolean)
      .join(" "),
  );
}

// Turn OCR lines into page items after filtering
function buildTextItems(
  page: OcrPageLike | undefined,
  metrics: PageMetricsLike | undefined,
  tableRects: Bbox[],
  marginTop: number,
  marginBottom: number,
  marginLeft: number,
  marginRight: number,
): PageItem[] {
  if (!page?.lines?.length) return [];

  const lines = [...page.lines]
    .filter((line) => line.words?.length)
    .sort((left, right) => rectSortKey({ bbox: left.bbox, text: "" }, { bbox: right.bbox, text: "" }))
    .filter((line) => isRectWithinMargins(line.bbox, metrics, marginTop, marginBottom, marginLeft, marginRight))
    .filter((line) => !tableRects.some((tableRect) => rectsOverlap(line.bbox, tableRect)));

  const items: PageItem[] = [];
  let activeParId: string | null = null;
  let activeLines: LineLike[] = [];

  const flushLines = () => {
    if (activeLines.length === 0) return;

    const text = paragraphText(activeLines);
    if (!text) {
      activeLines = [];
      activeParId = null;
      return;
    }

    items.push({
      bbox: unionBboxes(activeLines.map((line) => line.bbox)),
      text,
    });

    activeLines = [];
    activeParId = null;
  };

  for (const line of lines) {
    const parId = line.par?.id ?? null;

    if (activeLines.length === 0) {
      activeParId = parId;
      activeLines.push(line);
      continue;
    }

    if (parId !== null && parId === activeParId) {
      activeLines.push(line);
      continue;
    }

    flushLines();
    activeParId = parId;
    activeLines.push(line);
  }

  flushLines();
  return items;
}

// Extract tables 
function buildTableItems(
  page: OcrPageLike | undefined,
  layoutPage: LayoutTablePageLike | undefined,
): PageItem[] {
  if (!page || !layoutPage?.tables?.length) return [];

  const tablePages = scribe.extractTextFromTables(page as never, layoutPage as never) as Array<{
    rows: string[][];
  }>;

  return layoutPage.tables
    .map((table, index) => {
      const rows = tablePages[index]?.rows ?? [];
      const csvData = serializeTableRows(rows);
      if (!csvData || table.boxes.length === 0) return null;

      return {
        bbox: unionBboxes(table.boxes.map((box) => box.coords)),
        text: `[Table: ${csvData}]`,
      } satisfies PageItem;
    })
    .filter((item): item is PageItem => item !== null);
}

// Main entry for layout aware PDF extraction used by semantic chunking
export async function textExtract(
  file: Source,
  repeatedLineThreshold: number = 0.9,
): Promise<Chunk[]> {
  const doc = await scribe.openDocument([file.path]);

  try {
    const pages: Chunk[] = [];
    const pageCount = doc.ocr?.active?.length ?? 0;

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const page = doc.ocr.active[pageIndex] as OcrPageLike | undefined;
      const metrics = doc.pageMetrics?.[pageIndex] as PageMetricsLike | undefined;
      const layoutPage = doc.layoutDataTables?.pages?.[pageIndex] as LayoutTablePageLike | undefined;
      const tableItems = buildTableItems(page, layoutPage);
      const textItems = buildTextItems(page, metrics, tableItems.map((item) => item.bbox), 50, 50, 50, 50);
      const items = [...textItems, ...tableItems].sort(rectSortKey);
      const content = items.map((item) => item.text).filter(Boolean).join("\n");

      pages.push({
        chunkType: "TEXT",
        source: file,
        pageIndex,
        content,
      });
    }

    return removeFrequentLines(pages, repeatedLineThreshold);
  } finally {
    await doc.terminate();
    await scribe.terminate();
  }
}
