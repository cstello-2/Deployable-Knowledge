// File to assemble chunks in order matching the documents they came from

import {
  buildChunkId,
  countWords,
  type ExtractedChunk,
  type ParsedChunk,
} from "./parse-shared";

const MIN_TEXT_CHUNK_WORDS = 5; 

export function assembleChunks(
  pages: ExtractedChunk[],
  chunks: ParsedChunk[],
): ParsedChunk[] {
  // Group first so final output follows the original extracted page order
  const chunksByPage = new Map<number, ParsedChunk[]>();
  for (const chunk of chunks) {
    const pageChunks = chunksByPage.get(chunk.pageIndex) ?? [];
    pageChunks.push(chunk);
    chunksByPage.set(chunk.pageIndex, pageChunks);
  }

  const finalChunks: ParsedChunk[] = [];
  const processedPageIndexes = new Set<number>();

  for (const page of pages) {
    const pageIndex = Number(page.pageIndex);
    if (processedPageIndexes.has(pageIndex)) continue;
    processedPageIndexes.add(pageIndex);

    const seenPageChunks = new Set<string>();
    let chunkIndex = 0;

    for (const chunk of chunksByPage.get(pageIndex) ?? []) {
      const content = chunk.content.trim();
      const wordCount = countWords(content);
      if (!content || seenPageChunks.has(content)) continue;
      if (chunk.chunkType === "TEXT" && wordCount < MIN_TEXT_CHUNK_WORDS) continue;

      seenPageChunks.add(content);
      // Rebuild ids after filtering so chunkIndex and chunkId match final page order
      finalChunks.push({
        ...chunk,
        chunkId: buildChunkId(chunk.source, pageIndex, chunkIndex, chunk.chunkType, content),
        chunkIndex,
        content,
        metadata: {
          ...chunk.metadata,
          wordCount,
        },
      });
      chunkIndex += 1;
    }
  }

  return finalChunks;
}
