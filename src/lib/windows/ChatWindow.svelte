<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import {
    assistantRuntime,
    getActivePersona,
    loadAssistantRuntime,
  } from "$lib/assistantState";
  import BaseWindow from "$lib/components/BaseWindow.svelte";
  import { errorMessage } from "$lib/errors";
  import {
    currentSession,
    currentSessionId,
    refreshSessions,
    startNewSession,
  } from "$lib/sessionState";
  import { dkClient, type ChatResponse, type DocumentSummary } from "$lib/sdk";
  import type { WindowInstanceProps } from "./index.ts";

  type Role = "you" | "assistant";
  type ChatSource = Record<string, unknown>;
  type ChatMessage = {
    id: number;
    role: Role;
    text: string;
    html?: string;
    pending?: boolean;
    sources?: ChatSource[];
  };
  let {
    id,
    title,
    closable = false,
    height = null,
    collapsed = false,
    onToggleCollapse = () => {},
    onClose = () => {},
  }: WindowInstanceProps = $props();

  let logElement = $state<HTMLDivElement | null>(null);
  let draft = $state("");
  let messages = $state<ChatMessage[]>([]);
  let busy = $state(false);
  let status = $state("");
  let activeSessionId = $state<string | null>(null);
  let loadedHistorySessionId = $state<string | null>(null);

  let aborter: AbortController | null = null;
  let nextMessageId = 1;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  onMount(() => {
    loadAssistantRuntime().catch((error) => {
      status = errorMessage(error);
    });
  });

  onDestroy(() => {
    aborter?.abort();
  });

  $effect(() => {
    const sessionId = $currentSessionId;
    if (!sessionId || sessionId === activeSessionId) return;

    const loadedSession = $currentSession;
    if (
      loadedSession?.session_id === sessionId &&
      loadedHistorySessionId !== sessionId
    ) {
      messages = historyMessages(loadedSession.history || []);
      loadedHistorySessionId = sessionId;
    } else if (activeSessionId !== null) {
      messages = [assistantMessage("New chat started. How can I help?")];
      loadedHistorySessionId = null;
    }
    activeSessionId = sessionId;
  });

  $effect(() => {
    const session = $currentSession;
    if (!session || session.session_id === loadedHistorySessionId) return;

    messages = historyMessages(session.history || []);
    activeSessionId = session.session_id;
    loadedHistorySessionId = session.session_id;
  });

  $effect(() => {
    messages;
    void tick().then(scrollToBottom);
  });

  function scrollToBottom() {
    if (!logElement) return;
    logElement.scrollTop = logElement.scrollHeight;
  }

  function userMessage(text: string): ChatMessage {
    return {
      id: nextMessageId++,
      role: "you",
      text,
    };
  }

  function assistantMessage(
    text: string,
    sources: ChatSource[] = [],
  ): ChatMessage {
    return {
      id: nextMessageId++,
      role: "assistant",
      text,
      html: renderMarkdown(text),
      sources,
    };
  }

  function historyMessages(history: [string, string][]) {
    return history.flatMap(([user, assistant]) => [
      userMessage(user),
      assistantMessage(assistant),
    ]);
  }

  function pendingAssistantMessage(): ChatMessage {
    return {
      id: nextMessageId++,
      role: "assistant",
      text: "",
      pending: true,
    };
  }

  function updateMessage(messageId: number, patch: Partial<ChatMessage>) {
    messages = messages.map((message) =>
      message.id === messageId ? { ...message, ...patch } : message,
    );
  }

  function removeMessage(messageId: number) {
    messages = messages.filter((message) => message.id !== messageId);
  }

  function escapeHtml(value = "") {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttribute(value = "") {
    return escapeHtml(value).replaceAll("`", "&#96;");
  }

  function renderInlineMarkdown(value: string) {
    return value
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (_match, label: string, href: string) =>
          `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`,
      )
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  }

  function renderMarkdown(value = "") {
    const escaped = escapeHtml(value.trim());
    if (!escaped) return "";

    const chunks = escaped.split(/(```[\s\S]*?```)/g);

    return chunks
      .map((chunk) => {
        if (chunk.startsWith("```") && chunk.endsWith("```")) {
          const code = chunk
            .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
            .replace(/```$/, "");
          return `<pre><code>${code}</code></pre>`;
        }

        return chunk
          .split(/\n{2,}/)
          .map((block) => {
            const lines = block.split("\n");
            if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
              return `<ul>${lines
                .map(
                  (line) =>
                    `<li>${renderInlineMarkdown(line.trim().slice(2))}</li>`,
                )
                .join("")}</ul>`;
            }

            return `<p>${renderInlineMarkdown(lines.join("<br>"))}</p>`;
          })
          .join("");
      })
      .join("");
  }

  function docId(doc: DocumentSummary) {
    return String(doc.id ?? doc.title ?? doc.source ?? "").trim();
  }

  async function inactiveDocuments() {
    try {
      const docs = await dkClient.listDocuments();
      return docs
        .filter((doc) => doc.active === false)
        .map(docId)
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function readPersona() {
    return getActivePersona();
  }

  function extractSources(data: unknown) {
    if (!data || typeof data !== "object") return [];
    const record = data as Record<string, unknown>;
    const sources = record.sources ?? record.context;
    return Array.isArray(sources)
      ? sources.filter(
          (source): source is ChatSource =>
            Boolean(source) && typeof source === "object",
        )
      : [];
  }

  function responseText(response: ChatResponse) {
    return String(response.text || response.response || "(no response)");
  }

  function responseSources(response: ChatResponse) {
    return extractSources(response);
  }

  async function send() {
    if (busy) return;

    const text = draft.trim();
    if (!text) return;
    if (!$currentSessionId) {
      status = "Session is still starting. Try again in a moment.";
      return;
    }
    let runtime = $assistantRuntime;
    if (!runtime.providerId || !runtime.modelId) {
      try {
        runtime = await loadAssistantRuntime({ force: true });
      } catch (error) {
        status = errorMessage(error);
      }
    }
    if (!runtime.providerId || !runtime.modelId) {
      status = runtime.error || "Assistant model is not configured.";
      return;
    }

    busy = true;
    status = "";
    draft = "";
    messages = [...messages, userMessage(text)];
    const assistant = pendingAssistantMessage();
    messages = [...messages, assistant];

    aborter?.abort();
    aborter = new AbortController();
    let buffer = "";

    const request = {
      message: text,
      session_id: $currentSessionId,
      inactive: await inactiveDocuments(),
      persona: readPersona(),
      template_id: runtime.templateId,
      top_k: runtime.topK,
      provider_id: runtime.providerId,
      model_id: runtime.modelId,
    };

    try {
      await dkClient.streamChat(request, {
        signal: aborter.signal,
        onDelta(delta) {
          buffer += String(delta ?? "");
          updateMessage(assistant.id, {
            text: buffer,
            html: renderMarkdown(buffer),
            pending: false,
          });
        },
        onDone(data) {
          const textValue = buffer || "(no response)";
          updateMessage(assistant.id, {
            text: textValue,
            html: renderMarkdown(textValue),
            pending: false,
            sources: extractSources(data).slice(0, 5),
          });
        },
        onError(data) {
          const message =
            data && typeof data === "object" && "error" in data
              ? String((data as { error?: unknown }).error)
              : "Stream failed";
          updateMessage(assistant.id, {
            text: message,
            html: `<em>Error:</em> ${escapeHtml(message)}`,
            pending: false,
          });
        },
      });
      await refreshSessions().catch(() => {});
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (!buffer) removeMessage(assistant.id);
        return;
      }

      try {
        const response = await dkClient.chat(request);
        const textValue = responseText(response);
        updateMessage(assistant.id, {
          text: textValue,
          html: renderMarkdown(textValue),
          pending: false,
          sources: responseSources(response).slice(0, 5),
        });
        await refreshSessions().catch(() => {});
      } catch (fallbackError) {
        const message = errorMessage(fallbackError);
        updateMessage(assistant.id, {
          text: message,
          html: `<em>Error:</em> ${escapeHtml(message)}`,
          pending: false,
        });
      }
    } finally {
      busy = false;
      aborter = null;
    }
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void send();
  }

  async function createNewChat() {
    if (busy) return;
    try {
      await startNewSession();
    } catch (error) {
      status = errorMessage(error);
    }
  }

  function isSegmentKey(value: unknown) {
    return UUID_RE.test(String(value || ""));
  }

  function sourceText(source: ChatSource, key: string, fallback = "") {
    const value = source[key];
    return value === undefined || value === null ? fallback : String(value);
  }

  function sourceKind(source: ChatSource) {
    const text = sourceText(source, "text").trim();
    if (text.startsWith("[Image:") || text.startsWith("[OCR:")) return "Image";
    return sourceText(source, "kind", "Text");
  }

  function sourceId(source: ChatSource) {
    return source.segment_id ?? source.id;
  }

  function sourceName(source: ChatSource) {
    return sourceText(
      source,
      "source",
      sourceText(source, "title", sourceText(source, "filepath", "source")),
    );
  }

  function sourceHref(source: ChatSource) {
    const segmentId = sourceId(source);
    if (isSegmentKey(segmentId)) {
      return `/static/doc_at.html?segment=${encodeURIComponent(String(segmentId))}`;
    }

    const name = sourceName(source);
    return name ? `/documents/${encodeURIComponent(name)}` : "";
  }

  function truncateText(text: string, maxChars = 320) {
    return text.length <= maxChars
      ? text
      : `${text.slice(0, maxChars).trimEnd()}...`;
  }

  function sourcePreview(source: ChatSource) {
    return truncateText(
      sourceText(source, "text")
        .replace(/^\[(Image|OCR):\s*/i, "")
        .replace(/\]$/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }

  function angularSimilarityPercent(source: ChatSource) {
    const cosine = Number(source.score);
    if (!Number.isFinite(cosine)) return null;

    const clampedCosine = Math.max(-1, Math.min(1, cosine));
    const angularSimilarity = 1 - Math.acos(clampedCosine) / Math.PI;
    return Math.max(0, Math.min(100, angularSimilarity * 100));
  }

  function sourceDescription(source: ChatSource) {
    const page = source.page ?? null;
    const pageText = page && page !== "?" ? `, page ${page}` : "";
    const preview = sourcePreview(source);
    const previewText = preview ? `: ${sourceName(source)} ${preview}` : "";
    return `${sourceKind(source)} from ${sourceName(source)}${pageText}${previewText}`;
  }

  function sourceScoreLabel(source: ChatSource) {
    const percent = angularSimilarityPercent(source);
    return percent === null ? "n/a" : `${percent.toFixed(1)}%`;
  }
</script>

<BaseWindow
  {id}
  {title}
  {closable}
  {height}
  {collapsed}
  {onToggleCollapse}
  {onClose}
  contentLabel="Assistant chat"
>
  <div class="chat-window">
    {#if status || $assistantRuntime.error}
      <div class="chat-status li-subtle">
        {status || $assistantRuntime.error}
      </div>
    {/if}

    <div class="chat-log" bind:this={logElement} aria-live="polite">
      {#if !messages.length}
        <div class="msg assistant">
          <div class="msg-md">Ask a question about your documents.</div>
        </div>
      {/if}

      {#each messages as message (message.id)}
        <div
          class="msg"
          class:you={message.role === "you"}
          class:assistant={message.role === "assistant"}
        >
          {#if message.role === "you"}
            {message.text}
          {:else if message.pending}
            <div class="msg-md msg-pending" role="status" aria-live="polite">
              <span class="typing-indicator" aria-hidden="true">
                <span></span><span></span><span></span>
              </span>
              <span class="typing-text">Generating response...</span>
            </div>
          {:else}
            <div class="msg-md">{@html message.html || ""}</div>
            {#if message.sources?.length}
              <div class="msg-citations">
                <div class="msg-citations-label">Sources</div>
                <ol class="chat-source-list">
                  {#each message.sources as source, index}
                    {@const href = sourceHref(source)}
                    {@const percent = angularSimilarityPercent(source)}
                    <li class="chat-source-row">
                      <div class="chat-source-main">
                        <div class="chat-source-text-block">
                          <span class="chat-source-num">{index + 1}.</span>
                          <span class="chat-source-text"
                            >{sourceDescription(source)}</span
                          >
                        </div>
                        <div class="chat-source-action-line">
                          <div class="chat-source-action-left">
                            {#if href}
                              <a
                                class="btn btn-sm chat-source-btn"
                                {href}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {sourceName(source)}
                              </a>
                            {/if}
                          </div>
                          <span
                            class="chat-source-score"
                            style={`--score-pct: ${percent ?? 0}%`}
                          >
                            Angular Similarity: {sourceScoreLabel(source)}
                          </span>
                        </div>
                      </div>
                    </li>
                  {/each}
                </ol>
              </div>
            {/if}
          {/if}
        </div>
      {/each}
    </div>

    <form class="chat-input" onsubmit={handleSubmit}>
      <input
        class="input"
        type="text"
        placeholder="Type a message..."
        bind:value={draft}
        disabled={busy || $assistantRuntime.loading || !$currentSessionId}
      />
      <button class="btn" type="button" disabled={busy} onclick={createNewChat}
        >New Chat</button
      >
      <button
        class="btn btn-primary"
        type="submit"
        disabled={busy ||
          $assistantRuntime.loading ||
          !draft.trim() ||
          !$currentSessionId ||
          !$assistantRuntime.modelId}
      >
        Send
      </button>
    </form>
  </div>
</BaseWindow>
