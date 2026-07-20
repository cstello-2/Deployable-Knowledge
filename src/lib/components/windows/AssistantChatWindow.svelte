<script lang="ts">
  import type {
    AgentProgressEvent,
    ChatMessageRequest,
    ChatMessageStreamEvent,
    NotebookSourcesRequest,
  } from "$lib/requestTypes";
  import { getContext, tick } from "svelte";
  import AssistantMessageContext from "$lib/components/windows/AssistantMessageContext.svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import { getSelectedDocumentIds } from "$lib/utils/documentSelection";
  import { renderMarkdown } from "$lib/utils/markdown";
  import { legacyToolCallTrace } from "$lib/agentTrace";
  import type { WindowInstanceProps } from "./index";
  import type { AppState } from "$lib/state.svelte";
  import type {
    NotebookWithPages,
    Session,
    SessionMessage,
  } from "$lib/server/database/schema";
  import type {
    AgentTraceItem,
    AssistantMessageMetadata,
    StoredAgentRun,
  } from "$lib/agentTypes";

  // dk:send-to-notebook carries fully-composed text — the notebook just
  // appends it as plain text.
  type SendToNotebookDetail = { text: string };
  function getMessageMetadata(message: SessionMessage): AssistantMessageMetadata {
    if (!message.metadata || typeof message.metadata !== "object") return {};
    return message.metadata as AssistantMessageMetadata;
  }

  function getSourceChunkIds(message: SessionMessage): string[] {
    return (getMessageMetadata(message).outputs ?? []).flatMap((output) =>
      output.type === "source" && output.data.chunkId
        ? [output.data.chunkId]
        : [],
    );
  }

  function getAgentTrace(agent: StoredAgentRun | undefined): AgentTraceItem[] {
    if (agent?.trace?.length) return agent.trace;
    return (agent?.toolCalls ?? []).map(legacyToolCallTrace);
  }

  function countToolCalls(trace: AgentTraceItem[]): number {
    return trace.filter((item) => item.kind === "tool").length;
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
  let busy = $state(false);
  let messages = $state<SessionMessage[]>([]);
  let messageStream = $state("");
  let agentStatus = $state("Thinking…");
  let liveTrace = $state<AgentTraceItem[]>([]);
  let agentStreamError = $state("");
  let sendDisabled = $derived(busy || draft.trim().length === 0);
  let loadedSessionId: string | undefined;

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

    const chunkIds = getSourceChunkIds(message);

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
    if (sessionId) {
      loadMessages(sessionId)
        .then((m) => { if (sessionId === appState.currentSession?.id) messages = m; })
        .catch(() => {});
    } else {
      messages = [];
      messageStream = "";
    }
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

  function resetAgentActivity() {
    agentStatus = "Thinking…";
    liveTrace = [];
    agentStreamError = "";
  }

  function upsertLiveTrace(item: AgentTraceItem) {
    const existing = liveTrace.findIndex((entry) => entry.id === item.id);
    liveTrace = existing === -1
      ? [...liveTrace, item]
      : liveTrace.map((entry, index) => index === existing ? item : entry);
  }

  function applyAgentProgress(progress: AgentProgressEvent) {
    if (progress.kind === "model") {
      if (progress.trace) upsertLiveTrace(progress.trace);
      if (progress.status === "started") {
        agentStatus = "Thinking…";
      } else if (progress.requestedTools?.length) {
        agentStatus = "Starting tools…";
      } else {
        agentStatus = "Writing response…";
      }
      return;
    }
    upsertLiveTrace(progress.trace);
  }

  function applyStreamEvent(event: ChatMessageStreamEvent) {
    if (event.type === "agent") {
      applyAgentProgress(event.progress);
    } else if (event.type === "text") {
      messageStream += event.delta;
      agentStatus = "Writing final response";
    } else if (event.type === "complete") {
      agentStatus = `Finished · ${event.modelTurns} model turn${event.modelTurns === 1 ? "" : "s"}, ${event.toolCalls} tool call${event.toolCalls === 1 ? "" : "s"}`;
    } else {
      agentStreamError = event.message;
      agentStatus = "Agent run failed";
      throw new Error(event.message);
    }
  }

  function parseStreamLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    applyStreamEvent(JSON.parse(trimmed) as ChatMessageStreamEvent);
  }

  async function consumeChatStream(response: Response) {
    if (!response.ok) {
      throw new Error((await response.text()) || `Chat failed (${response.status})`);
    }
    if (!response.body) throw new Error("Chat response body is unavailable");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        parseStreamLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }

      await scrollToBottom();
      if (done) break;
    }

    parseStreamLine(buffer);
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    const text = draft.trim();
    if (!text) return;

    draft = "";
    busy = true;
    messageStream = "";
    resetAgentActivity();
    appState.lastQuery = text;

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
        agent_max_turns: appState.agentMaxTurns,
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
            document_ids: getSelectedDocumentIds(),
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

      await consumeChatStream(response);
      messages = await loadMessages(session.id);
      loadedSessionId = session.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      agentStreamError = message;
      showToast(`Chat failed: ${message}`);
    } finally {
      busy = false;
      messageStream = "";
      await scrollToBottom();
    }
  }

  async function createNewChat() {
    if (busy) return;
    messages = [];
    messageStream = "";
    resetAgentActivity();
    appState.currentSession = await createSession();
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
  {#snippet subtitle()}
    {notebookMode
      ? `Using ${appState.activeNotebook?.title ?? "Notebook"} for Context`
      : "Using Documents for Context"}
  {/snippet}

  <div class="chat-window">
    <div class="chat-log" bind:this={logElement} aria-live="polite">
      {#each messages as message (message.id)}
        <div
          class="msg"
          class:user={message.role === "user"}
          class:assistant={message.role === "assistant"}
          class:with-toolbar={message.role === "assistant"}
        >
          {#if message.role === "assistant"}
            {@const metadata = getMessageMetadata(message)}
            {@const agentRun = metadata.agent}
            {@const trace = getAgentTrace(agentRun)}
            {@const toolCallCount = countToolCalls(trace)}
            {@const outputs = metadata.outputs ?? []}
            <AssistantMessageContext {trace} />
            <div class="msg-md">{@html renderMarkdown(message.content)}</div>
            <AssistantMessageContext {outputs} />
            <div class="msg-response-toolbar" aria-label="Response actions">
              <button
                class="send-to-notebook-btn"
                type="button"
                aria-label="Send to notebook"
                title="Send to notebook"
                onclick={() => sendToNotebook(message)}
              >
                <Icon name="menu_book" size={13} filled={false} />
              </button>
              {#if agentRun}
                <span class="toolbar-divider" aria-hidden="true"></span>
                <span class="run-stat" title="Tool calls">
                  <Icon name="build" size={12} filled={false} />
                  {toolCallCount} tool{toolCallCount === 1 ? "" : "s"}
                </span>
                <span class="run-stat" title="Context items">
                  <Icon name="layers" size={12} filled={false} />
                  {outputs.length} context
                </span>
                <span class="run-stat" title="Model turns">
                  <Icon name="sync_alt" size={12} filled={false} />
                  {agentRun.modelTurns ?? 0} turn{agentRun.modelTurns === 1 ? "" : "s"}
                </span>
              {/if}
            </div>
          {:else}
            {message.content}
          {/if}
        </div>
      {/each}

      {#if busy}
        <div class="msg assistant msg-live-agent">
          <div role="status" aria-live="polite">
            <AssistantMessageContext trace={liveTrace} />
            {#if !messageStream.length && !liveTrace.some((item) => item.status === "running")}
              <div class="agent-inline-status">
              <span class="typing-indicator" aria-hidden="true">
                <span></span><span></span><span></span>
              </span>
                <span>{agentStatus}</span>
              </div>
            {/if}
            {#if agentStreamError}
              <div class="agent-stream-error">{agentStreamError}</div>
            {/if}
          </div>
          {#if messageStream.length}
            <div class="msg-md agent-live-response">
              {@html renderMarkdown(messageStream)}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <form
      class="chat-input inline-action-control"
      style="--inline-action-count: 3;"
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
  :global(.miniwin[data-window-id="chat-window"] .content-inner) {
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .chat-window {
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    flex-direction: column;
  }

  .chat-log {
    position: relative;
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 8px;
    overflow-x: hidden;
    overflow-y: auto;
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
    box-sizing: border-box;
    flex: 0 0 auto;
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
    width: fit-content;
    min-width: 0;
    max-width: 92%;
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

  .agent-stream-error {
    color: var(--danger-bor, #d65c5c);
  }

  .msg-live-agent {
    width: fit-content;
    max-width: 92%;
  }

  .agent-inline-status {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 11px;
  }

  .agent-stream-error {
    font-size: 11px;
  }

  .agent-live-response {
    margin-top: 0;
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
  @keyframes typing-dot {
    0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
    40% { opacity: 1; transform: translateY(-3px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .typing-indicator span { animation: none; }
  }

  .msg-response-toolbar {
    display: flex;
    min-width: 0;
    min-height: 24px;
    box-sizing: border-box;
    align-items: center;
    gap: 7px;
    margin: 8px -10px -8px;
    padding: 3px 7px;
    overflow-x: auto;
    border-top: 1px solid color-mix(in oklab, var(--border) 72%, transparent);
    border-radius: 0 0 9px 9px;
    background: color-mix(in oklab, var(--text) 2%, transparent);
    color: var(--muted);
    scrollbar-width: none;
  }

  .send-to-notebook-btn {
    display: grid;
    width: 18px;
    height: 18px;
    box-sizing: border-box;
    padding: 0;
    border: 0;
    border-radius: 2px;
    place-items: center;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    appearance: none;
    flex: 0 0 18px;
    font: inherit;
  }

  .msg-response-toolbar::-webkit-scrollbar {
    display: none;
  }

  .send-to-notebook-btn:hover {
    background: color-mix(in oklab, var(--text) 8%, transparent);
    color: var(--text);
  }

  .send-to-notebook-btn:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }

  .toolbar-divider {
    width: 1px;
    height: 12px;
    flex: 0 0 1px;
    background: color-mix(in oklab, var(--border) 82%, transparent);
  }

  .run-stat {
    display: inline-flex;
    height: 18px;
    flex: 0 0 auto;
    align-items: center;
    gap: 3px;
    font-size: 9px;
    line-height: 1;
    white-space: nowrap;
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
