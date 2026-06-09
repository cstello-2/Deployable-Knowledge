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
  import Icon from "$lib/components/Icon.svelte";
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
    if (!session) return;

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
    // TODO: needs to be adjusted to work on firefox browser
    const name = sourceName(source);
    return name ? `/documents/${encodeURIComponent(name)}#page=${source.page}` : "";
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
      <button
        class="chat-action-button chat-new-button"
        type="button"
        disabled={busy}
        aria-label="Start a new chat"
        title="Start a new chat"
        onclick={createNewChat}
      >
        <Icon name="add_comment" size={16} />
      </button>
      <button
        class="chat-action-button chat-send-button"
        type="submit"
        aria-label="Send message"
        title="Send message"
        disabled={busy ||
          $assistantRuntime.loading ||
          !draft.trim() ||
          !$currentSessionId ||
          !$assistantRuntime.modelId}
      >
        <Icon name="send" size={16} />
      </button>
    </form>
  </div>
</BaseWindow>

<style>
  :global(.miniwin[data-window-id="chat-window"]:not(.collapsed)) {
    min-height: 420px;
  }

  :global(.miniwin[data-window-id="chat-window"] .content-inner) {
    height: 100%;
    overflow: hidden;
  }

  .chat-log::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }

  .chat-log::-webkit-scrollbar-track {
    border-left: 1px solid var(--border);
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
  }

  .chat-log::-webkit-scrollbar-thumb {
    border: 3px solid hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) calc(var(--l-border) + 2%));
  }

  .chat-log::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--h) var(--sat) calc(var(--l-border) + 6%));
  }

  .chat-window {
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
  }

  .chat-status {
    margin-bottom: 8px;
    overflow-wrap: anywhere;
  }

  .chat-log {
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
    padding: 8px;
    border-radius: 12px;
    scrollbar-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 6%))
      hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
    scrollbar-width: thin;
  }

  .msg {
    max-width: 92%;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel)));
  }

  .msg.you {
    max-width: 75%;
    align-self: flex-end;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg)));
    text-align: right;
  }

  .msg.assistant {
    width: auto;
    min-width: 0;
    max-width: 92%;
    align-self: flex-start;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg)));
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .msg-md {
    min-width: 0;
    max-width: 100%;
    min-height: 1em;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .msg-md > :global(:first-child) {
    margin-top: 0;
  }

  .msg-md > :global(:last-child) {
    margin-bottom: 0;
  }

  .msg-md :global(p),
  .msg-md :global(li),
  .msg-md :global(blockquote),
  .msg-md :global(h1),
  .msg-md :global(h2),
  .msg-md :global(h3),
  .msg-md :global(h4),
  .msg-md :global(h5),
  .msg-md :global(h6),
  .msg-md :global(a) {
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .msg-md :global(p) {
    margin: 0 0 0.75em;
  }

  .msg-md :global(pre) {
    max-width: 100%;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .msg-md :global(code) {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .msg-md :global(table) {
    display: block;
    max-width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
  }

  .msg-md :global(img) {
    max-width: 100%;
    height: auto;
  }

  .msg-pending {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
  }

  .typing-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .typing-indicator span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    animation: typing-dot 1.1s infinite ease-in-out;
    background: var(--accent);
    opacity: 0.35;
  }

  .typing-indicator span:nth-child(2) {
    animation-delay: 0.15s;
  }

  .typing-indicator span:nth-child(3) {
    animation-delay: 0.3s;
  }

  .typing-text {
    font-size: 12px;
  }

  @keyframes typing-dot {
    0%,
    80%,
    100% {
      opacity: 0.35;
      transform: translateY(0);
    }

    40% {
      opacity: 1;
      transform: translateY(-3px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .typing-indicator span {
      animation: none;
    }
  }

  .msg-citations {
    display: grid;
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed color-mix(in oklab, var(--border) 80%, transparent);
  }

  .msg-citations-label {
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .chat-source-list {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chat-source-row {
    display: block;
    overflow: hidden;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
  }

  .chat-source-main {
    display: grid;
    min-width: 0;
    gap: 6px;
  }

  .chat-source-text-block {
    display: grid;
    min-width: 0;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 6px;
    align-items: start;
  }

  .chat-source-num {
    color: var(--text);
    flex: 0 0 auto;
    font-size: 13px;
    font-weight: 700;
  }

  .chat-source-text {
    display: -webkit-box;
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .chat-source-action-line {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding-left: 20px;
  }

  .chat-source-action-left {
    display: flex;
    min-width: 0;
    align-items: center;
  }

  .chat-source-btn {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-source-score {
    display: inline-flex;
    min-width: 150px;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      rgb(37 99 235 / 85%) 0 var(--score-pct),
      hsl(var(--h) var(--sat) calc(var(--l-panel) + 4%)) var(--score-pct) 100%
    );
    color: var(--text);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    white-space: nowrap;
  }

  .chat-input {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 0;
    align-items: center;
    margin-top: 10px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 3%));
    box-shadow: inset 0 1px 0 color-mix(in oklab, white 18%, transparent);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .chat-input:focus-within {
    border-color: var(--accent);
    box-shadow:
      inset 0 1px 0 color-mix(in oklab, white 18%, transparent),
      0 0 0 3px color-mix(in oklab, var(--accent) 18%, transparent);
  }

  .chat-input .input {
    min-width: 0;
    width: 100%;
    min-height: 36px;
    padding: 10px 12px;
    border: 0;
    border-radius: 13px 0 0 13px;
    background: transparent;
    box-shadow: none;
  }

  .chat-input .input:focus {
    box-shadow: none;
  }

  .chat-action-button {
    display: inline-grid;
    width: 44px;
    min-width: 44px;
    height: 42px;
    min-height: 42px;
    place-items: center;
    padding: 0;
    border: 0;
    border-left: 1px solid var(--border);
    border-radius: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    line-height: 1;
  }

  .chat-action-button:hover {
    background: color-mix(in oklab, var(--accent) 9%, transparent);
    color: var(--text);
  }

  .chat-action-button:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid color-mix(in oklab, var(--accent) 70%, transparent);
    outline-offset: -3px;
  }

  .chat-action-button:active {
    transform: none;
  }

  .chat-action-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .chat-send-button {
    border-radius: 0 13px 13px 0;
  }

  @media (max-width: 680px) {
    .chat-source-action-line {
      grid-template-columns: 1fr;
    }

    .chat-input {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .chat-input .input {
      grid-column: 1 / -1;
      border-bottom: 1px solid var(--border);
      border-radius: 13px 13px 0 0;
    }

    .chat-action-button {
      width: 100%;
      min-width: 0;
      border-left: 0;
    }

    .chat-send-button {
      border-left: 1px solid var(--border);
      border-radius: 0 0 13px 0;
    }

    .chat-new-button {
      border-radius: 0 0 0 13px;
    }

    .chat-source-action-line {
      padding-left: 0;
    }

    .chat-source-score {
      width: 100%;
      min-width: 0;
    }
  }
</style>
