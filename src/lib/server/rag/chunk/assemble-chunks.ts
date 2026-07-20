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
  const chunksByPage = new Map<number, ParsedChunk[]>();

  for (const chunk of chunks) {
    const pageIndex = chunk.pageIndex;
    const pageChunks = chunksByPage.get(pageIndex) ?? [];
    pageChunks.push(chunk);
    chunksByPage.set(pageIndex, pageChunks);
  }

  const finalChunks: ParsedChunk[] = [];
  const pageIndexes = [...new Set(pages.map((page) => page.pageIndex))];

  for (const pageIndex of pageIndexes) {
    const seenContent = new Set<string>();
    let chunkIndex = 0;

    for (const chunk of chunksByPage.get(pageIndex) ?? []) {
      const content = chunk.content.trim();
      const wordCount = countWords(content);
      const tooShort = chunk.chunkType === "TEXT" && wordCount < MIN_TEXT_CHUNK_WORDS;
      const contained = (chunksByPage.get(pageIndex) ?? []).some((other) => {
        const otherContent = other.content.trim(); // Dedupe chunks
        return other !== chunk && otherContent.length > content.length && otherContent.includes(content);
      });

      if (!content || seenContent.has(content) || tooShort || contained) continue;

      seenContent.add(content);
      // Rebuild ids after filtering so chunkIndex and chunkId match final page order
      finalChunks.push({
        ...chunk,
        chunkId: buildChunkId(chunk, chunkIndex, content),
        chunkIndex,
        content,
      });
      chunkIndex += 1;
    }
  }

  return finalChunks;
}
