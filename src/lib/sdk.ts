const JSON_HEADERS = { Accept: "application/json" } satisfies HeadersInit;
const JSON_POST = {
  ...JSON_HEADERS,
  "Content-Type": "application/json",
} satisfies HeadersInit;

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type FileCollection = ArrayLike<File> | Iterable<File>;

type JsonReadableResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
};

type ErrorBody = {
  detail?: unknown;
  response?: unknown;
};

export type StatusResponse = {
  status: string;
  [key: string]: unknown;
};

export type UserResponse = {
  user: string;
};

export type ChatRequest = {
  message: string;
  session_id: string;
  persona?: string;
  inactive?: string[];
  template_id?: string;
  top_k?: number;
  provider_id?: string;
  model_id?: string;
};

export type ChatResponse = {
  text?: string;
  response?: string;
  html_response?: string;
  sources?: unknown[];
  context?: unknown[];
  usage?: Record<string, unknown>;
  [key: string]: unknown;
};

export type StreamChatHandlers = {
  onMeta?: (data: unknown) => void;
  onDelta?: (data: unknown) => void;
  onDone?: (data: unknown) => void;
  onError?: (data: unknown) => void;
  signal?: AbortSignal;
};

export type SearchResult = {
  id?: string;
  source?: string;
  text?: string;
  score?: number;
  [key: string]: unknown;
};

export type SearchResponse = {
  results: SearchResult[];
};

export type DocumentSummary = {
  id?: string;
  title?: string;
  source?: string;
  segments?: number;
  segment_count?: number;
  tags?: string[];
  active?: boolean;
  [key: string]: unknown;
};

export type UploadResult = {
  filename: string;
  status: string;
  message?: string;
  [key: string]: unknown;
};

export type UploadResponse = {
  uploads?: UploadResult[];
  [key: string]: unknown;
};

export type UploadJobResponse = StatusResponse & {
  job_id: string;
};

export type UploadProgress = {
  current: number;
  total: number;
  percent: number;
};

export type UploadProgressOptions = {
  onUploadProgress?: (progress: UploadProgress) => void;
};

export type DirectoryItem = {
  name: string;
  path: string;
  absolute_path: string;
  kind: "folder" | "file" | string;
};

export type DirectoryResponse = {
  path: string;
  absolute_path: string;
  parent: string | null;
  items: DirectoryItem[];
};

export type FolderListResponse = {
  folders: string[];
  groups?: FolderGroup[];
  [key: string]: unknown;
};

export type FolderDocument = {
  source_path: string;
  source_name: string;
  has_segments: boolean;
  mtime_ns?: number | null;
  size?: number | null;
};

export type FolderGroup = {
  path: string;
  documents: FolderDocument[];
};

export type ProgressResponse = {
  status?: string;
  label?: string;
  phase?: string;
  current?: number;
  total?: number;
  percent?: number;
  message?: string;
  result?: unknown;
  error?: string;
  [key: string]: unknown;
};

export type CorpusTagsResponse = {
  approved_tags: string[];
};

export type CorpusDocumentPatch = {
  source: string;
  tags?: string[];
  active?: boolean;
};

export type CorpusBulkPayload = {
  sources: string[];
  add_tags?: string[];
  remove_tags?: string[];
  active?: boolean;
};

export type SessionSummary = {
  session_id: string;
  title: string;
  created_at: string;
};

export type SessionData = {
  session_id: string;
  created_at: string | null;
  summary: string;
  title: string;
  history: [string, string][];
};

export type SegmentSummary = {
  id: string;
  source?: string;
  preview?: string;
  priority?: string;
  [key: string]: unknown;
};

export type SegmentData = SegmentSummary & {
  text: string;
};

export type UserSettings = Record<string, unknown>;

export type ProviderModel = {
  id?: string;
  name?: string;
  label?: string;
  [key: string]: unknown;
};

export type ProviderRecord = {
  id: string;
  label?: string;
  models?: ProviderModel[];
  [key: string]: unknown;
};

export type ProvidersResponse = {
  providers: ProviderRecord[];
};

export type ProviderPatchPayload = {
  api_key?: string | null;
  [key: string]: unknown;
};

export type ProviderModelsResponse = {
  provider: ProviderRecord;
};

export type PromptTemplate = {
  id: string;
  name?: string;
  user_format?: string;
  system?: string;
  [key: string]: unknown;
};

function defaultFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, init);
}

function providerChatPath(providerId: string, modelId: string, stream = false) {
  if (!providerId || !modelId) {
    throw new Error("Chat requests require a provider and model.");
  }

  return `/${encodeURIComponent(providerId)}/${encodeURIComponent(modelId)}/${
    stream ? "chat-stream" : "chat"
  }`;
}

async function asJsonSafe<T>(response: JsonReadableResponse): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as T;
    } catch {
      // Some endpoints return JSON-looking text with a non-JSON content type.
    }
  }

  const lines = text.split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]) as T;
    } catch {
      // keep scanning
    }
  }

  return { response: text } as T;
}

function errorMessageFromBody(data: ErrorBody) {
  if (typeof data.detail === "string") {
    return data.detail;
  }

  if (typeof data.response === "string") {
    return looksLikeHtmlDocument(data.response) ? null : data.response;
  }

  return null;
}

function looksLikeHtmlDocument(value: string) {
  const text = value.trim().slice(0, 512).toLowerCase();
  return (
    text.startsWith("<!doctype html") ||
    text.startsWith("<html") ||
    text.includes("<script")
  );
}

async function ok<T extends JsonReadableResponse>(response: T): Promise<T> {
  if (!response.ok) {
    const data = await asJsonSafe<ErrorBody>(response);
    throw new Error(
      errorMessageFromBody(data) || `${response.status} ${response.statusText}`,
    );
  }

  return response;
}

export class DKClient {
  constructor(private readonly fetcher: Fetcher = defaultFetch) {}

  async chat({
    message,
    session_id,
    persona = "",
    inactive = [],
    template_id = "rag_chat",
    top_k = 8,
    provider_id = "",
    model_id = "",
  }: ChatRequest) {
    const form = new FormData();
    form.append("message", message);
    form.append("session_id", session_id);
    form.append("persona", persona);
    form.append("inactive", JSON.stringify(inactive));
    form.append("template_id", template_id);
    form.append("top_k", String(top_k));

    const response = await ok(
      await this.fetcher(providerChatPath(provider_id, model_id, false), {
        method: "POST",
        body: form,
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );
    return asJsonSafe<ChatResponse>(response);
  }

  async streamChat(
    request: ChatRequest,
    { onMeta, onDelta, onDone, onError, signal }: StreamChatHandlers = {},
  ) {
    const params = new URLSearchParams();
    params.set("message", request.message);
    params.set("session_id", request.session_id);
    params.set("persona", request.persona || "");
    params.set("inactive", JSON.stringify(request.inactive || []));
    params.set("template_id", request.template_id || "rag_chat");
    params.set("top_k", String(request.top_k ?? 8));

    const response = await ok(
      await this.fetcher(
        providerChatPath(
          request.provider_id || "",
          request.model_id || "",
          true,
        ),
        {
          method: "POST",
          body: params.toString(),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            Accept: "text/event-stream",
          },
          credentials: "same-origin",
          signal,
        },
      ),
    );

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let index: number;

      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const lines = raw.split("\n");
        let event = "message";
        let rawData = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            rawData += line.slice(5).trim();
          }
        }

        let data: unknown = rawData;
        try {
          data = JSON.parse(rawData);
        } catch {
          // SSE delta events are plain strings.
        }

        if (event === "meta" && onMeta) {
          onMeta(data);
        } else if (event === "delta" && onDelta) {
          onDelta(data);
        } else if (event === "done" && onDone) {
          onDone(data);
        } else if (event === "error" && onError) {
          onError(data);
        }
      }
    }
  }

  async search(q: string, topK = 5) {
    const response = await ok(
      await this.fetcher(
        `/search?q=${encodeURIComponent(q)}&top_k=${encodeURIComponent(topK)}`,
        {
          headers: JSON_HEADERS,
          credentials: "same-origin",
        },
      ),
    );
    return asJsonSafe<SearchResponse>(response);
  }

  async listDocuments() {
    const response = await ok(
      await this.fetcher("/documents", {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );
    return asJsonSafe<DocumentSummary[]>(response);
  }

  async removeDocument(source: string) {
    const form = new FormData();
    form.append("source", source);
    const response = await ok(
      await this.fetcher("/remove", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      }),
    );
    return asJsonSafe<StatusResponse>(response);
  }

  async uploadDocuments(files: FileCollection) {
    const form = new FormData();
    for (const file of Array.from(files)) {
      form.append("files", file);
    }

    const response = await ok(
      await this.fetcher("/upload", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      }),
    );
    return asJsonSafe<UploadResponse>(response);
  }

  async startUploadJob() {
    const response = await this.fetcher("/upload/start", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: "{}",
    });

    return asJsonSafe<UploadJobResponse>(await ok(response));
  }

  async startLocalFileUpload(path: string) {
    const response = await this.fetcher("/upload-local/start", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify({ path }),
    });

    return asJsonSafe<UploadJobResponse>(await ok(response));
  }

  uploadDocumentsWithProgress(
    files: FileCollection,
    jobId: string,
    { onUploadProgress }: UploadProgressOptions = {},
  ) {
    return new Promise<UploadResponse>((resolve, reject) => {
      const form = new FormData();

      for (const file of Array.from(files)) {
        form.append("files", file);
      }

      const xhr = new XMLHttpRequest();

      xhr.open("POST", `/upload-progress/${encodeURIComponent(jobId)}`, true);
      xhr.responseType = "text";
      xhr.withCredentials = true;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }

        onUploadProgress?.({
          current: event.loaded,
          total: event.total,
          percent: event.total > 0 ? (event.loaded / event.total) * 100 : 0,
        });
      };

      xhr.onload = () => {
        const fakeResponse: JsonReadableResponse = {
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          statusText: xhr.statusText,
          headers: {
            get(name: string) {
              if (name.toLowerCase() === "content-type") {
                return xhr.getResponseHeader("content-type") || "";
              }

              return xhr.getResponseHeader(name);
            },
          },
          async text() {
            return xhr.responseText || "";
          },
        };

        if (!fakeResponse.ok) {
          asJsonSafe<ErrorBody>(fakeResponse)
            .then((data) => {
              reject(
                new Error(
                  errorMessageFromBody(data) ||
                    `${xhr.status} ${xhr.statusText}`,
                ),
              );
            })
            .catch(() => reject(new Error(`${xhr.status} ${xhr.statusText}`)));
          return;
        }

        asJsonSafe<UploadResponse>(fakeResponse).then(resolve).catch(reject);
      };

      xhr.onerror = () => {
        reject(new Error("Upload failed because the network request failed."));
      };

      xhr.onabort = () => {
        reject(new Error("Upload was canceled."));
      };

      xhr.send(form);
    });
  }

  async listDirectory(path = "") {
    const relPath = String(path || "").replace(/^\/+|\/+$/g, "");
    const url = relPath
      ? `/directory/${relPath.split("/").map(encodeURIComponent).join("/")}`
      : "/directory";
    const response = await ok(
      await this.fetcher(url, {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );
    return asJsonSafe<DirectoryResponse>(response);
  }

  async listFolders() {
    const response = await this.fetcher("/folders", {
      headers: JSON_HEADERS,
      credentials: "same-origin",
    });
    return asJsonSafe<FolderListResponse>(await ok(response));
  }

  async addFolder(path: string) {
    const response = await this.fetcher("/folders/add", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify({ path }),
    });
    return asJsonSafe<StatusResponse>(await ok(response));
  }

  async syncFolder(path: string) {
    const response = await this.fetcher("/folders/sync", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify({ path }),
    });
    return asJsonSafe<StatusResponse>(await ok(response));
  }

  async startFolderSync(path: string, registerFolder = false) {
    const response = await this.fetcher("/folders/start-sync", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify({
        path,
        register_folder: registerFolder,
      }),
    });

    return asJsonSafe<UploadJobResponse>(await ok(response));
  }

  async getProgress(jobId: string) {
    const response = await this.fetcher(
      `/progress/${encodeURIComponent(jobId)}`,
      {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      },
    );

    return asJsonSafe<ProgressResponse>(await ok(response));
  }

  async removeFolder(path: string, removeSyncedDocuments = false) {
    const response = await this.fetcher("/folders/remove", {
      method: "DELETE",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify({
        path,
        remove_synced_documents: removeSyncedDocuments,
      }),
    });
    return asJsonSafe<StatusResponse>(await ok(response));
  }

  async getCorpusTags() {
    const response = await ok(
      await this.fetcher("/corpus/tags", {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );
    return asJsonSafe<CorpusTagsResponse>(response);
  }

  async setCorpusTags(tags: string[]) {
    const response = await ok(
      await this.fetcher("/corpus/tags", {
        method: "PUT",
        headers: JSON_POST,
        credentials: "same-origin",
        body: JSON.stringify({ tags }),
      }),
    );
    return asJsonSafe<CorpusTagsResponse>(response);
  }

  async patchCorpusDocument({ source, tags, active }: CorpusDocumentPatch) {
    const body: CorpusDocumentPatch = { source };
    if (tags !== undefined) {
      body.tags = tags;
    }
    if (active !== undefined) {
      body.active = active;
    }

    const response = await ok(
      await this.fetcher("/corpus/document", {
        method: "PATCH",
        headers: JSON_POST,
        credentials: "same-origin",
        body: JSON.stringify(body),
      }),
    );
    return asJsonSafe<DocumentSummary>(response);
  }

  async corpusBulk(payload: CorpusBulkPayload) {
    const response = await ok(
      await this.fetcher("/corpus/bulk", {
        method: "POST",
        headers: JSON_POST,
        credentials: "same-origin",
        body: JSON.stringify(payload),
      }),
    );
    return asJsonSafe<StatusResponse & { updated: number }>(response);
  }

  async activateCorpusByTags(tags: string[]) {
    const response = await ok(
      await this.fetcher("/corpus/activate-by-tags", {
        method: "POST",
        headers: JSON_POST,
        credentials: "same-origin",
        body: JSON.stringify({ tags }),
      }),
    );
    return asJsonSafe<StatusResponse>(response);
  }

  async deactivateAllCorpus() {
    const response = await ok(
      await this.fetcher("/corpus/deactivate-all", {
        method: "POST",
        headers: JSON_POST,
        credentials: "same-origin",
        body: "{}",
      }),
    );
    return asJsonSafe<StatusResponse>(response);
  }

  async clearCorpusAll() {
    const response = await ok(
      await this.fetcher("/corpus/clear-all", {
        method: "POST",
        headers: JSON_POST,
        credentials: "same-origin",
        body: "{}",
      }),
    );
    return asJsonSafe<StatusResponse & { message?: string }>(response);
  }

  async listSessions() {
    const response = await ok(
      await this.fetcher("/sessions", {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );
    return asJsonSafe<SessionSummary[]>(response);
  }

  async getSession(id: string) {
    const response = await ok(
      await this.fetcher(`/sessions/${encodeURIComponent(id)}`, {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );
    return asJsonSafe<SessionData>(response);
  }

  async renameSession(id: string, title: string) {
    const response = await ok(
      await this.fetcher(`/sessions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: JSON_POST,
        credentials: "same-origin",
        body: JSON.stringify({ title }),
      }),
    );
    return asJsonSafe<StatusResponse & { session_id: string; title: string }>(
      response,
    );
  }

  async deleteSession(id: string) {
    const response = await ok(
      await this.fetcher(`/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );
    return asJsonSafe<StatusResponse & { session_id: string }>(response);
  }

  async listSegments(source?: string) {
    const url = source
      ? `/segments?source=${encodeURIComponent(source)}`
      : "/segments";
    const response = await ok(
      await this.fetcher(url, {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );
    return asJsonSafe<SegmentSummary[]>(response);
  }

  async getSegment(id: string) {
    const response = await ok(
      await this.fetcher(`/segments/${encodeURIComponent(id)}`, {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );
    return asJsonSafe<SegmentData>(response);
  }

  async removeSegment(id: string) {
    const response = await ok(
      await this.fetcher(`/segments/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );
    return asJsonSafe<StatusResponse>(response);
  }

  async getOrCreateChatSession() {
    try {
      const response = await this.fetcher("/session", {
        method: "POST",
        headers: JSON_HEADERS,
        credentials: "same-origin",
      });
      const data = await asJsonSafe<{ session_id: string }>(await ok(response));
      return data.session_id;
    } catch {
      const response = await this.fetcher("/session", {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      });
      const data = await asJsonSafe<{ session_id: string }>(await ok(response));
      return data.session_id;
    }
  }

  async ensureUserSession() {
    const response = await this.fetcher("/begin", {
      headers: JSON_HEADERS,
      credentials: "same-origin",
    });

    await ok(response);
  }

  async startNewSession() {
    const response = await ok(
      await this.fetcher("/session", {
        method: "POST",
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );

    const data = await asJsonSafe<{ session_id: string }>(response);

    return data.session_id;
  }

  async getUser() {
    const response = await ok(
      await this.fetcher("/user", {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );

    return asJsonSafe<UserResponse>(response);
  }

  async getSettings(userId: string) {
    const response = await ok(
      await this.fetcher(`/api/settings/${encodeURIComponent(userId)}`, {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );

    return asJsonSafe<UserSettings>(response);
  }

  async listProviders({ includeUnavailable = false, refresh = false } = {}) {
    const params = new URLSearchParams();
    if (includeUnavailable) {
      params.set("include_unavailable", "true");
    }
    if (refresh) {
      params.set("refresh", "true");
    }
    const query = params.toString();

    const response = await ok(
      await this.fetcher(`/providers${query ? `?${query}` : ""}`, {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );

    return asJsonSafe<ProvidersResponse>(response);
  }

  async patchProvider(providerId: string, payload: ProviderPatchPayload) {
    const response = await ok(
      await this.fetcher(`/providers/${encodeURIComponent(providerId)}`, {
        method: "PATCH",
        headers: JSON_POST,
        credentials: "same-origin",
        body: JSON.stringify(payload),
      }),
    );

    return asJsonSafe<ProviderRecord>(response);
  }

  async clearProviderApiKey(providerId: string) {
    const response = await ok(
      await this.fetcher(
        `/providers/${encodeURIComponent(providerId)}/api-key`,
        {
          method: "DELETE",
          headers: JSON_HEADERS,
          credentials: "same-origin",
        },
      ),
    );

    return asJsonSafe<ProviderRecord>(response);
  }

  async listProviderModels(providerId: string, refresh = false) {
    const response = await ok(
      await this.fetcher(
        `/${encodeURIComponent(providerId)}/models?refresh=${refresh ? "true" : "false"}`,
        {
          headers: JSON_HEADERS,
          credentials: "same-origin",
        },
      ),
    );

    return asJsonSafe<ProviderModelsResponse>(response);
  }

  async patchSettings(userId: string, payload: Record<string, unknown>) {
    const response = await ok(
      await this.fetcher(`/api/settings/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: JSON_POST,
        credentials: "same-origin",
        body: JSON.stringify(payload),
      }),
    );

    return asJsonSafe<UserSettings>(response);
  }

  async listPromptTemplates() {
    const response = await ok(
      await this.fetcher("/api/prompt-templates", {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );

    return asJsonSafe<PromptTemplate[]>(response);
  }

  async getPromptTemplate(id: string) {
    const response = await ok(
      await this.fetcher(`/api/prompt-templates/${encodeURIComponent(id)}`, {
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );

    return asJsonSafe<PromptTemplate>(response);
  }

  async savePromptTemplate(id: string, payload: PromptTemplate) {
    const response = await ok(
      await this.fetcher(`/api/prompt-templates/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: JSON_POST,
        credentials: "same-origin",
        body: JSON.stringify(payload),
      }),
    );

    return asJsonSafe<StatusResponse>(response);
  }

  async deletePromptTemplate(id: string) {
    const response = await ok(
      await this.fetcher(`/api/prompt-templates/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: JSON_HEADERS,
        credentials: "same-origin",
      }),
    );

    return asJsonSafe<StatusResponse & { id?: string }>(response);
  }
}

export const dkClient = new DKClient();
