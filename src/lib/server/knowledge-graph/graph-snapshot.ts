import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { eq } from "drizzle-orm";
import { databaseClient, db } from "$lib/server/database/database";
import { knowledgeGraphSnapshots } from "$lib/server/database/schema";
import { GraphStore } from "./graph-store";
import type {
  KnowledgeGraphBuildScope,
  KnowledgeGraphBuildStats,
} from "./graph-build-registry";
import type { KnowledgeGraphIndex } from "./graph-index";
import type { GraphEdge, GraphNode, IndexedChunk } from "./types";

const SNAPSHOT_FORMAT_VERSION = 1;
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
let snapshotTablePromise: Promise<unknown> | null = null;

type SnapshotPayload = {
  formatVersion: typeof SNAPSHOT_FORMAT_VERSION;
  nodes: GraphNode[];
  edges: GraphEdge[];
  chunks: IndexedChunk[];
};

export type StoredKnowledgeGraphSnapshot = {
  signature: string;
  buildVersion: string;
  stats: KnowledgeGraphBuildStats;
  completedAt: string;
  index: KnowledgeGraphIndex | null;
};

export async function saveKnowledgeGraphSnapshot(
  scope: KnowledgeGraphBuildScope,
  index: KnowledgeGraphIndex,
  stats: KnowledgeGraphBuildStats,
): Promise<string> {
  await ensureSnapshotTable();
  const payload: SnapshotPayload = {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    nodes: [...index.graph.nodes.values()],
    edges: index.graph.edges,
    chunks: [...index.chunksById.values()],
  };
  const compressed = await gzipAsync(Buffer.from(JSON.stringify(payload), "utf8"));
  const now = new Date().toISOString();

  await db
    .insert(knowledgeGraphSnapshots)
    .values({
      scopeKey: scope.scopeKey,
      documentIds: scope.documentIds,
      signature: scope.signature,
      buildVersion: scope.buildVersion,
      payload: compressed,
      stats,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: knowledgeGraphSnapshots.scopeKey,
      set: {
        documentIds: scope.documentIds,
        signature: scope.signature,
        buildVersion: scope.buildVersion,
        payload: compressed,
        stats,
        updatedAt: now,
      },
    });

  return now;
}

export async function loadKnowledgeGraphSnapshot(
  scope: KnowledgeGraphBuildScope,
): Promise<StoredKnowledgeGraphSnapshot | null> {
  await ensureSnapshotTable();
  const row = await db
    .select()
    .from(knowledgeGraphSnapshots)
    .where(eq(knowledgeGraphSnapshots.scopeKey, scope.scopeKey))
    .get();
  if (!row) return null;

  const metadata = {
    signature: row.signature,
    buildVersion: row.buildVersion,
    stats: row.stats,
    completedAt: row.updatedAt,
  };
  if (row.signature !== scope.signature || row.buildVersion !== scope.buildVersion) {
    return { ...metadata, index: null };
  }

  try {
    const decoded = await gunzipAsync(row.payload);
    const payload = JSON.parse(decoded.toString("utf8")) as Partial<SnapshotPayload>;
    if (
      payload.formatVersion !== SNAPSHOT_FORMAT_VERSION ||
      !Array.isArray(payload.nodes) ||
      !Array.isArray(payload.edges) ||
      !Array.isArray(payload.chunks)
    ) {
      throw new Error("Unsupported Knowledge Graph snapshot format.");
    }

    const graph = new GraphStore();
    for (const node of payload.nodes) graph.addNode(node);
    for (const edge of payload.edges) graph.addEdge(edge);
    const chunksById = new Map(payload.chunks.map((chunk) => [chunk.chunkId, chunk]));
    return {
      ...metadata,
      index: { graph, chunksById, signature: row.signature },
    };
  } catch (error) {
    console.warn("Discarding an unreadable Knowledge Graph snapshot:", error);
    await db
      .delete(knowledgeGraphSnapshots)
      .where(eq(knowledgeGraphSnapshots.scopeKey, scope.scopeKey));
    return null;
  }
}

function ensureSnapshotTable(): Promise<unknown> {
  if (!snapshotTablePromise) {
    snapshotTablePromise = databaseClient.execute(`
      CREATE TABLE IF NOT EXISTS knowledge_graph_snapshots (
        scope_key TEXT PRIMARY KEY NOT NULL,
        document_ids TEXT NOT NULL,
        signature TEXT NOT NULL,
        build_version TEXT NOT NULL,
        payload BLOB NOT NULL,
        stats TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).catch((error) => {
      snapshotTablePromise = null;
      throw error;
    });
  }
  return snapshotTablePromise;
}
