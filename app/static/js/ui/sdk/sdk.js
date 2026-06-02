// ui/sdk/sdk.js — browser-side SDK for Deployable Knowledge
const JSON_HEADERS = { "Accept": "application/json" };
const JSON_POST = { ...JSON_HEADERS, "Content-Type": "application/json" };

async function asJsonSafe(res) {
  const ct = res.headers.get("content-type") || "";
  const txt = await res.text();
  if (ct.includes("application/json")) {
    try { return JSON.parse(txt); } catch {}
  }
  const lines = txt.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  return { response: txt };
}

async function ok(res) {
  if (!res.ok) {
    const data = await asJsonSafe(res);
    const detail = typeof data?.detail === "string" ? data.detail : data?.response;
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return res;
}

export class DKClient {
  async chat({ message, session_id, persona="", inactive=[], template_id="rag_chat", top_k=8 }) {
    const fd = new FormData();
    fd.append("message", message);
    fd.append("session_id", session_id);
    fd.append("persona", persona);
    fd.append("inactive", JSON.stringify(inactive));
    fd.append("template_id", template_id);
    fd.append("top_k", String(top_k));
    const res = await ok(await fetch(`/chat?stream=false`, {
      method: "POST",
      body: fd,
      headers: JSON_HEADERS,
      credentials: "same-origin",
    }));
    return asJsonSafe(res);
  }

  async streamChat(req, { onMeta, onDelta, onDone, onError, signal } = {}) {
    const params = new URLSearchParams();
    params.set("message", req.message);
    params.set("session_id", req.session_id);
    params.set("persona", req.persona || "");
    if (req.inactive && req.inactive.length) params.set("inactive", JSON.stringify(req.inactive));
    params.set("template_id", req.template_id || "rag_chat");
    params.set("top_k", String(req.top_k ?? 8));
    const res = await ok(await fetch(`/chat?stream=true`, {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "text/event-stream",
      },
      credentials: "same-origin",
      signal,
    }));
    if (!res.body) throw new Error("No response body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = raw.split("\n");
        let event = "message";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        try { data = JSON.parse(data); } catch {}
        if (event === "meta" && onMeta) onMeta(data);
        else if (event === "delta" && onDelta) onDelta(data);
        else if (event === "done" && onDone) onDone(data);
        else if (event === "error" && onError) onError(data);
      }
    }
  }

  async listModelProviders(refresh = false) {
    const url = `/api/model-providers?refresh=${refresh ? "true" : "false"}`;

    const res = await ok(await fetch(url, {
      headers: JSON_HEADERS,
      credentials: "same-origin",
    }));

    return asJsonSafe(res);
  }
  
  async search(q, topK=5) {
    const res = await ok(await fetch(`/search?q=${encodeURIComponent(q)}&top_k=${encodeURIComponent(topK)}`, {
      headers: JSON_HEADERS,
      credentials: "same-origin",
    }));
    return asJsonSafe(res);
  }

  async listDocuments() {
    const res = await ok(await fetch("/documents", { headers: JSON_HEADERS, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async removeDocument(source) {
    const fd = new FormData();
    fd.append("source", source);
    const res = await ok(await fetch("/remove", { method: "POST", body: fd, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async uploadDocuments(files) {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    const res = await ok(await fetch("/upload", { method: "POST", body: fd, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async startUploadJob() {
    const res = await fetch("/upload/start", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: "{}",
    });

    return asJsonSafe(await ok(res));
  }

  uploadDocumentsWithProgress(files, jobId, { onUploadProgress } = {}) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();

      for (const file of files) {
        fd.append("files", file);
      }

      const xhr = new XMLHttpRequest();

      xhr.open("POST", `/upload-progress/${encodeURIComponent(jobId)}`, true);
      xhr.responseType = "text";
      xhr.withCredentials = true;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;

        if (onUploadProgress) {
          onUploadProgress({
            current: event.loaded,
            total: event.total,
            percent: event.total > 0 ? (event.loaded / event.total) * 100 : 0,
          });
        }
      };

      xhr.onload = () => {
        const fakeResponse = {
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          statusText: xhr.statusText,
          headers: {
            get(name) {
              if (String(name).toLowerCase() === "content-type") {
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
          asJsonSafe(fakeResponse)
            .then((data) => {
              const detail = typeof data?.detail === "string" ? data.detail : data?.response;
              reject(new Error(detail || `${xhr.status} ${xhr.statusText}`));
            })
            .catch(() => reject(new Error(`${xhr.status} ${xhr.statusText}`)));
          return;
        }

        asJsonSafe(fakeResponse).then(resolve).catch(reject);
      };

      xhr.onerror = () => {
        reject(new Error("Upload failed because the network request failed."));
      };

      xhr.onabort = () => {
        reject(new Error("Upload was canceled."));
      };

      xhr.send(fd);
    });
  }

  async listDirectory(path = "") {
    const relPath = String(path || "").replace(/^\/+|\/+$/g, "");
    const url = relPath
      ? `/directory/${relPath.split("/").map(encodeURIComponent).join("/")}`
      : "/directory";
    const res = await ok(await fetch(url, { headers: JSON_HEADERS, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async listFolders() {
    const res = await fetch("/folders", {
      headers: JSON_HEADERS,
      credentials: "same-origin",
    });
    return asJsonSafe(await ok(res));
  }

  async addFolder(path) {
    const res = await fetch("/folders/add", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify({ path }),
    });
    return asJsonSafe(await ok(res));
  }

  async syncFolder(path) {
    const res = await fetch("/folders/sync", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify({ path }),
    });
    return asJsonSafe(await ok(res));
  }
  async startFolderSync(path, registerFolder = false) {
    const res = await fetch("/folders/start-sync", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify({
        path,
        register_folder: registerFolder,
      }),
    });

    return asJsonSafe(await ok(res));
  }

  async getProgress(jobId) {
    const res = await fetch(`/progress/${encodeURIComponent(jobId)}`, {
      headers: JSON_HEADERS,
      credentials: "same-origin",
    });

    return asJsonSafe(await ok(res));
  }

  async removeFolder(path, removeSyncedDocuments = false) {
    const res = await fetch("/folders/remove", {
      method: "DELETE",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify({
        path,
        remove_synced_documents: removeSyncedDocuments,
      }),
    });
    return asJsonSafe(await ok(res));
  }

  async getCorpusTags() {
    const res = await ok(await fetch("/corpus/tags", { headers: JSON_HEADERS, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async setCorpusTags(tags) {
    const res = await ok(await fetch("/corpus/tags", {
      method: "PUT",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify({ tags }),
    }));
    return asJsonSafe(res);
  }

  async patchCorpusDocument({ source, tags, active }) {
    const body = { source };
    if (tags !== undefined) body.tags = tags;
    if (active !== undefined) body.active = active;
    const res = await ok(await fetch("/corpus/document", {
      method: "PATCH",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify(body),
    }));
    return asJsonSafe(res);
  }

  async corpusBulk(payload) {
    const res = await ok(await fetch("/corpus/bulk", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify(payload),
    }));
    return asJsonSafe(res);
  }

  async activateCorpusByTags(tags) {
    const res = await ok(await fetch("/corpus/activate-by-tags", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify({ tags }),
    }));
    return asJsonSafe(res);
  }

  async deactivateAllCorpus() {
    const res = await ok(await fetch("/corpus/deactivate-all", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: "{}",
    }));
    return asJsonSafe(res);
  }

  async clearCorpusAll() {
    const res = await ok(await fetch("/corpus/clear-all", {
      method: "POST",
      headers: JSON_POST,
      credentials: "same-origin",
      body: "{}",
    }));
    return asJsonSafe(res);
  }

  async listSessions() {
    const res = await ok(await fetch("/sessions", { headers: JSON_HEADERS, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async getSession(id) {
    const res = await ok(await fetch(`/sessions/${encodeURIComponent(id)}`, { headers: JSON_HEADERS, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async renameSession(id, title) {
    const res = await ok(await fetch(`/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: JSON_POST,
      credentials: "same-origin",
      body: JSON.stringify({ title }),
    }));
    return asJsonSafe(res);
  }

  async deleteSession(id) {
    const res = await ok(await fetch(`/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: JSON_HEADERS,
      credentials: "same-origin",
    }));
    return asJsonSafe(res);
  }

  async listSegments(source) {
    const url = source ? `/segments?source=${encodeURIComponent(source)}` : "/segments";
    const res = await ok(await fetch(url, { headers: JSON_HEADERS, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async getSegment(id) {
    const res = await ok(await fetch(`/segments/${encodeURIComponent(id)}`, { headers: JSON_HEADERS, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async removeSegment(id) {
    const res = await ok(await fetch(`/segments/${encodeURIComponent(id)}`, { method: "DELETE", headers: JSON_HEADERS, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async getOrCreateChatSession() {
    try {
      const res = await fetch("/session", { method: "POST", headers: JSON_HEADERS, credentials: "same-origin" });
      const data = await asJsonSafe(await ok(res));
      return data.session_id;
    } catch (e) {
      const res = await fetch("/session", { headers: JSON_HEADERS, credentials: "same-origin" });
      const data = await asJsonSafe(await ok(res));
      return data.session_id;
    }
  }

  async startNewSession() {
    const res = await ok(await fetch("/session", { method: "POST", headers: JSON_HEADERS, credentials: "same-origin" }));
    const data = await asJsonSafe(res);
    return data.session_id;
  }

  async getUser() {
    const res = await ok(await fetch("/user", { headers: JSON_HEADERS, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async getSettings(userId) {
    const res = await ok(await fetch(`/api/settings/${encodeURIComponent(userId)}`, { headers: JSON_HEADERS, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async listModelProviders(options = {}) {
    const refresh = typeof options === "boolean" ? options : Boolean(options?.refresh);
    const params = new URLSearchParams();
    if (refresh) params.set("refresh", "true");
    const query = params.toString();
    const url = `/api/model-providers${query ? `?${query}` : ""}`;
    const res = await ok(await fetch(url, {
      headers: JSON_HEADERS,
      credentials: "same-origin",
    }));
    return asJsonSafe(res);
  }

  async patchSettings(userId, payload) {
    const res = await ok(await fetch(`/api/settings/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    }));
    return asJsonSafe(res);
  }

  async listPromptTemplates() {
    const res = await ok(await fetch(`/api/prompt-templates`, { headers: JSON_HEADERS, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async getPromptTemplate(id) {
    const res = await ok(await fetch(`/api/prompt-templates/${encodeURIComponent(id)}`, { headers: JSON_HEADERS, credentials: "same-origin" }));
    return asJsonSafe(res);
  }

  async savePromptTemplate(id, payload) {
    const res = await ok(await fetch(`/api/prompt-templates/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { ...JSON_HEADERS, "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    }));
    return asJsonSafe(res);
  }

  async deletePromptTemplate(id) {
    const res = await ok(await fetch(`/api/prompt-templates/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: JSON_HEADERS,
      credentials: "same-origin",
    }));

    return asJsonSafe(res);
  }
}

export const dkClient = new DKClient();
