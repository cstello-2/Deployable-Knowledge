<script lang="ts">
  import { getContext, tick } from "svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import { getSelectedDocumentIds } from "$lib/utils/documentSelection";
  import { renderMarkdown } from "$lib/utils/markdown";
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
    chunkId?: string;
    pageIndex?: number;
    score?: number;
  };

  // dk:send-to-notebook carries fully-composed text — the notebook just
  // appends it as plain text.
  type SendToNotebookDetail = { text: string };

  function getMessageSources(message: SessionMessage): ChatSource[] {
    return (message.metadata as { sources?: ChatSource[] } | null)?.sources ?? [];
  }

  function sourceScorePct(source: ChatSource): number {
    return source.score != null ? Math.round(source.score * 100) : 0;
  }

  function sourceScoreLabel(source: ChatSource): string {
    return source.score != null ? `${Math.round(source.score * 100)}%` : "N/A";
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

    const chunkIds = getMessageSources(message)
      .filter((s) => s.chunkId)
      .map((s) => s.chunkId as string);

    if (chunkIds.length && appState.activeNotebookId) {
      await fetch(`/notebooks/${appState.activeNotebookId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunk_ids: chunkIds }),
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

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    const text = draft.trim();
    if (!text) return;

    draft = "";
    busy = true;

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

    const requestBody: Record<string, unknown> = {
      message: text,
      model_id: appState.currentModelId,
      provider_id: appState.currentProviderId,
      max_tokens: appState.maxTokens,
      temperature: appState.temperature,
      top_k: appState.topK,
    };

    if (notebookMode) {
      requestBody.conversational = true;
      requestBody.context = await fetchNotebookContext();
      requestBody.notebook_id = appState.activeNotebookId;
    } else {
      requestBody.prompt_template_id = appState.promptTemplateId || null;
      requestBody.persona = appState.persona;
      requestBody.document_ids = getSelectedDocumentIds();
      requestBody.retrieval_mode = appState.retrievalMode;
      requestBody.rag_top_k = appState.ragTopK;
    }

    const res = await fetch(`/sessions/${session.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      messageStream += decoder.decode(value, { stream: true });
      await scrollToBottom();
    }

    messages = await loadMessages(session.id);
    loadedSessionId = session.id;
    busy = false;
    messageStream = "";
    await scrollToBottom();
  }

  async function createNewChat() {
    if (busy) return;
    messages = [];
    messageStream = "";
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
                    <li class="chat-source-row">
                      <div class="chat-source-main">
                        <div class="chat-source-text-block">
                          <span class="chat-source-num">{index + 1}.</span>
                          <span class="chat-source-text">{source.description ?? source.title ?? ""}</span>
                        </div>
                        <div class="chat-source-action-line">
                          <div class="chat-source-action-left">
                            {#if source.url}
                              <a class="btn btn-sm chat-source-btn" href={source.url} target="_blank" rel="noopener noreferrer">
                                {source.title ?? source.url}
                              </a>
                            {/if}
                          </div>
                          <span
                            class="chat-source-score"
                            style={`--score-pct: ${sourceScorePct(source)}%`}
                          >
                            Angular Similarity: {sourceScoreLabel(source)}
                          </span>
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
      
      
      {#if busy && !messageStream}
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

    <form class="chat-input" onsubmit={handleSubmit}>
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
        class="chat-action-button chat-mode-toggle"
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

  .chat-source-main { display: grid; min-width: 0; gap: 6px; }

  .chat-source-text-block {
    display: grid;
    min-width: 0;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 6px;
    align-items: start;
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
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding-left: 20px;
  }

  .chat-source-action-left { display: flex; min-width: 0; align-items: center; }

  .chat-source-btn { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
      rgb(37 99 235 / 85%) 0 var(--score-pct, 0%),
      hsl(var(--h) var(--sat) calc(var(--l-panel) + 4%)) var(--score-pct, 0%) 100%
    );
    color: var(--text);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    white-space: nowrap;
  }

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
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    gap: 0;
    align-items: center;
    margin-top: 10px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 3%));
    box-shadow: inset 0 1px 0 color-mix(in oklab, white 18%, transparent);
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

  .chat-action-button:active {
    transform: none;
  }

  .chat-action-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .chat-mode-toggle.active {
    background: #8ae7ff;
    color: #06262b;
  }

  .chat-mode-toggle.active:hover {
    background: #8ae7ff;
    color: #06262b;
  }

  .chat-send-button {
    border-radius: 0 13px 13px 0;
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

    .chat-action-button {
      width: 100%;
      min-width: 0;
      border-left: 0;
    }

    .chat-action-button:first-of-type {
      border-radius: 0 0 0 13px;
    }

    .chat-action-button + .chat-action-button {
      border-left: 1px solid var(--border);
    }

    .chat-send-button {
      border-radius: 0 0 13px 0;
    }
  }
</style>
