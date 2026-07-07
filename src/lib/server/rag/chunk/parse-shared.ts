// Helper File to house shared functions across chunk pipeline

import { createHash } from "node:crypto";
import type { Document, DocumentChunk } from "../../database/schema";

export type MediaType = Document["sourceType"];
export type ChunkType = DocumentChunk["chunkType"];

export type Source = {
  title: Document["title"];
  type: Document["sourceType"];
  path: Document["sourcePath"];
};

export type ExtractedChunk = {
  chunkType: DocumentChunk["chunkType"];
  source: Source;
  pageIndex: DocumentChunk["pageIndex"];
  content: DocumentChunk["content"];
};

export type ParsedChunk = {
  chunkId: DocumentChunk["id"];
  chunkType: DocumentChunk["chunkType"];
  source: Source;
  pageIndex: DocumentChunk["pageIndex"];
  chunkIndex: DocumentChunk["chunkIndex"];
  content: DocumentChunk["content"];
};

// Used to find every instance of consecutive spaces and tabs and converts them single spaces
export function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();} 

// Used to ensure chunks satisfy minWords
export function countWords(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}

// Create unique chunkId for each chunk, prevents duplicate chunks
export function buildChunkId(
  page: ExtractedChunk,
  chunkIndex: number,
  content: string,
): string {
  return createHash("sha256")
    .update(page.source.path)
    .update("\n")
    .update(String(Number(page.pageIndex)))
    .update("\n")
    .update(String(chunkIndex))
    .update("\n")
    .update(page.chunkType)
    .update("\n")
    .update(content)
    .digest("hex");
}
