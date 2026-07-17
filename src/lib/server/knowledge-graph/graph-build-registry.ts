export type KnowledgeGraphBuildState = "not_built" | "building" | "built" | "failed";

export type KnowledgeGraphBuildStats = {
  documents: number;
  chunks: number;
  nodes: number;
  edges: number;
};

export type KnowledgeGraphBuildScope = {
  scopeKey: string;
  documentIds: string[];
  documentCount: number;
  signature: string;
  buildVersion: string;
};

export type KnowledgeGraphStatus = {
  status: KnowledgeGraphBuildState;
  scopeKey: string;
  documentIds: string[];
  documentCount: number;
  currentSignature: string;
  builtSignature: string | null;
  needsRebuild: boolean;
  buildVersion: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  stats: KnowledgeGraphBuildStats | null;
};

type BuildResult<Index> = {
  index: Index;
  stats: KnowledgeGraphBuildStats;
};

type RegistryEntry<Index> = {
  signature: string;
  documentIds: string[];
  status: Exclude<KnowledgeGraphBuildState, "not_built">;
  index: Index | null;
  stats: KnowledgeGraphBuildStats | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  promise: Promise<BuildResult<Index>> | null;
};

// This registry owns lifecycle state independently from database and graph construction.
// Keeping it separate makes concurrency, failure, and staleness behavior testable without
// loading documents or building a real graph.
export class KnowledgeGraphBuildRegistry<Index> {
  private readonly entries = new Map<string, RegistryEntry<Index>>();

  constructor(private readonly maxEntries = 8) {}

  getStatus(scope: KnowledgeGraphBuildScope): KnowledgeGraphStatus {
    const entry = this.entries.get(scope.scopeKey);
    if (!entry) return notBuiltStatus(scope, false);

    if (entry.signature !== scope.signature) {
      return {
        ...notBuiltStatus(scope, true),
        builtSignature: entry.status === "built" ? entry.signature : null,
        completedAt: entry.completedAt,
        stats: entry.status === "built" ? entry.stats : null,
      };
    }

    return {
      status: entry.status,
      scopeKey: scope.scopeKey,
      documentIds: [...scope.documentIds],
      documentCount: scope.documentCount,
      currentSignature: scope.signature,
      builtSignature: entry.status === "built" ? entry.signature : null,
      needsRebuild: false,
      buildVersion: scope.buildVersion,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
      error: entry.error,
      stats: entry.stats,
    };
  }

  getBuilt(scope: KnowledgeGraphBuildScope): Index | undefined {
    const entry = this.entries.get(scope.scopeKey);
    if (entry?.status !== "built" || entry.signature !== scope.signature || !entry.index) {
      return undefined;
    }

    // Refresh insertion order so eviction behaves like a small LRU cache.
    this.entries.delete(scope.scopeKey);
    this.entries.set(scope.scopeKey, entry);
    return entry.index;
  }

  restore(
    scope: KnowledgeGraphBuildScope,
    result: BuildResult<Index>,
    completedAt: string,
  ): void {
    const existing = this.entries.get(scope.scopeKey);
    if (existing?.status === "building") return;
    if (existing?.status === "built" && existing.signature === scope.signature && existing.index) {
      return;
    }

    this.insert(scope.scopeKey, {
      signature: scope.signature,
      documentIds: [...scope.documentIds],
      status: "built",
      index: result.index,
      stats: result.stats,
      startedAt: completedAt,
      completedAt,
      error: null,
      promise: null,
    });
  }

  rememberStaleSnapshot(
    scope: KnowledgeGraphBuildScope,
    storedSignature: string,
    stats: KnowledgeGraphBuildStats,
    completedAt: string,
  ): void {
    if (this.entries.has(scope.scopeKey)) return;
    this.insert(scope.scopeKey, {
      signature: storedSignature,
      documentIds: [...scope.documentIds],
      status: "built",
      index: null,
      stats,
      startedAt: completedAt,
      completedAt,
      error: null,
      promise: null,
    });
  }

  async build(
    scope: KnowledgeGraphBuildScope,
    builder: () => Promise<BuildResult<Index>>,
    force = false,
  ): Promise<KnowledgeGraphStatus> {
    const existing = this.entries.get(scope.scopeKey);
    if (existing?.signature === scope.signature) {
      if (existing.status === "built" && !force) return this.getStatus(scope);
      if (existing.status === "building" && existing.promise) {
        await settle(existing.promise);
        return this.getStatus(scope);
      }
    }

    const startedAt = new Date().toISOString();
    const entry: RegistryEntry<Index> = {
      signature: scope.signature,
      documentIds: [...scope.documentIds],
      status: "building",
      index: null,
      stats: null,
      startedAt,
      completedAt: null,
      error: null,
      promise: null,
    };

    const promise = Promise.resolve()
      .then(builder)
      .then((result) => {
        if (this.entries.get(scope.scopeKey) === entry) {
          entry.status = "built";
          entry.index = result.index;
          entry.stats = result.stats;
          entry.completedAt = new Date().toISOString();
          entry.promise = null;
        }
        return result;
      })
      .catch((error: unknown) => {
        if (this.entries.get(scope.scopeKey) === entry) {
          entry.status = "failed";
          entry.error = errorMessage(error);
          entry.completedAt = new Date().toISOString();
          entry.promise = null;
        }
        throw error;
      });

    entry.promise = promise;
    this.insert(scope.scopeKey, entry);
    await settle(promise);
    return this.getStatus(scope);
  }

  clear(): void {
    this.entries.clear();
  }

  invalidateDocuments(documentIds: readonly string[]): void {
    const ids = new Set(documentIds);
    if (!ids.size) {
      this.clear();
      return;
    }

    for (const [scopeKey, entry] of this.entries) {
      if (scopeKey === "*" || entry.documentIds.some((id) => ids.has(id))) {
        this.entries.delete(scopeKey);
      }
    }
  }

  private insert(scopeKey: string, entry: RegistryEntry<Index>): void {
    if (!this.entries.has(scopeKey) && this.entries.size >= this.maxEntries) {
      const evictable = [...this.entries].find(([, candidate]) => candidate.status !== "building");
      if (evictable) this.entries.delete(evictable[0]);
    }
    this.entries.set(scopeKey, entry);
  }
}

function notBuiltStatus(
  scope: KnowledgeGraphBuildScope,
  needsRebuild: boolean,
): KnowledgeGraphStatus {
  return {
    status: "not_built",
    scopeKey: scope.scopeKey,
    documentIds: [...scope.documentIds],
    documentCount: scope.documentCount,
    currentSignature: scope.signature,
    builtSignature: null,
    needsRebuild,
    buildVersion: scope.buildVersion,
    startedAt: null,
    completedAt: null,
    error: null,
    stats: null,
  };
}

async function settle(value: Promise<unknown>): Promise<void> {
  try {
    await value;
  } catch {
    // Failure details remain in the registry and are returned by getStatus.
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "Knowledge Graph construction failed.";
}
