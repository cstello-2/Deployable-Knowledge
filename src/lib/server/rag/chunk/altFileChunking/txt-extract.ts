import { readFile } from "node:fs/promises";
import {
  normalizeWhitespace,
  type ExtractedChunk as Chunk,
  type Source,
} from "../parse-shared";
import type { TextExtractionResult } from "../text-extract";

// Paragraphs are blank-line-separated runs of text. pageIndex is the real 0-based line
// number the paragraph starts on, so citations read as actual file line numbers.
export async function TxtExtract(file: Source): Promise<TextExtractionResult> {
  const raw = await readFile(file.path, "utf8");
  const lines = raw.replace(/\r\n/g, "\n").split("\n");

  const chunks: Chunk[] = [];
  let paragraphLines: string[] = [];
  let paragraphStartLine = 0;
  let lastLine = 0;

  const flush = () => {
    if (paragraphLines.length === 0) return;
    const content = normalizeWhitespace(paragraphLines.join("\n"));
    if (content) {
      chunks.push({ chunkType: "TEXT", source: file, pageIndex: paragraphStartLine, content });
    }
    paragraphLines = [];
  };

  lines.forEach((line, lineIndex) => {
    const isBlank = line.trim().length === 0;

    if (isBlank) {
      flush();
    } else {
      if (paragraphLines.length === 0) paragraphStartLine = lineIndex;
      paragraphLines.push(line);
    }

    lastLine = lineIndex;
  });

  flush();

  return { chunks, pageCount: lastLine + 1 };
}
