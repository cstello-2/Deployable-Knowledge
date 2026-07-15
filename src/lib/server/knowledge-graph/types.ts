// These types describe the small in-memory property graph built from stored RAG chunks.

import type {
  ScoredSearchMatch,
  SearchMatchBase,
  SearchResult,
} from "$lib/server/rag/search/search-shared";

export type NodeKind = "document" | "chunk" | "entity";

export type EntityKind =
  | "protocol"
  | "treatment"
  | "condition"
  | "system"
  | "organization"
  | "technology"
  | "concept"
  | "unknown"
  | string;

export type RelationType =
  | "CONTAINS"
  | "MENTIONS"
  | "CO_OCCURS_WITH"
  | "HAS_STEP"
  | "TREATS"
  | "USES"
  | "HAS_COMPONENT"
  | "DETECTS"
  | "OBSERVES"
  | "RELATED_TO"
  | string;

export type GraphNode = {
  id: string;
  label: string;
  kind: NodeKind;
  entityKind?: EntityKind;
  documentId?: string;
  chunkId?: string;
  chunkIds?: string[];
};

export type GraphEdge = {
  source: string;
  target: string;
  relation: RelationType;
  weight: number;
  evidence: string;
  chunkId?: string;
  documentId?: string;
};

export type GraphEvidence = {
  chunkId: string;
  score: number;
  matchedEntities: string[];
  relations: RelationType[];
};

export type KnowledgeGraphPath = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  score: number;
  chunkIds: string[];
};

export type KnowledgeGraphMatch = ScoredSearchMatch & {
  graphScore: number;
  hybridScore?: number;
  matchedEntities: string[];
  relations: RelationType[];
  pathCount: number;
};

export type KnowledgeGraphSearchResult = SearchResult<KnowledgeGraphMatch> & {
  paths: KnowledgeGraphPath[];
};

// Stored chunks already contain everything needed for citations except a search score.
export type IndexedChunk = SearchMatchBase;
