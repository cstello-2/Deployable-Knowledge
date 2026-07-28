import { readFile } from "node:fs/promises";
import { PDFParse, type EmbeddedImage, type TableArray } from "pdf-parse";
import type { Worker } from "tesseract.js";
import {
  normalizeWhitespace,
  type ExtractedChunk as Chunk,
  type Source,
} from "./parse-shared.ts";
import { createOcrWorker } from "./ocr";

export type TextExtractionResult = {
  chunks: Chunk[];
  pageCount: number;
};

function tableToText(table: TableArray): string {
  return table
    .map((row) => row.map(normalizeWhitespace).filter(Boolean).join(" | "))
    .filter(Boolean)
    .join("\n");
}

async function ocrEmbeddedImages(
  data: Uint8Array,
  pageCount: number,
  onPageProgress?: (current: number, total: number) => void,
): Promise<Map<number, string[]>> {
  const textByPage = new Map<number, string[]>();
  let worker: Worker | undefined;

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const images = await getPageImages(data, pageNumber);

      if (images.length > 0) {
        console.log(`[OCR] Page ${pageNumber}/${pageCount}: ${images.length} image(s)`);
      }

      for (const image of images) {
        if (!worker) {
          worker = await createOcrWorker();
        }

        try {
          const result = await worker.recognize(Buffer.from(image.data));
          const text = normalizeWhitespace(result.data.text);

          if (text) {
            textByPage.set(pageNumber, [...(textByPage.get(pageNumber) ?? []), text]);
          }
        } catch (error) {
          console.warn(`[OCR] Could not read an image on page ${pageNumber}.`, error);
        }
      }

      onPageProgress?.(pageNumber, pageCount);
    }
  } finally {
    await worker?.terminate();
  }

  return textByPage;
}

async function getPageImages(data: Uint8Array, pageNumber: number): Promise<EmbeddedImage[]> {
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getImage({ partial: [pageNumber], imageDataUrl: false });
    return result.pages[0]?.images ?? [];
  } catch (error) {
    console.warn(`[OCR] Could not extract images from page ${pageNumber}; skipping it.`, error);
    return [];
  } finally {
    await parser.destroy();
  }
}

export async function TextExtract(
  file: Source,
  onPageProgress?: (current: number, total: number) => void,
): Promise<TextExtractionResult> {
  const data = await readFile(file.path);
  const parser = new PDFParse({ data });

  try {
    const textResult = await parser.getText();
    const ocrTextByPage = await ocrEmbeddedImages(data, textResult.total, onPageProgress);
    const tableResult = await parser.getTable();
    const chunks: Chunk[] = [];

    for (let pageNumber = 1; pageNumber <= textResult.total; pageNumber += 1) {
      const pageIndex = pageNumber - 1;
      const nativeText = normalizeWhitespace(textResult.getPageText(pageNumber));

      if (nativeText) {
        chunks.push({ chunkType: "TEXT", source: file, pageIndex, content: nativeText });
      }

      for (const content of ocrTextByPage.get(pageNumber) ?? []) {
        chunks.push({ chunkType: "IMAGE", source: file, pageIndex, content });
      }

      const tables = tableResult.pages.find((page) => page.num === pageNumber)?.tables ?? [];

      for (const table of tables) {
        const content = tableToText(table);

        if (content) {
          chunks.push({ chunkType: "TABLE", source: file, pageIndex, content });
        }
      }
    }

    return { chunks, pageCount: textResult.total };
  } finally {
    await parser.destroy();
  }
}
