import { OfficeParser, type CellMetadata, type SheetMetadata } from "officeparser";
import {
  normalizeWhitespace,
  type ExtractedChunk as Chunk,
  type Source,
} from "../parse-shared";
import type { TextExtractionResult } from "../text-extract";

// Same row/column structure as CSV, but a workbook can hold several sheets, so a plain
// row index would collide across sheets. Each row's sheet name is folded into the chunk
// content alongside its column headers; pageIndex stays the row's real index within its own sheet.
export async function XlsxExtract(file: Source): Promise<TextExtractionResult> {
  const chunks: Chunk[] = [];
  const ast = await OfficeParser.parseOffice(file.path);
  const sheets = ast.content ?? [];

  let maxRowIndex = 0;

  for (const sheet of sheets) {
    const sheetName = (sheet.metadata as SheetMetadata | undefined)?.sheetName;
    const rows = sheet.children ?? [];
    if (rows.length === 0) continue;

    // officeparser omits empty cells instead of emitting a placeholder, so a cell's array
    // position isn't its real column. Every lookup below uses metadata.col instead, or a
    // value would silently shift under the wrong header when a row has a gap.
    const headerCells = rows[0].children ?? [];
    const headers: string[] = [];
    for (const [arrayIndex, cell] of headerCells.entries()) {
      const col = (cell.metadata as CellMetadata | undefined)?.col ?? arrayIndex;
      headers[col] = normalizeWhitespace(cell.text ?? "") || "Column";
    }

    for (let rowNumber = 1; rowNumber < rows.length; rowNumber += 1) {
      const row = rows[rowNumber];
      const cells = row.children ?? [];
      if (cells.length === 0) continue;

      const rowIndex = Number((cells[0].metadata as CellMetadata | undefined)?.row ?? rowNumber);
      maxRowIndex = Math.max(maxRowIndex, rowIndex);

      const cellContent = cells
        .map((cell, arrayIndex) => {
          const value = normalizeWhitespace(cell.text ?? "");
          if (!value) return null;
          const col = (cell.metadata as CellMetadata | undefined)?.col ?? arrayIndex;
          const header = headers[col] ?? `Column ${col + 1}`;
          return `${header}: ${value}`;
        })
        .filter(Boolean)
        .join(" | ");

      if (!cellContent) continue;

      const content = sheetName ? `Sheet: ${sheetName} | ${cellContent}` : cellContent;
      chunks.push({ chunkType: "TABLE", source: file, pageIndex: rowIndex, content });
    }
  }

  return { chunks, pageCount: maxRowIndex + 1 };
}
