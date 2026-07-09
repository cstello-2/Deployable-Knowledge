// This module builds the knowledge graph from chunks already stored by the upstream RAG
// pipeline. It never reparses PDFs and never creates a second embedding/indexing system.

import { eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { document_chunks, documents } from "$lib/server/database/schema";
import { extractEntities } from "./entity-extractor";
import { GraphStore } from "./graph-store";
import { extractRelations } from "./relation-extractor";
import type { IndexedChunk } from "./types";
import { graphId, unique } from "./utils";

export type KnowledgeGraphIndex = {
  graph: GraphStore;
  chunksById: Map<string, IndexedChunk>;
  signature: string;
};

type CacheEntry = {
  index: KnowledgeGraphIndex;
};

// Cache the graph in the server process because thousands of pages are expensive to rebuild.
const graphCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 8;

export function invalidateKnowledgeGraphCache(): void {
  graphCache.clear();
}

export async function loadKnowledgeGraph(
  requestedDocumentIds: string[] = [],
): Promise<KnowledgeGraphIndex> {
  const documentIds = unique(requestedDocumentIds.map((id) => id.trim()).filter(Boolean)).sort();
  const cacheKey = documentIds.length ? documentIds.join("\u0000") : "*";

  // Read only document metadata first; it provides a cheap cache invalidation signature.
  const documentRows = documentIds.length
    ? await db
        .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt })
        .from(documents)
        .where(inArray(documents.id, documentIds))
    : await db
        .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt })
        .from(documents);

  const signature = documentRows
    .map((row) => `${row.id}:${row.updatedAt}`)
    .sort()
    .join("|");
  const cached = graphCache.get(cacheKey);
  if (cached?.index.signature === signature) return cached.index;

  const graph = new GraphStore();
  const chunksById = new Map<string, IndexedChunk>();
  const selectedIds = documentRows.map((row) => row.id);

  for (const document of documentRows) {
    graph.addNode({
      id: graphId("document", document.id),
      label: document.title,
      kind: "document",
      documentId: document.id,
    });
  }

  if (selectedIds.length) {
    const chunkRows = await db
      .select({
        chunkId: document_chunks.id,
        documentId: document_chunks.documentId,
        sourcePath: documents.sourcePath,
        sourceTitle: documents.title,
        pageIndex: document_chunks.pageIndex,
        chunkIndex: document_chunks.chunkIndex,
        chunkType: document_chunks.chunkType,
        content: document_chunks.content,
      })
      .from(document_chunks)
      .innerJoin(documents, eq(documents.id, document_chunks.documentId))
      .where(inArray(document_chunks.documentId, selectedIds));

    for (const row of chunkRows) {
      // IMAGE chunks contain OCR output in the upstream pipeline, so all stored types can
      // contribute evidence as long as they contain text.
      const chunk: IndexedChunk = {
        chunkId: row.chunkId,
        documentId: row.documentId,
        sourcePath: row.sourcePath,
        sourceTitle: row.sourceTitle,
        pageIndex: Number(row.pageIndex),
        chunkIndex: Number(row.chunkIndex),
        chunkType: row.chunkType as IndexedChunk["chunkType"],
        content: row.content,
      };
      chunksById.set(chunk.chunkId, chunk);
      addChunkToGraph(graph, chunk);
    }
  }

  const index = { graph, chunksById, signature };
  if (graphCache.size >= MAX_CACHE_ENTRIES) graphCache.clear();
  graphCache.set(cacheKey, { index });
  return index;
}

function addChunkToGraph(graph: GraphStore, chunk: IndexedChunk): void {
  const documentNodeId = graphId("document", chunk.documentId);
  const chunkNodeId = graphId("chunk", chunk.chunkId);

  graph.addNode({
    id: chunkNodeId,
    label: `${chunk.sourceTitle} page ${chunk.pageIndex + 1} chunk ${chunk.chunkIndex}`,
    kind: "chunk",
    documentId: chunk.documentId,
    chunkId: chunk.chunkId,
  });
  graph.addEdge({
    source: documentNodeId,
    target: chunkNodeId,
    relation: "CONTAINS",
    weight: 0.5,
    evidence: chunk.content,
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
  });

  const entities = extractEntities(chunk.content);
  for (const entity of entities) {
    const entityNodeId = graphId("entity", entity.label);
    graph.addNode({
      id: entityNodeId,
      label: entity.label,
      kind: "entity",
      entityKind: entity.kind,
    });
    graph.addEdge({
      source: chunkNodeId,
      target: entityNodeId,
      relation: "MENTIONS",
      weight: 1,
      evidence: chunk.content,
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
    });
  }

  for (const edge of extractRelations(
    chunk.chunkId,
    chunk.documentId,
    chunk.content,
    entities,
  )) {
    graph.addEdge(edge);
  }
}
