import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  graph_edges,
  graph_nodes,
  type NewGraphEdgeRow,
  type NewGraphNodeRow,
} from "$lib/server/database/schema";
import type { ParsedChunk } from "$lib/server/rag/chunk/parse-shared";
import { extractChunkEntitiesAndRelations } from "./gliner-extractor";
import { graphId, sanitizeEntityLabel, unique } from "./utils";

const INSERT_BATCH_SIZE = 100;

export type TripletBuildResult = {
  nodes: number;
  edges: number;
};

type NodeDraft = NewGraphNodeRow;
type EdgeDraft = NewGraphEdgeRow;

export async function rebuildDocumentTriplets(
  documentId: string,
  chunks: ParsedChunk[],
): Promise<TripletBuildResult> {
  const now = new Date().toISOString();
  const nodes = new Map<string, NodeDraft>();
  const edges = new Map<string, EdgeDraft>();
  const source = chunks[0]?.source;

  await clearDocumentTriplets(documentId);

  if (!source || chunks.length === 0) {
    return { nodes: 0, edges: 0 };
  }

  addNode(nodes, {
    id: graphId("document", documentId),
    label: source.title,
    kind: "document",
    documentId,
    chunkId: null,
    chunkIds: null,
    entityKind: null,
    createdAt: now,
    updatedAt: now,
  });

  for (const chunk of chunks) {
    const chunkNodeId = graphId("chunk", chunk.chunkId);
    addNode(nodes, {
      id: chunkNodeId,
      label: `${source.title} page ${chunk.pageIndex + 1} chunk ${chunk.chunkIndex}`,
      kind: "chunk",
      documentId,
      chunkId: chunk.chunkId,
      chunkIds: null,
      entityKind: null,
      createdAt: now,
      updatedAt: now,
    });
    addEdge(edges, {
      id: edgeId(graphId("document", documentId), chunkNodeId, "CONTAINS", chunk.chunkId),
      source: graphId("document", documentId),
      target: chunkNodeId,
      relation: "CONTAINS",
      weight: 0.5,
      evidence: chunk.content,
      documentId,
      chunkId: chunk.chunkId,
      createdAt: now,
    });

    const { entities, relations } = await extractChunkEntitiesAndRelations(
      chunk.content,
      [],
      chunk.chunkId,
    );

    for (const entity of entities) {
      const label = sanitizeEntityLabel(entity.label);
      if (!label) continue;
      const entityNodeId = storedEntityId(documentId, label);
      const existing = nodes.get(entityNodeId);
      addNode(nodes, {
        id: entityNodeId,
        label,
        kind: "entity",
        entityKind: entity.kind || "concept",
        documentId,
        chunkId: null,
        chunkIds: unique([...(existing?.chunkIds ?? []), chunk.chunkId]),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      addEdge(edges, {
        id: edgeId(chunkNodeId, entityNodeId, "MENTIONS", chunk.chunkId),
        source: chunkNodeId,
        target: entityNodeId,
        relation: "MENTIONS",
        weight: 1,
        evidence: chunk.content,
        documentId,
        chunkId: chunk.chunkId,
        createdAt: now,
      });
    }

    for (const relation of relations) {
      const sourceLabel = sanitizeEntityLabel(relation.source);
      const targetLabel = sanitizeEntityLabel(relation.target);
      if (!sourceLabel || !targetLabel) continue;
      const sourceNodeId = storedEntityId(documentId, sourceLabel);
      const targetNodeId = storedEntityId(documentId, targetLabel);

      addEntityIfMissing(nodes, sourceNodeId, sourceLabel, documentId, chunk.chunkId, now);
      addEntityIfMissing(nodes, targetNodeId, targetLabel, documentId, chunk.chunkId, now);
      addEdge(edges, {
        id: edgeId(sourceNodeId, targetNodeId, relation.relation || "RELATED_TO", chunk.chunkId),
        source: sourceNodeId,
        target: targetNodeId,
        relation: relation.relation || "RELATED_TO",
        weight: 1,
        evidence: relation.evidence ?? chunk.content,
        documentId,
        chunkId: chunk.chunkId,
        createdAt: now,
      });
    }
  }

  await insertBatches(graph_nodes, [...nodes.values()]);
  await insertBatches(graph_edges, [...edges.values()]);

  return { nodes: nodes.size, edges: edges.size };
}

async function clearDocumentTriplets(documentId: string): Promise<void> {
  await db.delete(graph_edges).where(eq(graph_edges.documentId, documentId));
  await db
    .delete(graph_nodes)
    .where(and(eq(graph_nodes.documentId, documentId), eq(graph_nodes.kind, "entity")));
  await db.delete(graph_nodes).where(eq(graph_nodes.documentId, documentId));
}

function addNode(nodes: Map<string, NodeDraft>, node: NodeDraft): void {
  const existing = nodes.get(node.id);
  nodes.set(node.id, {
    ...existing,
    ...node,
    chunkIds: unique([...(existing?.chunkIds ?? []), ...(node.chunkIds ?? [])]),
    entityKind: preferEntityKind(existing?.entityKind, node.entityKind),
  });
}

function preferEntityKind(existing?: string | null, next?: string | null): string | null | undefined {
  if (!existing || existing === "unknown" || existing === "concept") return next ?? existing;
  if (!next || next === "unknown" || next === "concept") return existing;
  return existing;
}

function addEntityIfMissing(
  nodes: Map<string, NodeDraft>,
  id: string,
  label: string,
  documentId: string,
  chunkId: string,
  now: string,
): void {
  const existing = nodes.get(id);
  addNode(nodes, {
    id,
    label,
    kind: "entity",
    entityKind: existing?.entityKind ?? "concept",
    documentId,
    chunkId: null,
    chunkIds: unique([...(existing?.chunkIds ?? []), chunkId]),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

function addEdge(edges: Map<string, EdgeDraft>, edge: EdgeDraft): void {
  if (edge.source === edge.target) return;
  edges.set(edge.id, edge);
}

async function insertBatches<T extends Record<string, unknown>>(
  table: typeof graph_nodes | typeof graph_edges,
  rows: T[],
): Promise<void> {
  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + INSERT_BATCH_SIZE);
    if (batch.length) await db.insert(table as never).values(batch as never);
  }
}

function edgeId(source: string, target: string, relation: string, chunkId?: string): string {
  return createHash("sha256")
    .update(`${source}\u0000${target}\u0000${relation}\u0000${chunkId ?? ""}`)
    .digest("hex");
}

function storedEntityId(documentId: string, label: string): string {
  return graphId("entity", `${documentId}:${label}`);
}
