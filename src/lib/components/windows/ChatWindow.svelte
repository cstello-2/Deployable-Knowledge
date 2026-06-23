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
          {message.content}
        </div>
      {/each}

      {#if messageStream.length !== 0}
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