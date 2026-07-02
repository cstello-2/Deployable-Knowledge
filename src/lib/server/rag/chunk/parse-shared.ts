// Helper File to house shared functions across chunk pipeline

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

export type ParsedChunk = {
  chunkId: string;
  chunkType: ChunkType;
  source: Source;
  pageIndex: number;
  chunkIndex: number;
  content: string;
  metadata: ChunkMetadata;
};

// Function finds every instance of consecutive spaces and tabs and converts them single spaces
// This preserves single space formatting while removing extra indentation. Used incase PDFs weirdly formatted
export function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();} 

// Used for metadata.wordCount and to ensure chunks satisfy minWords
export function countWords(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}

// Create unique chunkId for each chunk, prevents duplicate chunks
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
