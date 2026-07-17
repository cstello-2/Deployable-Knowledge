// Public server exports keep callers independent from the module's internal file layout.

export {
  KNOWLEDGE_GRAPH_BUILD_VERSION,
  KnowledgeGraphNoDocumentsError,
  KnowledgeGraphNotBuiltError,
  buildKnowledgeGraph,
  ensureKnowledgeGraph,
  ensureKnowledgeGraphForChunks,
  getBuiltKnowledgeGraph,
  getKnowledgeGraphStatus,
  invalidateKnowledgeGraphCache,
} from "./graph-index";
export type {
  BuildKnowledgeGraphOptions,
  KnowledgeGraphBuildState,
  KnowledgeGraphBuildStats,
  KnowledgeGraphIndex,
  KnowledgeGraphStatus,
} from "./graph-index";
export {
  searchKnowledgeGraph,
  type KnowledgeGraphSearchOptions,
} from "./knowledge-graph-search";
export type {
  KnowledgeGraphMatch,
  KnowledgeGraphPath,
  KnowledgeGraphSearchResult,
} from "./types";
