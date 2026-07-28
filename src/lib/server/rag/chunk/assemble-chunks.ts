// File to assemble chunks in order matching the documents they came from

import {
  buildChunkId,
  countWords,
  minWordsFor,
  type ParsedChunk,
} from "./parse-shared";

export function assembleChunks(chunks: ParsedChunk[]): ParsedChunk[] {
  const chunksByPage = new Map<number, ParsedChunk[]>();

  for (const chunk of chunks) {
    const pageIndex = chunk.pageIndex;
    const pageChunks = chunksByPage.get(pageIndex) ?? [];
    pageChunks.push(chunk);
    chunksByPage.set(pageIndex, pageChunks);
  }

  // Grouping keys come from the chunks themselves, not the pre-chunking page list - a
  // chunk's pageIndex can diverge from its source page's (see resolvePageIndex in
  // chunker.ts), and grouping from elsewhere would silently drop those chunks.
  const finalChunks: ParsedChunk[] = [];
  const pageIndexes = [...chunksByPage.keys()];

  for (const pageIndex of pageIndexes) {
    const seenContent = new Set<string>();
    let chunkIndex = 0;

    for (const chunk of chunksByPage.get(pageIndex) ?? []) {
      const content = chunk.content.trim();
      const wordCount = countWords(content);
      const tooShort = chunk.chunkType === "TEXT" && wordCount < minWordsFor(chunk.source);

      if (!content || seenContent.has(content) || tooShort) continue;

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
