// This module builds the knowledge graph from chunks already stored by the upstream RAG
// pipeline. It never reparses PDFs and never creates a second embedding/indexing system.

import { eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { document_chunks, documents, graph_edges, graph_nodes } from "$lib/server/database/schema";
import { extractChunkEntitiesAndRelations, resolveEntityLabels } from "./gliner-extractor";
import { GraphStore } from "./graph-store";
import type { IndexedChunk } from "./types";
import { graphId, sanitizeEntityLabel, unique } from "./utils";

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
    }

    if (!(await loadStoredGraph(graph, selectedIds))) {
      for (const chunk of chunksById.values()) {
        await addChunkToGraph(graph, chunk);
      }
    }
  }

  const index = { graph, chunksById, signature };
  if (graphCache.size >= MAX_CACHE_ENTRIES) graphCache.clear();
  graphCache.set(cacheKey, { index });
  return index;
}

async function loadStoredGraph(graph: GraphStore, documentIds: string[]): Promise<boolean> {
  const nodeRows = await db
    .select()
    .from(graph_nodes)
    .where(inArray(graph_nodes.documentId, documentIds));

  if (nodeRows.length === 0) return false;

  for (const node of nodeRows) {
    graph.addNode({
      id: node.id,
      label: node.label,
      kind: node.kind,
      entityKind: node.entityKind ?? undefined,
      documentId: node.documentId ?? undefined,
      chunkId: node.chunkId ?? undefined,
      chunkIds: node.chunkIds ?? undefined,
    });
  }

  const edgeRows = await db
    .select()
    .from(graph_edges)
    .where(inArray(graph_edges.documentId, documentIds));

  for (const edge of edgeRows) {
    graph.addEdge({
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      weight: Number(edge.weight),
      evidence: edge.evidence,
      documentId: edge.documentId ?? undefined,
      chunkId: edge.chunkId ?? undefined,
    });
  }

  return true;
}

async function addChunkToGraph(graph: GraphStore, chunk: IndexedChunk): Promise<void> {
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

  const { entities, relations } = await extractChunkEntitiesAndRelations(chunk.content, [], chunk.chunkId);

  for (const entity of entities) {
    const label = sanitizeEntityLabel(entity.label);
    if (!label) continue;
    upsertEntityNode(graph, { ...entity, label }, chunk.chunkId);
    const entityNodeId = graphId("entity", label);
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

  for (const relation of relations) {
    const sourceLabel = sanitizeEntityLabel(relation.source);
    const targetLabel = sanitizeEntityLabel(relation.target);
    if (!sourceLabel || !targetLabel) continue;

    const sourceNodeId = graphId("entity", sourceLabel);
    const targetNodeId = graphId("entity", targetLabel);

    graph.addNode({
      id: sourceNodeId,
      label: sourceLabel,
      kind: "entity",
      entityKind: "unknown",
    });
    graph.addNode({
      id: targetNodeId,
      label: targetLabel,
      kind: "entity",
      entityKind: "unknown",
    });

    graph.addEdge({
      source: sourceNodeId,
      target: targetNodeId,
      relation: relation.relation || "RELATED_TO",
      weight: 1,
      evidence: relation.evidence ?? chunk.content,
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
    });
  }
}

export async function augmentGraphWithQueryLabels(
  graph: GraphStore,
  chunksById: Map<string, IndexedChunk>,
  labels: string[],
): Promise<GraphStore> {
  const augmented = cloneGraph(graph);
  const normalizedLabels = resolveEntityLabels(labels);
  const corpusEntities = new Set<string>();

  for (const chunk of chunksById.values()) {
    const { entities, relations } = await extractChunkEntitiesAndRelations(chunk.content, normalizedLabels, chunk.chunkId);
    const chunkNodeId = graphId("chunk", chunk.chunkId);

    // fish
    //if (entities.length > 0) {
    //  console.log(`[gliner] chunk ents:`, entities.map((entity) => entity.label));
    //}

    for (const entity of entities) {
      const label = sanitizeEntityLabel(entity.label);
      if (!label) continue;
      corpusEntities.add(label);
      upsertEntityNode(augmented, { ...entity, label }, chunk.chunkId);
      const entityNodeId = graphId("entity", label);
      augmented.addEdge({
        source: chunkNodeId,
        target: entityNodeId,
        relation: "MENTIONS",
        weight: 1,
        evidence: chunk.content,
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
      });
    }

    for (const relation of relations) {
      const sourceLabel = sanitizeEntityLabel(relation.source);
      const targetLabel = sanitizeEntityLabel(relation.target);
      if (!sourceLabel || !targetLabel) continue;
      corpusEntities.add(sourceLabel);
      corpusEntities.add(targetLabel);
      const sourceNodeId = graphId("entity", sourceLabel);
      const targetNodeId = graphId("entity", targetLabel);
      augmented.addNode({
        id: sourceNodeId,
        label: sourceLabel,
        kind: "entity",
        entityKind: "unknown",
      });
      augmented.addNode({
        id: targetNodeId,
        label: targetLabel,
        kind: "entity",
        entityKind: "unknown",
      });
      augmented.addEdge({
        source: sourceNodeId,
        target: targetNodeId,
        relation: relation.relation || "RELATED_TO",
        weight: 1,
        evidence: relation.evidence ?? chunk.content,
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
      });
    }
  }

  if (corpusEntities.size > 0) {
    console.log("Corpus chunk entities:", Array.from(corpusEntities).sort());
  }
  return augmented;
}

function cloneGraph(graph: GraphStore): GraphStore {
  const copy = new GraphStore();
  for (const node of graph.nodes.values()) {
    copy.addNode(node);
  }
  for (const edge of graph.edges) {
    copy.addEdge(edge);
  }
  return copy;
}

function upsertEntityNode(
  graph: GraphStore,
  entity: { label: string; kind: string; chunkIds?: string[] },
  chunkId?: string,
): void {
  const nodeId = graphId("entity", entity.label);
  const existing = graph.getNode(nodeId);
  const mergedChunkIds = unique([...(existing?.chunkIds ?? []), ...(entity.chunkIds ?? []), ...(chunkId ? [chunkId] : [])]);

  const nextNode = {
    id: nodeId,
    label: entity.label,
    kind: "entity" as const,
    entityKind: entity.kind,
    chunkIds: mergedChunkIds.length ? mergedChunkIds : undefined,
  };

  if (existing) {
    graph.nodes.set(nodeId, { ...existing, ...nextNode });
    return;
  }

  graph.addNode(nextNode);
}
