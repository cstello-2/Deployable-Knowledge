import { OfficeParser, type CellMetadata } from "officeparser";
import {
  normalizeWhitespace,
  type ExtractedChunk as Chunk,
  type Source,
} from "../parse-shared";
import type { TextExtractionResult } from "../text-extract";

// pageIndex is the file's real 0-based row index. Column identity doesn't fit the
// single-integer pageIndex field, so each row's column headers are folded directly into
// the chunk content instead - the retrieved snippet always shows which column each value came from.
export async function CsvExtract(file: Source): Promise<TextExtractionResult> {
  const chunks: Chunk[] = [];
  const ast = await OfficeParser.parseOffice(file.path);
  const sheet = ast.content?.[0];
  const rows = sheet?.children ?? [];

  if (rows.length === 0) {
    return { chunks, pageCount: 0 };
  }

  // officeparser omits empty cells instead of emitting a placeholder, so a cell's array
  // position isn't its real column. Every lookup below uses metadata.col instead, or a
  // value would silently shift under the wrong header when a row has a gap.
  const headerCells = rows[0].children ?? [];
  const headers: string[] = [];
  for (const [arrayIndex, cell] of headerCells.entries()) {
    const col = (cell.metadata as CellMetadata | undefined)?.col ?? arrayIndex;
    headers[col] = normalizeWhitespace(cell.text ?? "") || "Column";
  }

  let maxRowIndex = 0;

  for (let rowNumber = 1; rowNumber < rows.length; rowNumber += 1) {
    const row = rows[rowNumber];
    const cells = row.children ?? [];
    if (cells.length === 0) continue;

    const rowIndex = Number((cells[0].metadata as CellMetadata | undefined)?.row ?? rowNumber);
    maxRowIndex = Math.max(maxRowIndex, rowIndex);

    const content = cells
      .map((cell, arrayIndex) => {
        const value = normalizeWhitespace(cell.text ?? "");
        if (!value) return null;
        const col = (cell.metadata as CellMetadata | undefined)?.col ?? arrayIndex;
        const header = headers[col] ?? `Column ${col + 1}`;
        return `${header}: ${value}`;
      })
      .filter(Boolean)
      .join(" | ");

    if (content) {
      chunks.push({ chunkType: "TABLE", source: file, pageIndex: rowIndex, content });
    }
  }

  return { chunks, pageCount: maxRowIndex + 1 };
}
