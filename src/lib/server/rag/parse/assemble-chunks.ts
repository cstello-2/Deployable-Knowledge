// File to assemble chunks in order matching the documents they came from

import {
  buildChunkId,
  countWords,
  type ExtractedChunk,
  type ExtractedTable,
  type ParsedChunk,
  type Source,
} from "./parse-shared";

const MIN_TEXT_CHUNK_WORDS = 5;

// Tables arrive from extraction as structured data
// Code now builds TABLE chunks directly from those objects so chunk type does not depend on parsing strings
function tableChunk(source: Source, table: ExtractedTable): ParsedChunk | null {
  const content = table.content.trim();
  if (!content) return null;

  return {
    chunkId: buildChunkId(source, table.pageIndex, table.tableIndex, "TABLE", content),
    chunkType: "TABLE",
    source,
    pageIndex: table.pageIndex,
    chunkIndex: table.tableIndex,
    content,
    metadata: {
      startChar: 0,
      endChar: content.length,
      wordCount: countWords(content),
      sentenceCount: table.rows.length,
      tableIndex: table.tableIndex,
      tableRows: table.rows,
    },
  };
}

// Text chunks and table chunks are combined per page, then given one final page order
// Rebuilding ids here keeps chunkIndex and chunkId aligned after deduplication/filtering
function reindexChunks(chunks: ParsedChunk[]): ParsedChunk[] {
  return chunks.map((chunk, index) => {
    const content = chunk.content.trim();

    return {
      ...chunk,
      chunkId: buildChunkId(chunk.source, chunk.pageIndex, index, chunk.chunkType, content),
      chunkIndex: index,
      content,
      metadata: {
        ...chunk.metadata,
        wordCount: countWords(content),
      },
    };
  });}

export function assembleChunks(
  pages: ExtractedChunk[],
  textChunks: ParsedChunk[],
): ParsedChunk[] {
  // Group text chunks by page so assembly can stay linear: page text first, then page tables
  const textChunksByPage = new Map<number, ParsedChunk[]>();
  for (const chunk of textChunks) {
    const pageChunks = textChunksByPage.get(chunk.pageIndex) ?? [];
    pageChunks.push(chunk);
    textChunksByPage.set(chunk.pageIndex, pageChunks);
  }

  const finalChunks: ParsedChunk[] = [];
  const processedPageIndexes = new Set<number>();

  for (const page of pages) {
    const pageIndex = Number(page.pageIndex);
    if (processedPageIndexes.has(pageIndex)) continue;
    processedPageIndexes.add(pageIndex);

    const pageTextChunks = textChunksByPage.get(pageIndex) ?? [];
    // Table chunks are appended after text chunks for the page, but still deduped before storage
    const pageTableChunks = (page.tables ?? [])
      .map((table) => tableChunk(page.source, table))
      .filter((chunk): chunk is ParsedChunk => chunk !== null);
    const combinedChunks = [...pageTextChunks, ...pageTableChunks];
    const seenPageChunks = new Set<string>();
    const dedupedChunks: ParsedChunk[] = [];

    for (const chunk of combinedChunks) {
      const content = chunk.content.trim();
      if (!content || seenPageChunks.has(content)) continue;
      seenPageChunks.add(content);
      dedupedChunks.push({
        ...chunk,
        content,
      });
    }

    // Keep small non-text chunks that may fall under the minimum word count
    const keptChunks = dedupedChunks.filter((chunk) =>
      chunk.chunkType !== "TEXT" || countWords(chunk.content) >= MIN_TEXT_CHUNK_WORDS,
    );

    finalChunks.push(...reindexChunks(keptChunks));
  }
  return finalChunks;
}
