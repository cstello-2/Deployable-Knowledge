import { get, writable } from "svelte/store";

export type KnowledgeGraphBuildStatus =
  | "not_built"
  | "building"
  | "built"
  | "failed";

export type KnowledgeGraphClientStatus =
  | "unknown"
  | "checking"
  | "unavailable"
  | KnowledgeGraphBuildStatus;

export type KnowledgeGraphStats = {
  documents: number;
  chunks: number;
  nodes: number;
  edges: number;
};

export type KnowledgeGraphStatusResponse = {
  status: KnowledgeGraphBuildStatus;
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
  stats: KnowledgeGraphStats | null;
};

export type KnowledgeGraphClientState = Omit<
  KnowledgeGraphStatusResponse,
  "status"
> & {
  status: KnowledgeGraphClientStatus;
  requestKey: string;
  requestedDocumentIds: string[];
  message: string | null;
};

type ErrorResponse = {
  code?: unknown;
  message?: unknown;
  error?: unknown;
};

function emptyState(
  requestedDocumentIds: string[],
  status: KnowledgeGraphClientStatus = "unknown",
): KnowledgeGraphClientState {
  const requestKey = knowledgeGraphScopeKey(requestedDocumentIds);

  return {
    status,
    requestKey,
    requestedDocumentIds,
    scopeKey: requestKey,
    documentIds: [],
    documentCount: 0,
    currentSignature: "",
    builtSignature: null,
    needsRebuild: false,
    buildVersion: "",
    startedAt: null,
    completedAt: null,
    error: null,
    stats: null,
    message: null,
  };
}

export const knowledgeGraphState = writable<KnowledgeGraphClientState>(
  emptyState([]),
);

let requestGeneration = 0;
let activeStatusRequest:
  | {
      requestKey: string;
      id: symbol;
      controller: AbortController;
      promise: Promise<KnowledgeGraphClientState>;
    }
  | undefined;
let activeBuildRequest:
  | {
      requestKey: string;
      id: symbol;
      promise: Promise<KnowledgeGraphClientState>;
    }
  | undefined;
let statusPollTimer: ReturnType<typeof setTimeout> | undefined;

export function normalizeDocumentIds(documentIds: readonly string[]): string[] {
  return [...new Set(documentIds.map((id) => id.trim()).filter(Boolean))].sort();
}

export function knowledgeGraphScopeKey(documentIds: readonly string[]): string {
  const normalized = normalizeDocumentIds(documentIds);
  return normalized.length ? normalized.join("\u0000") : "*";
}

export function knowledgeGraphStateMatches(
  state: KnowledgeGraphClientState,
  documentIds: readonly string[],
): boolean {
  return state.requestKey === knowledgeGraphScopeKey(documentIds);
}

export function isKnowledgeGraphReady(
  state: KnowledgeGraphClientState,
  documentIds: readonly string[],
): boolean {
  return (
    knowledgeGraphStateMatches(state, documentIds) &&
    state.status === "built" &&
    !state.needsRebuild
  );
}

function statusEndpoint(documentIds: readonly string[]): string {
  const params = new URLSearchParams();
  for (const id of normalizeDocumentIds(documentIds)) {
    params.append("documentIds", id);
  }

  const query = params.toString();
  return query ? `/knowledge-graph?${query}` : "/knowledge-graph";
}

function clearStatusPoll() {
  if (statusPollTimer) clearTimeout(statusPollTimer);
  statusPollTimer = undefined;
}

function scheduleStatusPoll(documentIds: string[], generation: number) {
  clearStatusPoll();
  statusPollTimer = setTimeout(() => {
    statusPollTimer = undefined;
    if (generation === requestGeneration) {
      void refreshKnowledgeGraphStatus(documentIds);
    }
  }, 1000);
}

function isBuildStatus(value: unknown): value is KnowledgeGraphBuildStatus {
  return (
    value === "not_built" ||
    value === "building" ||
    value === "built" ||
    value === "failed"
  );
}

function parseStatusResponse(
  value: unknown,
  requestedDocumentIds: string[],
): KnowledgeGraphClientState {
  if (!value || typeof value !== "object") {
    throw new Error("Knowledge Graph returned an invalid status response.");
  }

  const response = value as Partial<KnowledgeGraphStatusResponse>;
  if (!isBuildStatus(response.status)) {
    throw new Error("Knowledge Graph returned an invalid build status.");
  }

  const base = emptyState(requestedDocumentIds, response.status);
  return {
    ...base,
    status: response.status,
    scopeKey:
      typeof response.scopeKey === "string" ? response.scopeKey : base.scopeKey,
    documentIds: Array.isArray(response.documentIds)
      ? normalizeDocumentIds(
          response.documentIds.filter((id): id is string => typeof id === "string"),
        )
      : [],
    documentCount:
      typeof response.documentCount === "number" ? response.documentCount : 0,
    currentSignature:
      typeof response.currentSignature === "string"
        ? response.currentSignature
        : "",
    builtSignature:
      typeof response.builtSignature === "string"
        ? response.builtSignature
        : null,
    needsRebuild: response.needsRebuild === true,
    buildVersion:
      typeof response.buildVersion === "string" ? response.buildVersion : "",
    startedAt:
      typeof response.startedAt === "string" ? response.startedAt : null,
    completedAt:
      typeof response.completedAt === "string" ? response.completedAt : null,
    error: typeof response.error === "string" ? response.error : null,
    stats:
      response.stats && typeof response.stats === "object"
        ? response.stats as KnowledgeGraphStats
        : null,
  };
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ErrorResponse;
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Fall back to the status text when the server did not return JSON.
  }

  return response.statusText || `Request failed (${response.status})`;
}

export function refreshKnowledgeGraphStatus(
  documentIds: readonly string[],
): Promise<KnowledgeGraphClientState> {
  const requestedDocumentIds = normalizeDocumentIds(documentIds);
  const requestKey = knowledgeGraphScopeKey(requestedDocumentIds);

  if (activeBuildRequest?.requestKey === requestKey) {
    return activeBuildRequest.promise;
  }

  if (activeStatusRequest?.requestKey === requestKey) {
    return activeStatusRequest.promise;
  }

  clearStatusPoll();
  activeStatusRequest?.controller.abort();
  const controller = new AbortController();
  const requestId = Symbol(requestKey);
  const generation = ++requestGeneration;
  knowledgeGraphState.set(emptyState(requestedDocumentIds, "checking"));

  const promise = (async () => {
    try {
      const response = await fetch(statusEndpoint(requestedDocumentIds), {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(await responseError(response));
      }

      const state = parseStatusResponse(await response.json(), requestedDocumentIds);
      if (generation === requestGeneration) {
        knowledgeGraphState.set(state);
        if (state.status === "building") {
          scheduleStatusPoll(requestedDocumentIds, generation);
        }
      }
      return state;
    } catch (error) {
      if (controller.signal.aborted) return get(knowledgeGraphState);

      const state = emptyState(requestedDocumentIds, "unavailable");
      state.message = error instanceof Error
        ? error.message
        : "Knowledge Graph status is unavailable.";
      if (generation === requestGeneration) knowledgeGraphState.set(state);
      return state;
    } finally {
      if (activeStatusRequest?.id === requestId) {
        activeStatusRequest = undefined;
      }
    }
  })();

  activeStatusRequest = { requestKey, id: requestId, controller, promise };
  return promise;
}

export function buildKnowledgeGraph(
  documentIds: readonly string[],
  options: { force?: boolean } = {},
): Promise<KnowledgeGraphClientState> {
  const requestedDocumentIds = normalizeDocumentIds(documentIds);
  const requestKey = knowledgeGraphScopeKey(requestedDocumentIds);
  if (activeBuildRequest?.requestKey === requestKey) {
    return activeBuildRequest.promise;
  }

  clearStatusPoll();
  const generation = ++requestGeneration;
  const requestId = Symbol(requestKey);
  activeStatusRequest?.controller.abort();
  activeStatusRequest = undefined;
  knowledgeGraphState.set(emptyState(requestedDocumentIds, "building"));

  const promise = (async () => {
    try {
      const response = await fetch("/knowledge-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: requestedDocumentIds,
          force: options.force === true,
        }),
      });

      if (!response.ok) {
        throw new Error(await responseError(response));
      }

      const state = parseStatusResponse(await response.json(), requestedDocumentIds);
      if (state.status === "failed") {
        throw new Error(state.error || "Knowledge Graph build failed.");
      }

      if (generation === requestGeneration) knowledgeGraphState.set(state);
      return state;
    } catch (error) {
      const state = emptyState(requestedDocumentIds, "failed");
      state.error = error instanceof Error
        ? error.message
        : "Knowledge Graph build failed.";
      state.message = state.error;
      if (generation === requestGeneration) knowledgeGraphState.set(state);
      throw error;
    } finally {
      if (activeBuildRequest?.id === requestId) {
        activeBuildRequest = undefined;
      }
    }
  })();

  activeBuildRequest = { requestKey, id: requestId, promise };
  return promise;
}
