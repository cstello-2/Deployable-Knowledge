<script lang="ts">
  import { getContext, tick, onMount } from "svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { type WindowInstanceProps } from "./index.ts";
  import type { AppState } from "$lib/state.svelte";
  import type { Session, SessionMessage } from "$lib/server/database/schema";

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
  let sendDisabled = $derived(busy ? true : draft.trim().length === 0);
  let loadedSessionId: string | undefined;
  let selectedAssistantText = $state("");

  type Source = { url?: string; title?: string; description?: string; score?: number };

  function getMessageSources(message: SessionMessage): Source[] {
    return (message.metadata as { sources?: Source[] })?.sources ?? [];
  }

  function sourceHref(s: Source) { return s.url ?? null; }
  function sourceName(s: Source) { return s.title ?? s.url ?? "Source"; }
  function sourceDescription(s: Source) { return s.description ?? s.title ?? ""; }
  function angularSimilarityPercent(s: Source): number | null { return s.score != null ? Math.round(s.score * 100) : null; }
  function sourceScoreLabel(s: Source) { return s.score != null ? `${Math.round(s.score * 100)}%` : "N/A"; }
  let sendToNotebookVisible = $state(false);
  let sendToNotebookTop = $state(0);
  let sendToNotebookLeft = $state(0);

  $effect(() => {
    const sessionId = appState.currentSession?.id;
    if (busy || sessionId === loadedSessionId) return;

    loadedSessionId = sessionId;
    refresh(sessionId).catch(() => {});
  });

  async function refresh(sessionId = appState.currentSession?.id) {
    const nextMessages = await loadMessages(sessionId);
    if (sessionId === appState.currentSession?.id) messages = nextMessages;
  }

  async function loadMessages(sessionId = appState.currentSession?.id): Promise<SessionMessage[]> {
    if (!sessionId) return [];
    return await fetch(`/sessions/${sessionId}`).then((r) => r.json());
  }

  async function createSession(): Promise<Session> {
    const session = await fetch("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).then((r) => r.json()) as Session;
    window.dispatchEvent(new CustomEvent("sessions:refresh"));
    return session;
  }

  async function scrollToBottom() {
    await tick();
    if (logElement) logElement.scrollTop = logElement.scrollHeight;
  }

  function handleSendToChat(event: Event) {
    const { text } = (event as CustomEvent<{ text: string }>).detail;
    if (!text?.trim()) return;
    draft = draft.trim() ? `${draft.trimEnd()}\n\n${text.trim()}` : text.trim();
  }

  function handleAssistantSelection() {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    const messageElement = selection?.anchorNode?.parentElement?.closest(".msg.assistant");

    if (!selectedText || !messageElement || !logElement?.contains(messageElement)) {
      selectedAssistantText = "";
      sendToNotebookVisible = false;
      return;
    }

    const rangeRect = selection!.getRangeAt(0).getBoundingClientRect();
    const logRect = logElement!.getBoundingClientRect();

    selectedAssistantText = selectedText;
    sendToNotebookLeft = Math.max(8, rangeRect.left - logRect.left);
    sendToNotebookTop = Math.max(8, rangeRect.top - logRect.top - 38);
    sendToNotebookVisible = true;
  }

  function sendSelectionToNotebook() {
    window.dispatchEvent(new CustomEvent("dk:send-to-notebook", { detail: { text: selectedAssistantText } }));
    selectedAssistantText = "";
    sendToNotebookVisible = false;
    status = "Sent to notebook";
    window.getSelection()?.removeAllRanges();
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    const text = draft.trim();
    if (!text) return;

    draft = "";
    busy = true;
    status = "";

    const session = appState.currentSession ?? (await createSession());
    appState.currentSession = session;

    messages = [...messages, {
      id: (messages.at(-1)?.id ?? 0) + 1,
      role: "user",
      content: text,
      createdAt: new Date(),
      sessionId: session.id,
      metadata: null,
    }];

    await scrollToBottom();

    const res = await fetch(`/sessions/${session.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        model_id: appState.currentModelId,
        provider_id: appState.currentProviderId,
        max_tokens: appState.maxTokens,
        temperature: appState.temperature,
        top_k: appState.topK,
        prompt_template_id: appState.promptTemplateId || null,
        persona: appState.persona,
      }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const token of decoder.decode(value, { stream: true }).split("\n").filter(Boolean)) {
        messageStream += token;
        await scrollToBottom();
      }
    }

    messages = await loadMessages(session.id);
    loadedSessionId = session.id;
    busy = false;
    messageStream = "";
    await scrollToBottom();
  }

  async function createNewChat() {
    if (busy) return;
    status = "";
    messages = [];
    appState.currentSession = await createSession();
  }

  onMount(() => {
    window.addEventListener("dk:send-to-chat", handleSendToChat);
    document.addEventListener("selectionchange", handleAssistantSelection);

    return () => {
      window.removeEventListener("dk:send-to-chat", handleSendToChat);
      document.removeEventListener("selectionchange", handleAssistantSelection);
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
  <div class="chat-window">
    {#if status}
      <div class="chat-status li-subtle">
        {status}
      </div>
    {/if}

    <div class="chat-log" bind:this={logElement} aria-live="polite">
      {#if sendToNotebookVisible}
        <button
          class="selection-action chat-selection-action"
          type="button"
          style={`top: ${sendToNotebookTop}px; left: ${sendToNotebookLeft}px;`}
          onclick={sendSelectionToNotebook}
        >
          Send to Notebook
        </button>
      {/if}

      {#each messages as message (message.id)}
        <div
          class="msg"
          class:user={message.role === "user"}
          class:assistant={message.role === "assistant"}
        >
          {#if message.role === "user"}
            {message.content}
          {:else if message.role === "assistant"}
            {message.content}
            {#if getMessageSources(message).length}
              <div class="msg-citations">
                <div class="msg-citations-label">Sources</div>
                <ol class="chat-source-list">
                  {#each getMessageSources(message) as source, index}
                    <li class="chat-source-row">
                      <div class="chat-source-main">
                        <div class="chat-source-text-block">
                          <span class="chat-source-num">{index + 1}.</span>
                          <span class="chat-source-text">{sourceDescription(source)}</span>
                        </div>
                        <div class="chat-source-action-line">
                          <div class="chat-source-action-left">
                            {#if sourceHref(source)}
                              <a class="btn btn-sm chat-source-btn" href={sourceHref(source)} target="_blank" rel="noopener noreferrer">
                                {sourceName(source)}
                              </a>
                            {/if}
                          </div>
                          <span class="chat-source-score" style={`--score-pct: ${angularSimilarityPercent(source) ?? 0}%`}>
                            Angular Similarity: {sourceScoreLabel(source)}
                          </span>
                        </div>
                      </div>
                    </li>
                  {/each}
                </ol>
              </div>
            {/if}
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
        <div class="msg assistant">{messageStream}</div>
      {/if}
    </div>

    <form class="chat-input" onsubmit={handleSubmit}>
      <input
        class="input"
        type="text"
        placeholder="Type a message..."
        bind:value={draft}
        aria-label="Message"
        disabled={busy}
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

  .selection-action {
    position: absolute;
    z-index: 30;
    padding: 6px 9px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 3%));
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    box-shadow: var(--shadow);
  }

  .selection-action:hover {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
  }

  .chat-selection-action {
    white-space: nowrap;
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
    max-width: 100%;
    min-height: 1em;
    overflow-wrap: anywhere;
  }

  .msg-md > :global(:first-child) { margin-top: 0; }
  .msg-md > :global(:last-child) { margin-bottom: 0; }

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
  }

  .msg-md :global(p) { margin: 0 0 0.75em; }
  .msg-md :global(pre) { max-width: 100%; overflow-x: auto; white-space: pre-wrap; }
  .msg-md :global(code) { white-space: pre-wrap; }
  .msg-error { color: var(--danger); }
  .msg-md :global(table) { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
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
  }
</style>