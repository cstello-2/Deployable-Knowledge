// Embeds chunks and stores said chunks in the SQL Database

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../database/database";
import {
  document_chunks,
  documents,
  type NewDocument,
  type NewDocumentChunk,
} from "../database/schema";
import type { ChunkRecord } from "./parse/parse-shared";
import { EMBEDDING_MODEL, embedTexts } from "./embedding-model";

const INSERT_BATCH_SIZE = 100;

type StoreChunksResult = {
  documentId: string;
  chunkCount: number;
  embeddingModel: string;
};

// Use vecotr BLOBs, stored as Float32 bytes to hopefully help with cosine similarity search
function embeddingToBuffer(values: number[]): Buffer {
  const array = Float32Array.from(values);
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

// Build the document row once so chunks can reference it by document_id
function buildDocumentRow(chunks: ChunkRecord[], now: string): NewDocument {
  const source = chunks[0].source;

  return {
    id: createHash("sha256").update(source.path).digest("hex"),
    title: source.title,
    sourcePath: source.path,
    sourceType: source.type,
    createdAt: now,
    updatedAt: now,
  };
}

// Build SQL rows from the final chunk records & the embeddings
function buildChunkRows(
  chunks: ChunkRecord[],
  documentId: string,
  embeddings: number[][],
  now: string,
): NewDocumentChunk[] {
  return chunks.map((chunk, index) => ({
    id: chunk.chunkId,
    documentId,
    chunkType: chunk.chunkType,
    pageIndex: chunk.pageIndex,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    startChar: chunk.metadata.startChar,
    endChar: chunk.metadata.endChar,
    wordCount: chunk.metadata.wordCount,
    sentenceCount: chunk.metadata.sentenceCount,
    metadata: {
      sourceTitle: chunk.source.title,
      sourcePath: chunk.source.path,
      sourceType: chunk.source.type,
      ...chunk.metadata,
    },
    embedding: embeddingToBuffer(embeddings[index] ?? []),
    embeddingModel: EMBEDDING_MODEL,
    createdAt: now,
  }));
}

// Replace chunks if document is reuploaded
export async function storeDocumentChunks(chunks: ChunkRecord[]): Promise<StoreChunksResult> {
  if (chunks.length === 0) {
    throw new Error("Cannot store embeddings for an empty chunk list.");
  }

  const now = new Date().toISOString();
  const documentRow = buildDocumentRow(chunks, now);
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
  const chunkRows = buildChunkRows(chunks, documentRow.id, embeddings, now);

  await db
    .insert(documents)
    .values(documentRow)
    .onConflictDoUpdate({
      target: documents.id,
      set: {
        title: documentRow.title,
        sourcePath: documentRow.sourcePath,
        sourceType: documentRow.sourceType,
        updatedAt: documentRow.updatedAt,
      },
    });

  await db.delete(document_chunks).where(eq(document_chunks.documentId, documentRow.id));

  for (let index = 0; index < chunkRows.length; index += INSERT_BATCH_SIZE) {
    const batch = chunkRows.slice(index, index + INSERT_BATCH_SIZE);
    await db.insert(document_chunks).values(batch);
  }

  return {
    documentId: documentRow.id,
    chunkCount: chunkRows.length,
    embeddingModel: EMBEDDING_MODEL,
  };
}
