import { createHash } from "node:crypto";

export type MediaType = "PDF";
export type ChunkType = "TEXT" | "IMAGE" | "TABLE";

export type Source = {
  title: string;
  type: MediaType;
  path: string;
};

export type ExtractedChunk = {
  chunkType: ChunkType;
  source: Source;
  pageIndex: number;
  content: string;
};

export type ChunkMetadata = {
  startChar: number;
  endChar: number;
  wordCount: number;
  sentenceCount: number;
};

export type ChunkRecord = {
  chunkId: string;
  chunkType: ChunkType;
  source: Source;
  pageIndex: number;
  chunkIndex: number;
  content: string;
  metadata: ChunkMetadata;
};

export function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export function countWords(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}

export function buildChunkId(
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
