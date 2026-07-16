<script lang="ts">
  import type {
    ChatMessageRequest,
    NotebookSourcesRequest,
  } from "$lib/requestTypes";
  import { getContext, onMount, tick } from "svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import {
    getSelectedDocumentIds,
    selectedDocumentIds,
  } from "$lib/utils/documentSelection";
  import {
    knowledgeGraphState,
    knowledgeGraphStateMatches,
    refreshKnowledgeGraphStatus,
  } from "$lib/utils/knowledgeGraphState";
  import { renderMarkdown } from "$lib/utils/markdown";
  import { showWindow } from "$lib/utils/workspaceState";
  import type { WindowInstanceProps } from "./index";
  import type { AppState } from "$lib/state.svelte";
  import type {
    NotebookWithPages,
    Session,
    SessionMessage,
  } from "$lib/server/database/schema";

  // Shape of a citation stored on an assistant message's metadata.
  type ChatSource = {
    url?: string;
    title?: string;
    description?: string;
    score?: number;
    rawScore?: number;
    documentId?: string;
    chunkId?: string;
    nodeId?: string;
    pageIndex?: number;
    chunkIndex?: number;
    chunkType?: string;
    content?: string;
    sourceTitle?: string;
  };

  type AssistantMetadata = {
    sources?: ChatSource[];
    retrievalMode?: string;
    query?: string;
    documentIds?: string[];
    graphTopK?: number;
  };

  // dk:send-to-notebook carries fully-composed text — the notebook just
  // appends it as plain text.
  type SendToNotebookDetail = { text: string };

  function getMessageSources(message: SessionMessage): ChatSource[] {
    return (message.metadata as AssistantMetadata | null)?.sources ?? [];
  }

  let {
    id,
    title,
    closable = false,
    height = null,
    collapsed = false,
    onToggleCollapse = () => {},
    onClose = () => {},
  }: WindowInstanceProps = $props();

  const appState = getContext<AppState>("appState");

  let logElement = $state<HTMLElement | null>(null);
  let draft = $state("");
  let status = $state("");
  let busy = $state(false);
  let messages = $state<SessionMessage[]>([]);
  let messageStream = $state("");
  let sendDisabled = $derived(busy || draft.trim().length === 0);
  let loadedSessionId: string | undefined;
  let graphRequestId = 0;
  let selectedResultChunkId = $state<string | null>(null);
  let galaxySelectedChunkId = $state<string | null>(null);
  let graphReadinessMessage = $derived(
    appState.retrievalMode === "graph" &&
      knowledgeGraphStateMatches($knowledgeGraphState, $selectedDocumentIds) &&
      ($knowledgeGraphState.status === "building" ||
        $knowledgeGraphState.status === "checking")
      ? "The Knowledge Graph is preparing for this question."
      : "",
  );

  // Notebook mode: RAG off, context = the entire open notebook (all its pages)
  // instead of retrieved document chunks.
  let notebookMode = $state(false);
  function toggleNotebookMode() {
    notebookMode = !notebookMode;
  }

  // Fetch the currently open notebook fresh (rather than trusting appState,
  // which can lag behind saves) and flatten all of its pages into one context blob.
  async function fetchNotebookContext(): Promise<string> {
    const res = await fetch("/notebooks");
    const data = (await res.json()) as {
      activeNotebookId: string | null;
      notebooks: NotebookWithPages[];
    };
    const notebook = data.notebooks.find((nb) => nb.id === data.activeNotebookId);
    if (!notebook) return "";
    return notebook.pages.map((p) => p.content).filter(Boolean).join("\n\n");
  }

  // Send an assistant reply to the currently open notebook page (visible,
  // plain text), and separately attach the RAG chunks behind it to the
  // notebook server-side — hidden from the page text, but usable by
  // notebook-mode chat and viewable via the notebook's Sources panel.
  async function sendToNotebook(message: SessionMessage) {
    const detail: SendToNotebookDetail = { text: message.content };
    window.dispatchEvent(new CustomEvent("dk:send-to-notebook", { detail }));

    const chunkIds = getMessageSources(message)
      .filter((s) => s.chunkId)
      .map((s) => s.chunkId as string);

    if (chunkIds.length && appState.activeNotebookId) {
      await fetch(`/notebooks/${appState.activeNotebookId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunk_ids: chunkIds,
        } satisfies NotebookSourcesRequest),
      });
      window.dispatchEvent(new CustomEvent("notebook-sources:refresh"));
    }

    showToast(
      chunkIds.length
        ? `Sent to notebook (+${chunkIds.length} source${chunkIds.length === 1 ? "" : "s"})`
        : "Sent to notebook",
    );
  }

  // Reload when the current session changes (e.g. picked in Chat History).
  $effect(() => {
    const sessionId = appState.currentSession?.id;
    if (busy || sessionId === loadedSessionId) return;
    loadedSessionId = sessionId;
    status = "";
    selectedResultChunkId = null;
    galaxySelectedChunkId = null;
    if (sessionId) {
      loadMessages(sessionId)
        .then((loadedMessages) => {
          if (sessionId !== appState.currentSession?.id) return;
          messages = loadedMessages;
          void restoreQueryGraph(sessionId, loadedMessages);
        })
        .catch(() => {});
    } else {
      messages = [];
      messageStream = "";
      clearGraphGalaxy();
    }
  });

  $effect(() => {
    if (appState.retrievalMode !== "graph") return;
    void refreshKnowledgeGraphStatus($selectedDocumentIds);
  });

  async function loadMessages(sessionId: string): Promise<SessionMessage[]> {
    const res = await fetch(`/sessions/${sessionId}`);
    return (await res.json()) as SessionMessage[];
  }

  async function createSession(): Promise<Session> {
    const res = await fetch("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const session = (await res.json()) as Session;
    appState.currentSession = session;
    window.dispatchEvent(new CustomEvent("sessions:refresh"));
    return session;
  }

  async function scrollToBottom() {
    await tick();
    if (logElement) logElement.scrollTop = logElement.scrollHeight;
  }

  async function assistantErrorMessage(response: Response) {
    try {
      const body = await response.json() as { message?: unknown; error?: unknown };
      if (typeof body.message === "string" && body.message.trim()) return body.message;
      if (typeof body.error === "string" && body.error.trim()) return body.error;
    } catch {
      // Fall back to the HTTP status.
    }
    return `Assistant request failed (${response.status})`;
  }

  async function restoreQueryGraph(
    sessionId: string,
    sessionMessages: SessionMessage[],
  ) {
    const userMessage = sessionMessages.find((message) => message.role === "user");
    const assistantMessage = [...sessionMessages]
      .reverse()
      .find((message) => message.role === "assistant");
    const metadata = assistantMessage?.metadata as AssistantMetadata | null;
    if (!userMessage || metadata?.retrievalMode !== "graph") return;

    const documentIds = Array.isArray(metadata.documentIds)
      ? metadata.documentIds
      : [...new Set(
          (metadata.sources ?? [])
            .map((source) => source.documentId)
            .filter((value): value is string => Boolean(value)),
        )];
    const requestId = ++graphRequestId;
    appState.lastQuery = metadata.query?.trim() || userMessage.content;
    showWindow("graph-galaxy-window");
    await tick();
    window.dispatchEvent(new CustomEvent("dk:restore-query-graph", {
      detail: {
        sessionId,
        query: appState.lastQuery,
        documentIds,
        requestId,
        topK: metadata.graphTopK,
      },
    }));
  }

  async function updateGraphGalaxy(
    query: string,
    documentIds: string[],
    requestId: number,
    phase: "loading" | "ready" | "error",
  ) {
    showWindow("graph-galaxy-window");
    await tick();
    window.dispatchEvent(new CustomEvent("dk:visualize-graph", {
      detail: {
        query,
        documentIds,
        requestId,
        phase,
        sessionId: appState.currentSession?.id,
        topK: appState.ragTopK,
      },
    }));
  }

  function clearGraphGalaxy() {
    window.dispatchEvent(new CustomEvent("dk:clear-graph", {
      detail: { requestId: ++graphRequestId },
    }));
  }

  async function selectResultChunk(source: ChatSource) {
    if (!source.chunkId && !source.nodeId) return;
    selectedResultChunkId = source.chunkId ?? source.nodeId ?? null;
    showWindow("graph-galaxy-window");
    await tick();
    window.dispatchEvent(new CustomEvent("dk:focus-galaxy-chunk", {
      detail: { chunkId: source.chunkId, nodeId: source.nodeId },
    }));
  }

  async function saveResultChunk(source: ChatSource, queryText: string) {
    if (!source.chunkId) return;
    selectedResultChunkId = source.chunkId;
    let resolvedSource = source;
    if (!source.content?.trim()) {
      const response = await fetch(`/chunks/${encodeURIComponent(source.chunkId)}`);
      if (!response.ok) {
        status = await assistantErrorMessage(response);
        return;
      }
      resolvedSource = { ...source, ...(await response.json() as ChatSource) };
    }

    showWindow("graph-galaxy-window");
    await tick();
    const content =
      resolvedSource.content?.trim() ||
      resolvedSource.description?.replace(/^Page \d+:\s*/, "").trim() ||
      "";
    window.dispatchEvent(new CustomEvent("dk:save-result-chunk", {
      detail: {
        query: queryText,
        chunk: {
          id: `chunk:${source.chunkId}`,
          kind: "chunk",
          label:
            resolvedSource.sourceTitle ||
            resolvedSource.title ||
            `Chunk ${resolvedSource.chunkIndex ?? ""}`.trim(),
          chunkId: resolvedSource.chunkId,
          documentId: resolvedSource.documentId,
          sourceTitle: resolvedSource.sourceTitle || resolvedSource.title,
          pageIndex: resolvedSource.pageIndex,
          chunkIndex: resolvedSource.chunkIndex,
          chunkType: resolvedSource.chunkType,
          content,
          preview: resolvedSource.description,
          retrievalScore: resolvedSource.score,
          score: resolvedSource.score,
        },
      },
    }));
  }

  async function openGraphGalaxy() {
    const visualQuery = draft.trim() || appState.lastQuery;
    showWindow("graph-galaxy-window");
    await tick();
    window.dispatchEvent(
      new CustomEvent("dk:visualize-graph", { detail: { query: visualQuery } }),
    );
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    const text = draft.trim();
    if (!text) return;

    draft = "";
    busy = true;
    status = "";
    appState.lastQuery = text;
    const graphMode = !notebookMode && appState.retrievalMode === "graph";
    const documentIds = getSelectedDocumentIds();
    const requestId = graphMode ? ++graphRequestId : 0;
    let graphReady = false;

    if (graphMode) {
      await updateGraphGalaxy(text, documentIds, requestId, "loading");
    }

    try {
      const session = appState.currentSession ?? (await createSession());

      messages = [...messages, {
        id: (messages.at(-1)?.id ?? 0) + 1,
        role: "user",
        content: text,
        createdAt: new Date(),
        sessionId: session.id,
        metadata: null,
      }];
      await scrollToBottom();

      const requestBase = {
        message: text,
        model_id: appState.currentModelId,
        provider_id: appState.currentProviderId,
        max_tokens: appState.maxTokens,
        temperature: appState.temperature,
        top_k: appState.topK,
      };

      const requestBody: ChatMessageRequest = notebookMode
        ? {
            ...requestBase,
            conversational: true,
            context: await fetchNotebookContext(),
            notebook_id: appState.activeNotebookId,
          }
        : {
            ...requestBase,
            conversational: false,
            prompt_template_id: appState.promptTemplateId || null,
            persona: appState.persona,
            document_ids: documentIds,
            rag_top_k: appState.ragTopK,
          };

      const response = await fetch(
        `/sessions/${encodeURIComponent(session.id)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
      );
      if (!response.ok) throw new Error(await assistantErrorMessage(response));
      if (!response.body) throw new Error("Assistant returned an empty response stream");

      if (graphMode) {
        void refreshKnowledgeGraphStatus(documentIds);
        await updateGraphGalaxy(text, documentIds, requestId, "ready");
        graphReady = true;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        messageStream += decoder.decode(value, { stream: true });
        await scrollToBottom();
      }

      messages = await loadMessages(session.id);
      loadedSessionId = session.id;
      await scrollToBottom();
    } catch (error) {
      status = error instanceof Error ? error.message : "Assistant request failed.";
      if (graphMode && !graphReady) {
        await updateGraphGalaxy(text, documentIds, requestId, "error");
      }
    } finally {
      busy = false;
      messageStream = "";
    }
  }

  async function createNewChat() {
    if (busy) return;
    status = "";
    messages = [];
    messageStream = "";
    clearGraphGalaxy();
    appState.currentSession = await createSession();
  }

  onMount(() => {
    const handleGalaxySelection = (event: Event) => {
      const detail = (event as CustomEvent<{
        sessionId?: string | null;
        chunkId?: string | null;
      }>).detail;
      if (detail?.sessionId && detail.sessionId !== appState.currentSession?.id) return;
      galaxySelectedChunkId = detail?.chunkId ?? null;
    };
    const handleGalaxyFocusResult = (event: Event) => {
      const detail = (event as CustomEvent<{
        sessionId?: string | null;
        found?: boolean;
      }>).detail;
      if (detail?.sessionId && detail.sessionId !== appState.currentSession?.id) return;
      if (detail?.found === false) {
        status = "The selected assistant result is not present in this saved Galaxy view.";
      } else if (
        status === "The selected assistant result is not present in this saved Galaxy view."
      ) {
        status = "";
      }
    };

    window.addEventListener("dk:galaxy-chunk-selection", handleGalaxySelection);
    window.addEventListener("dk:galaxy-focus-result", handleGalaxyFocusResult);
    return () => {
      window.removeEventListener("dk:galaxy-chunk-selection", handleGalaxySelection);
      window.removeEventListener("dk:galaxy-focus-result", handleGalaxyFocusResult);
    };
  });

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
  {#snippet subtitle()}
    {notebookMode
      ? `Using ${appState.activeNotebook?.title ?? "Notebook"} for Context`
      : "Using Documents for Context"}
  {/snippet}

  <div class="chat-window">
    {#if status}
      <div class="chat-status li-subtle" role="status">{status}</div>
    {/if}
    {#if graphReadinessMessage}
      <div class="chat-status chat-graph-status li-subtle" role="status">
        {graphReadinessMessage}
      </div>
    {/if}
    <div class="chat-log" bind:this={logElement} aria-live="polite">
      {#each messages as message (message.id)}
        <div
          class="msg"
          class:user={message.role === "user"}
          class:assistant={message.role === "assistant"}
        >
          {#if message.role === "assistant"}
            <div class="msg-md">{@html renderMarkdown(message.content)}</div>
            {@const sources = getMessageSources(message)}
            <div class="msg-citations">
              <div class="msg-citations-header">
                {#if sources.length}
                  <span class="msg-citations-label">Sources</span>
                {:else}
                  <span></span>
                {/if}
                <button class="send-to-notebook-btn" type="button" onclick={() => sendToNotebook(message)}>
                  Send to Notebook
                </button>
              </div>

              {#if sources.length}
                <ol class="chat-source-list">
                  {#each sources as source, index (index)}
                    <li
                      class="chat-source-row"
                      class:selected={(source.chunkId ?? source.nodeId) === selectedResultChunkId}
                      class:galaxy-match={source.chunkId === galaxySelectedChunkId}
                    >
                      <div class="chat-source-main">
                        <button
                          class="chat-source-text-block chat-source-select"
                          type="button"
                          disabled={!source.chunkId && !source.nodeId}
                          onclick={() => selectResultChunk(source)}
                        >
                          <span class="chat-source-num">{index + 1}.</span>
                          <span class="chat-source-text">{source.description ?? source.title ?? ""}</span>
                        </button>
                        <div class="chat-source-action-line">
                          <div class="chat-source-action-left">
                            {#if source.url}
                              <a class="btn btn-sm chat-source-btn" href={source.url} target="_blank" rel="noopener noreferrer">
                                {source.title ?? source.url}
                              </a>
                            {/if}
                            <button
                              class="btn btn-sm chat-source-btn"
                              type="button"
                              disabled={!source.chunkId}
                              onclick={() => saveResultChunk(
                                source,
                                messages.find((item) => item.role === "user")?.content ??
                                  appState.lastQuery,
                              )}
                            >
                              Save chunk
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  {/each}
                </ol>
              {/if}
            </div>
          {:else}
            {message.content}
          {/if}
        </div>
      {/each}

      {#if busy && messageStream.length === 0}
        <div class="msg assistant">
          <div class="msg-md msg-pending" role="status" aria-live="polite">
            <span class="typing-indicator" aria-hidden="true">
              <span></span><span></span><span></span>
            </span>
            <span class="typing-text">Generating response...</span>
          </div>
        </div>
      {:else if messageStream.length !== 0}
        <div class="msg assistant">
          <div class="msg-md">{@html renderMarkdown(messageStream)}</div>
        </div>
      {/if}
    </div>

    <form
      class="chat-input inline-action-control"
      style="--inline-action-count: 4;"
      onsubmit={handleSubmit}
    >
      <input
        class="input"
        type="text"
        name="message"
        placeholder="Type a message..."
        bind:value={draft}
        aria-label="Message"
        disabled={busy}
      />
      <button
        class="inline-action-button chat-mode-toggle"
        class:active={notebookMode}
        type="button"
        disabled={busy}
        aria-label="Chat About Your Notebook"
        aria-pressed={notebookMode}
        title="Chat About Your Notebook"
        onclick={toggleNotebookMode}
      >
        <Icon name="menu_book" size={16} />
      </button>
      <button
        class="inline-action-button chat-new-button"
        type="button"
        disabled={busy}
        aria-label="Start a new chat"
        title="Start a new chat"
        onclick={createNewChat}
      >
        <Icon name="add_comment" size={16} />
      </button>
      <button
        class="inline-action-button chat-graph-button"
        type="button"
        aria-label="Visualize knowledge graph"
        title="Visualize knowledge graph"
        onclick={openGraphGalaxy}
      >
        <Icon name="hub" size={16} />
      </button>
      <button
        class="inline-action-button chat-send-button"
        type="submit"
        aria-label="Send message"
        title="Send message"
        disabled={sendDisabled}
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

  .chat-window {
    position: relative;
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
  }

  .chat-status {
    margin-bottom: 8px;
    overflow-wrap: anywhere;
  }

  .chat-graph-status {
    padding: 7px 9px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
  }

  .chat-log {
    position: relative;
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

  .msg {
    max-width: 92%;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel)));
  }

  .msg.user {
    max-width: 75%;
    align-self: flex-end;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg)));
    text-align: right;
  }

  .msg.assistant {
    min-width: 0;
    align-self: flex-start;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg)));
    overflow-wrap: anywhere;
  }

  .msg-md {
    min-width: 0;
    min-height: 1em;
    overflow-wrap: anywhere;
  }

  .msg-md > :global(:first-child) { margin-top: 0; }
  .msg-md > :global(:last-child) { margin-bottom: 0; }
  .msg-md :global(p) { margin: 0 0 0.75em; }
  .msg-md :global(ul),
  .msg-md :global(ol) { margin: 0 0 0.75em; padding-left: 1.5em; }
  .msg-md :global(li) { margin: 0.15em 0; }
  .msg-md :global(blockquote) {
    margin: 0 0 0.75em;
    padding: 0.1em 1em;
    border-left: 3px solid var(--border);
    color: var(--muted);
  }
  .msg-md :global(h1),
  .msg-md :global(h2),
  .msg-md :global(h3),
  .msg-md :global(h4),
  .msg-md :global(h5),
  .msg-md :global(h6) { margin: 0.75em 0 0.5em; line-height: 1.3; }
  .msg-md :global(hr) { border: none; border-top: 1px solid var(--border); margin: 0.75em 0; }
  .msg-md :global(pre) { max-width: 100%; overflow-x: auto; white-space: pre-wrap; }
  .msg-md :global(code) { white-space: pre-wrap; }
  .msg-md :global(a) { overflow-wrap: anywhere; }
  .msg-md :global(table) {
    display: block;
    max-width: 100%;
    margin: 0 0 0.75em;
    overflow-x: auto;
    border-collapse: collapse;
  }
  .msg-md :global(th),
  .msg-md :global(td) { border: 1px solid var(--border); padding: 0.35em 0.6em; text-align: left; }
  .msg-md :global(img) { max-width: 100%; height: auto; }

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

  .typing-indicator span:nth-child(2) { animation-delay: 0.15s; }
  .typing-indicator span:nth-child(3) { animation-delay: 0.3s; }
  .typing-text { font-size: 12px; }

  @keyframes typing-dot {
    0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
    40% { opacity: 1; transform: translateY(-3px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .typing-indicator span { animation: none; }
  }

  .msg-citations {
    display: grid;
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed color-mix(in oklab, var(--border) 80%, transparent);
  }

  .msg-citations-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .msg-citations-label {
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .chat-source-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }

  .chat-source-row {
    display: block;
    overflow: hidden;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
  }

  .chat-source-row.selected {
    border-color: color-mix(in oklab, var(--accent) 58%, var(--border));
    background: color-mix(in oklab, var(--accent) 10%, hsl(var(--h) var(--sat) var(--l-panel)));
  }

  .chat-source-row.galaxy-match {
    border-color: color-mix(in oklab, #a78bfa 78%, var(--border));
    background: color-mix(in oklab, #8b5cf6 18%, hsl(var(--h) var(--sat) var(--l-panel)));
    box-shadow: inset 3px 0 0 #a78bfa, 0 0 0 1px rgb(167 139 250 / 18%);
  }

  .chat-source-main { display: grid; min-width: 0; gap: 6px; }

  .chat-source-text-block {
    display: grid;
    min-width: 0;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 6px;
    align-items: start;
  }

  .chat-source-select {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .chat-source-select:disabled {
    cursor: default;
  }

  .chat-source-num { color: var(--text); font-size: 13px; font-weight: 700; }

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
    display: flex;
    min-width: 0;
    align-items: center;
    padding-left: 20px;
  }

  .chat-source-action-left { display: flex; min-width: 0; align-items: center; }

  .chat-source-btn { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .send-to-notebook-btn {
    padding: 3px 9px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 3%));
    color: var(--text);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .send-to-notebook-btn:hover {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
    background: color-mix(in oklab, var(--accent) 10%, transparent);
  }

  .chat-input {
    flex-shrink: 0;
    margin-top: 10px;
  }

  .chat-mode-toggle.active,
  .chat-mode-toggle.active:hover {
    background: color-mix(in oklab, var(--accent) 18%, transparent);
    color: var(--text);
  }

  @media (max-width: 680px) {
    .chat-input {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .chat-input .input {
      grid-column: 1 / -1;
      border-bottom: 1px solid var(--border);
      border-radius: 13px 13px 0 0;
    }

    .chat-input .inline-action-button {
      width: 100%;
      min-width: 0;
      border-left: 0;
    }

    .chat-input .inline-action-button:first-of-type {
      border-radius: 0 0 0 13px;
    }

    .chat-input .inline-action-button + .inline-action-button {
      border-left: 1px solid var(--border);
    }

    .chat-send-button {
      border-radius: 0 0 13px 0;
    }
  }
</style>
