// ----------------------------
// Typescript file for post-processing semantic chunks before retrieval storage
// ----------------------------

// Imports
import { createHash } from "node:crypto";
import type { Chunk as ExtractedChunk, ChunkType, Source } from "./text-extract";
import type { ChunkRecord } from "./chunker-semantic";

type PostprocessOptions = {
  filterChunks?: boolean;
  minWords?: number;
};

const DEFAULT_OPTIONS: Required<PostprocessOptions> = {
  filterChunks: true,
  minWords: 5,
};

// Helper for word counts used by final keep/drop rules.
function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

// Normalize whitespace in final chunk text.
function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

// Deterministic ids for post-processed chunks.
function buildChunkId(
  source: Source,
  pageIndex: number,
  chunkIndex: number,
  chunkType: ChunkType,
  content: string,
): string {
  return createHash("sha256")
    .update(source.path)
    .update("\n")
    .update(String(pageIndex))
    .update("\n")
    .update(String(chunkIndex))
    .update("\n")
    .update(chunkType)
    .update("\n")
    .update(content)
    .digest("hex");
}

// Table markers are handled separately in the Python retriever flow too.
function isTableChunk(text: string): boolean {
  return text.trimStart().startsWith("[Table:");
}

// Same shouty text filter used by the Python pipeline.
function isAllCaps(text: string, threshold: number = 0.8): boolean {
  const cleaned = text.replace(/[\W\d_]+/g, "");
  if (!cleaned) return false;

  let upperCount = 0;
  for (const char of cleaned) {
    if (char === char.toUpperCase()) {
      upperCount += 1;
    }
  }

  return upperCount / cleaned.length >= threshold;
}

// Catch obvious visual noise like ellipses or separator dashes.
function hasRepeatedSubstring(text: string): boolean {
  const chars = text.replace(/\s+/g, "");
  return /\.{3,}|-{3,}|_{3,}/.test(chars);
}

// Final keep/drop rule from the Python retriever flow.
function keepChunk(text: string, filterChunks: boolean, minWords: number): boolean {
  if (isTableChunk(text)) return true;
  if (filterChunks && (isAllCaps(text) || hasRepeatedSubstring(text))) {
    return false;
  }

  return wordCount(text) >= minWords;
}

// Pull inline table markers out as standalone retrieval chunks.
function extractTableChunks(page: ExtractedChunk): ChunkRecord[] {
  const text = page.content;
  const matches = text.matchAll(/\[Table: .*?\]/gs);
  const chunks: ChunkRecord[] = [];
  let chunkIndex = 0;

  for (const match of matches) {
    const content = normalizeWhitespace(match[0]);
    if (!content) continue;

    const startChar = match.index ?? 0;
    const endChar = startChar + match[0].length;
    chunks.push({
      chunkId: buildChunkId(page.source, Number(page.pageIndex), chunkIndex, page.chunkType, content),
      chunkType: page.chunkType,
      source: page.source,
      pageIndex: Number(page.pageIndex),
      chunkIndex,
      content,
      metadata: {
        startChar,
        endChar,
        wordCount: wordCount(content),
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
    const content = normalizeWhitespace(chunk.content);

    return {
      ...chunk,
      chunkId: buildChunkId(chunk.source, chunk.pageIndex, index, chunk.chunkType, content),
      chunkIndex: index,
      content,
      metadata: {
        ...chunk.metadata,
        wordCount: wordCount(content),
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
      const content = normalizeWhitespace(chunk.content);
      if (!content || seenPageChunks.has(content)) continue;
      seenPageChunks.add(content);
      dedupedChunks.push({
        ...chunk,
        content,
      });
    }

    const keptChunks = dedupedChunks.filter((chunk) =>
      keepChunk(chunk.content, resolved.filterChunks, resolved.minWords),
    );

    finalChunks.push(...reindexChunks(keptChunks));
  }

  return finalChunks;
}
