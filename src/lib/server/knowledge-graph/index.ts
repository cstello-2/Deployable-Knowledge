// Public server exports keep callers independent from the module's internal file layout.

export { invalidateKnowledgeGraphCache, loadKnowledgeGraph } from "./graph-index";
export {
  searchKnowledgeGraph,
  type KnowledgeGraphSearchOptions,
} from "./knowledge-graph-search";
export type {
  KnowledgeGraphMatch,
  KnowledgeGraphPath,
  KnowledgeGraphSearchResult,
} from "./types";
