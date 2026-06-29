// ----------------------------
// Typescript file for post-processing semantic chunks before retrieval storage
// ----------------------------

// Imports
import {
  buildChunkId,
  countWords,
  type ChunkRecord,
  type ChunkType,
  type ExtractedChunk,
} from "./parse-shared";

type PostprocessOptions = {
  minWords?: number;
};

const DEFAULT_OPTIONS: Required<PostprocessOptions> = {
  minWords: 5,
};

// Table markers are handled separately in the Python retriever flow too.
function isTableChunk(text: string): boolean {
  return text.trimStart().startsWith("[Table:");
}

// Pull inline table markers out as standalone retrieval chunks.
function extractTableChunks(page: ExtractedChunk): ChunkRecord[] {
  const text = page.content;
  const matches = text.matchAll(/\[Table: .*?\]/gs);
  const chunks: ChunkRecord[] = [];
  let chunkIndex = 0;
  const chunkType: ChunkType = "TABLE";

  for (const match of matches) {
    const content = match[0].trim();
    if (!content) continue;

    const startChar = match.index ?? 0;
    const endChar = startChar + match[0].length;
    chunks.push({
      chunkId: buildChunkId(page.source, Number(page.pageIndex), chunkIndex, chunkType, content),
      chunkType,
      source: page.source,
      pageIndex: Number(page.pageIndex),
      chunkIndex,
      content,
      metadata: {
        startChar,
        endChar,
        wordCount: countWords(content),
        sentenceCount: 1,
      },
    });
    chunkIndex += 1;
  }

  return chunks;
}

// Reindex chunks after dedupe/filtering so ordering stays deterministic.
function reindexChunks(chunks: ChunkRecord[]): ChunkRecord[] {
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
  });
}

// Final retrieval prep following the Python combine/dedupe/filter flow.
export function postprocessChunks(
  pages: ExtractedChunk[],
  semanticChunks: ChunkRecord[],
  options: PostprocessOptions = {},
): ChunkRecord[] {
  const resolved = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const semanticByPage = new Map<number, ChunkRecord[]>();
  for (const chunk of semanticChunks) {
    const pageChunks = semanticByPage.get(chunk.pageIndex) ?? [];
    pageChunks.push(chunk);
    semanticByPage.set(chunk.pageIndex, pageChunks);
  }

  const finalChunks: ChunkRecord[] = [];

  for (const page of pages) {
    if (page.chunkType !== "TEXT") continue;

    const pageIndex = Number(page.pageIndex);
    const pageSemanticChunks = semanticByPage.get(pageIndex) ?? [];
    const pageTableChunks = extractTableChunks(page);
    const combinedChunks = [...pageSemanticChunks, ...pageTableChunks];
    const seenPageChunks = new Set<string>();
    const dedupedChunks: ChunkRecord[] = [];

    for (const chunk of combinedChunks) {
      const content = chunk.content.trim();
      if (!content || seenPageChunks.has(content)) continue;
      seenPageChunks.add(content);
      dedupedChunks.push({
        ...chunk,
        content,
      });
    }

    const keptChunks = dedupedChunks.filter((chunk) =>
      isTableChunk(chunk.content) || countWords(chunk.content) >= resolved.minWords,
    );

    finalChunks.push(...reindexChunks(keptChunks));
  }

  return finalChunks;
}
