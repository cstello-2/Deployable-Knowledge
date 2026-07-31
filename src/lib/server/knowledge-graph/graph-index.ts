// This module builds the knowledge graph from chunks already stored by the upstream RAG
// pipeline. It never reparses PDFs and never creates a second embedding/indexing system.

import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { document_chunks, documents } from "$lib/server/database/schema";
import {
  extractChunkEntitiesAndRelations,
  resolveEntityLabels,
} from "./gliner-extractor";
import {
  KnowledgeGraphBuildRegistry,
  type KnowledgeGraphBuildScope,
  type KnowledgeGraphStatus,
} from "./graph-build-registry";
import { GraphStore } from "./graph-store";
import {
  loadKnowledgeGraphSnapshot,
  saveKnowledgeGraphSnapshot,
} from "./graph-snapshot";
import type { IndexedChunk } from "./types";
import { graphId, sanitizeEntityLabel, unique } from "./utils";
import { isUsefulImageText } from "$lib/server/rag/chunk/ocr-text-quality";

export type {
  KnowledgeGraphBuildState,
  KnowledgeGraphBuildStats,
  KnowledgeGraphStatus,
} from "./graph-build-registry";

// Bump this when entity extraction, relation extraction, or graph construction changes.
// Query-only settings such as topK and maxDepth do not require a rebuild.
export const KNOWLEDGE_GRAPH_BUILD_VERSION = "3";

export type KnowledgeGraphIndex = {
  graph: GraphStore;
  chunksById: Map<string, IndexedChunk>;
  signature: string;
};

type DocumentMetadata = {
  id: string;
  title: string;
  updatedAt: string;
};

type ResolvedGraphScope = {
  documentRows: DocumentMetadata[];
  buildScope: KnowledgeGraphBuildScope;
  chunkRows?: IndexedChunk[];
};

export type BuildKnowledgeGraphOptions = {
  force?: boolean;
};

const graphRegistry = new KnowledgeGraphBuildRegistry<KnowledgeGraphIndex>(8);
const snapshotRestorePromises = new Map<string, Promise<void>>();

export class KnowledgeGraphNotBuiltError extends Error {
  readonly code = "KNOWLEDGE_GRAPH_NOT_BUILT";

  constructor(readonly graphStatus: KnowledgeGraphStatus) {
    super(unavailableMessage(graphStatus));
    this.name = "KnowledgeGraphNotBuiltError";
  }
}

export class KnowledgeGraphNoDocumentsError extends Error {
  readonly code = "KNOWLEDGE_GRAPH_NO_DOCUMENTS";

  constructor(readonly graphStatus: KnowledgeGraphStatus) {
    super(
      graphStatus.scopeKey === "*"
        ? "Upload a document before building the Knowledge Graph."
        : "None of the selected documents are available for Knowledge Graph construction.",
    );
    this.name = "KnowledgeGraphNoDocumentsError";
  }
}

export function invalidateKnowledgeGraphCache(documentIds: string[] = []): void {
  graphRegistry.invalidateDocuments(normalizeDocumentIds(documentIds));
}

export async function getKnowledgeGraphStatus(
  requestedDocumentIds: string[] = [],
): Promise<KnowledgeGraphStatus> {
  const scope = await resolveGraphScope(requestedDocumentIds);
  requireDocuments(scope);
  await restoreKnowledgeGraphSnapshot(scope);
  return graphRegistry.getStatus(scope.buildScope);
}

export async function buildKnowledgeGraph(
  requestedDocumentIds: string[] = [],
  options: BuildKnowledgeGraphOptions = {},
): Promise<KnowledgeGraphStatus> {
  const normalizedIds = normalizeDocumentIds(requestedDocumentIds);
  const scope = await resolveGraphScope(normalizedIds);
  requireDocuments(scope);

  await graphRegistry.build(
    scope.buildScope,
    async () => {
      const index = await constructKnowledgeGraph(scope);

      // Do not publish a graph if its documents changed while construction was running.
      const latestScope = await resolveGraphScope(normalizedIds);
      if (latestScope.buildScope.signature !== scope.buildScope.signature) {
        throw new Error("Documents changed while the Knowledge Graph was building. Build it again.");
      }

      const graphStats = index.graph.stats();
      const stats = {
        documents: scope.documentRows.length,
        chunks: index.chunksById.size,
        nodes: graphStats.nodes,
        edges: graphStats.edges,
      };
      await saveKnowledgeGraphSnapshot(scope.buildScope, index, stats);
      return {
        index,
        stats,
      };
    },
    options.force === true,
  );

  return getKnowledgeGraphStatus(normalizedIds);
}

export async function getBuiltKnowledgeGraph(
  requestedDocumentIds: string[] = [],
): Promise<KnowledgeGraphIndex> {
  const scope = await resolveGraphScope(requestedDocumentIds);
  requireDocuments(scope);
  await restoreKnowledgeGraphSnapshot(scope);
  const index = graphRegistry.getBuilt(scope.buildScope);
  if (!index) throw new KnowledgeGraphNotBuiltError(graphRegistry.getStatus(scope.buildScope));
  return index;
}

// Graph-mode requests lazily ensure that the selected-document index exists. The
// registry reuses a current graph, shares an in-flight build, and rebuilds only
// when the document signature or graph build version has changed.
export async function ensureKnowledgeGraph(
  requestedDocumentIds: string[] = [],
): Promise<KnowledgeGraphIndex> {
  try {
    return await getBuiltKnowledgeGraph(requestedDocumentIds);
  } catch (error) {
    if (!(error instanceof KnowledgeGraphNotBuiltError)) throw error;
  }

  await buildKnowledgeGraph(requestedDocumentIds);
  return getBuiltKnowledgeGraph(requestedDocumentIds);
}

export async function ensureKnowledgeGraphForChunks(
  requestedChunkIds: string[],
): Promise<KnowledgeGraphIndex> {
  const chunkIds = normalizeChunkIds(requestedChunkIds);
  const scope = await resolveChunkGraphScope(chunkIds);
  requireDocuments(scope);
  await restoreKnowledgeGraphSnapshot(scope);

  const built = graphRegistry.getBuilt(scope.buildScope);
  if (built) return built;

  await graphRegistry.build(scope.buildScope, async () => {
    const index = await constructKnowledgeGraph(scope);
    const graphStats = index.graph.stats();
    const stats = {
      documents: scope.documentRows.length,
      chunks: index.chunksById.size,
      nodes: graphStats.nodes,
      edges: graphStats.edges,
    };
    await saveKnowledgeGraphSnapshot(scope.buildScope, index, stats);
    return { index, stats };
  });

  const index = graphRegistry.getBuilt(scope.buildScope);
  if (!index) {
    throw new KnowledgeGraphNotBuiltError(graphRegistry.getStatus(scope.buildScope));
  }
  return index;
}

async function restoreKnowledgeGraphSnapshot(scope: ResolvedGraphScope): Promise<void> {
  if (graphRegistry.getBuilt(scope.buildScope)) return;

  const existing = snapshotRestorePromises.get(scope.buildScope.scopeKey);
  if (existing) return existing;

  const restore = (async () => {
    const snapshot = await loadKnowledgeGraphSnapshot(scope.buildScope);
    if (!snapshot) return;
    if (snapshot.index) {
      graphRegistry.restore(
        scope.buildScope,
        { index: snapshot.index, stats: snapshot.stats },
        snapshot.completedAt,
      );
      return;
    }

    graphRegistry.rememberStaleSnapshot(
      scope.buildScope,
      snapshot.signature,
      snapshot.stats,
      snapshot.completedAt,
    );
  })().finally(() => {
    snapshotRestorePromises.delete(scope.buildScope.scopeKey);
  });
  snapshotRestorePromises.set(scope.buildScope.scopeKey, restore);
  return restore;
}

async function resolveGraphScope(
  requestedDocumentIds: string[] = [],
): Promise<ResolvedGraphScope> {
  const documentIds = normalizeDocumentIds(requestedDocumentIds);
  const allRows = await db
    .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt })
    .from(documents);
  const selectedIds = new Set(documentIds);
  const rows = documentIds.length
    ? allRows.filter((row) => selectedIds.has(String(row.id)))
    : allRows;
  const documentRows = rows
    .map((row) => ({
      id: String(row.id),
      title: String(row.title),
      updatedAt: String(row.updatedAt),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const signature = graphSignature(documentRows);
  const usesAllDocuments = documentRows.length === allRows.length;

  return {
    documentRows,
    buildScope: {
      // Empty selection and explicitly selecting every document are the same scope.
      scopeKey: graphScopeKey(usesAllDocuments ? [] : documentIds),
      documentIds: documentRows.map((row) => row.id),
      documentCount: documentRows.length,
      signature,
      buildVersion: KNOWLEDGE_GRAPH_BUILD_VERSION,
    },
  };
}

async function resolveChunkGraphScope(
  requestedChunkIds: string[],
): Promise<ResolvedGraphScope> {
  const chunkIds = normalizeChunkIds(requestedChunkIds);
  if (!chunkIds.length) {
    return {
      documentRows: [],
      chunkRows: [],
      buildScope: {
        scopeKey: "chunks:empty",
        documentIds: [],
        documentCount: 0,
        signature: chunkGraphSignature([]),
        buildVersion: KNOWLEDGE_GRAPH_BUILD_VERSION,
      },
    };
  }

  const rows = await db
    .select({
      chunkId: document_chunks.id,
      documentId: document_chunks.documentId,
      sourcePath: documents.sourcePath,
      sourceType: documents.sourceType,
      sourceTitle: documents.title,
      documentUpdatedAt: documents.updatedAt,
      pageIndex: document_chunks.pageIndex,
      chunkIndex: document_chunks.chunkIndex,
      chunkType: document_chunks.chunkType,
      content: document_chunks.content,
    })
    .from(document_chunks)
    .innerJoin(documents, eq(documents.id, document_chunks.documentId))
    .where(inArray(document_chunks.id, chunkIds));

  const order = new Map(chunkIds.map((chunkId, index) => [chunkId, index]));
  const chunkRows: IndexedChunk[] = rows
    .filter(
      (row) =>
        row.chunkType !== "IMAGE" || isUsefulImageText(row.content),
    )
    .map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      sourcePath: row.sourcePath,
      sourceType: row.sourceType,
      sourceTitle: row.sourceTitle,
      pageIndex: Number(row.pageIndex),
      chunkIndex: Number(row.chunkIndex),
      chunkType: row.chunkType as IndexedChunk["chunkType"],
      content: row.content,
    }))
    .sort((left, right) =>
      (order.get(left.chunkId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.chunkId) ?? Number.MAX_SAFE_INTEGER)
    );
  const documentRows = [...new Map(rows.map((row) => [
    row.documentId,
    {
      id: row.documentId,
      title: row.sourceTitle,
      updatedAt: row.documentUpdatedAt,
    },
  ])).values()].sort((left, right) => left.id.localeCompare(right.id));
  const resolvedChunkIds = chunkRows.map((chunk) => chunk.chunkId);

  return {
    documentRows,
    chunkRows,
    buildScope: {
      scopeKey: chunkGraphScopeKey(resolvedChunkIds),
      documentIds: documentRows.map((document) => document.id),
      documentCount: documentRows.length,
      signature: chunkGraphSignature(chunkRows),
      buildVersion: KNOWLEDGE_GRAPH_BUILD_VERSION,
    },
  };
}

async function constructKnowledgeGraph(scope: ResolvedGraphScope): Promise<KnowledgeGraphIndex> {
  const { documentRows } = scope;

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

  if (scope.chunkRows) {
    for (const chunk of scope.chunkRows) {
      chunksById.set(chunk.chunkId, chunk);
      await addChunkToGraph(graph, chunk);
    }
  } else if (selectedIds.length) {
    const chunkRows = await db
      .select({
        chunkId: document_chunks.id,
        documentId: document_chunks.documentId,
        sourcePath: documents.sourcePath,
        sourceType: documents.sourceType,
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
      if (
        row.chunkType === "IMAGE" &&
        !isUsefulImageText(row.content)
      ) {
        continue;
      }
      const chunk: IndexedChunk = {
        chunkId: row.chunkId,
        documentId: row.documentId,
        sourcePath: row.sourcePath,
        sourceType: row.sourceType,
        sourceTitle: row.sourceTitle,
        pageIndex: Number(row.pageIndex),
        chunkIndex: Number(row.chunkIndex),
        chunkType: row.chunkType as IndexedChunk["chunkType"],
        content: row.content,
      };
      chunksById.set(chunk.chunkId, chunk);
      await addChunkToGraph(graph, chunk);
    }
  }

  return { graph, chunksById, signature: scope.buildScope.signature };
}

function normalizeDocumentIds(documentIds: readonly string[]): string[] {
  return unique(documentIds.map((id) => id.trim()).filter(Boolean)).sort();
}

function normalizeChunkIds(chunkIds: readonly string[]): string[] {
  return unique(chunkIds.map((id) => id.trim()).filter(Boolean));
}

function graphScopeKey(documentIds: readonly string[]): string {
  if (!documentIds.length) return "*";
  const digest = createHash("sha256").update(documentIds.join("\u0000")).digest("hex");
  return `documents:${digest}`;
}

function chunkGraphScopeKey(chunkIds: readonly string[]): string {
  const digest = createHash("sha256").update(chunkIds.join("\u0000")).digest("hex");
  return `chunks:${digest}`;
}

function chunkGraphSignature(chunks: readonly IndexedChunk[]): string {
  const hash = createHash("sha256");
  hash.update(KNOWLEDGE_GRAPH_BUILD_VERSION);
  for (const chunk of chunks) {
    hash.update("\u0000");
    hash.update(chunk.chunkId);
    hash.update("\u0000");
    hash.update(chunk.documentId);
    hash.update("\u0000");
    hash.update(chunk.content);
  }
  return hash.digest("hex");
}

function graphSignature(documentRows: readonly DocumentMetadata[]): string {
  const hash = createHash("sha256");
  hash.update(KNOWLEDGE_GRAPH_BUILD_VERSION);
  for (const document of documentRows) {
    hash.update("\u0000");
    hash.update(document.id);
    hash.update("\u0000");
    hash.update(document.updatedAt);
    hash.update("\u0000");
    hash.update(document.title);
  }
  return hash.digest("hex");
}

function requireDocuments(scope: ResolvedGraphScope): void {
  if (scope.documentRows.length) return;
  throw new KnowledgeGraphNoDocumentsError(graphRegistry.getStatus(scope.buildScope));
}

function unavailableMessage(status: KnowledgeGraphStatus): string {
  if (status.status === "building") return "The Knowledge Graph is still building.";
  if (status.status === "failed") {
    return status.error
      ? `The Knowledge Graph build failed: ${status.error}`
      : "The Knowledge Graph build failed. Build it again before asking a graph question.";
  }
  if (status.needsRebuild) {
    return "The selected documents or graph configuration changed. Rebuild the Knowledge Graph before asking a graph question.";
  }
  return "Build the Knowledge Graph before asking a graph question.";
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
  candidateChunkIds?: string[],
): Promise<GraphStore> {
  const augmented = cloneGraph(graph);
  const normalizedLabels = resolveEntityLabels(labels);
  const candidates = candidateChunkIds?.length
    ? candidateChunkIds.flatMap((chunkId) => {
        const chunk = chunksById.get(chunkId);
        return chunk ? [chunk] : [];
      })
    : [...chunksById.values()];

  for (const chunk of candidates) {
    const { entities, relations } = await extractChunkEntitiesAndRelations(chunk.content, normalizedLabels, chunk.chunkId);
    const chunkNodeId = graphId("chunk", chunk.chunkId);

    for (const entity of entities) {
      const label = sanitizeEntityLabel(entity.label);
      if (!label) continue;
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
