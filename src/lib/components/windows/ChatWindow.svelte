<script lang="ts">
  import { getContext, tick } from "svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { type WindowInstanceProps } from "./index.ts";
  import type { AppState } from "$lib/state.svelte";
  import type { SessionMessage } from "$lib/server/database/schema";
  import { createSession } from "$lib/api/sessions";

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

  async function loadMessages(
    sessionId = appState.currentSession?.id,
  ): Promise<SessionMessage[]> {
    if (!sessionId) return [];

    const req = new Request(`/sessions/${sessionId}`, {
      method: "GET",
    });

    const resp = await fetch(req);
    const data = (await resp.json()) as SessionMessage[];

    return data || [];
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
    status = "";

    const session = appState.currentSession ?? (await createSession());
    appState.currentSession = session;

    const lastMessage = messages[messages.length - 1];
    const fakeMessage: SessionMessage = {
      id: (lastMessage?.id ?? 0) + 1,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      sessionId: session.id,
      metadata: undefined,
    };

    messages = [...messages, fakeMessage];

    await scrollToBottom();

    try {
      const resp = await fetch(
        `/sessions/${encodeURIComponent(session.id)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            model_id: "granite4:350m",
            provider_id: "ollama",
          }),
        },
      );

      if (!resp.ok) {
        throw new Error(`Chat request failed: ${resp.status} ${resp.statusText}`);
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      if (!reader) throw new Error("reader could not be created.");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        messageStream += chunk;
        await scrollToBottom();
      }

      const streamedAssistantText = messageStream;

      const assistantMessage: SessionMessage = {
        id: fakeMessage.id + 1,
        role: "assistant",
        content: streamedAssistantText,
        createdAt: new Date().toISOString(),
        sessionId: session.id,
        metadata: undefined,
      };

      messages = [...messages, assistantMessage];
      messageStream = "";

      try {
        const savedMessages = await loadMessages(session.id);

        const savedHasAssistantResponse = savedMessages.some(
          (message) =>
            message.role === "assistant" &&
            message.content.trim() === streamedAssistantText.trim(),
        );

        if (savedHasAssistantResponse) {
          messages = savedMessages;
        } else {
          console.warn(
            "Saved messages did not include the streamed assistant response yet. Keeping local streamed message.",
            {
              savedMessages,
              streamedAssistantText,
            },
          );
        }
      } catch (error) {
        console.warn(
          "Failed to reload messages after stream. Keeping local messages.",
          error,
        );
      }

      loadedSessionId = session.id;
    } catch (error) {
      console.error("Chat submit failed:", error);
      status = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
      messageStream = "";
      await scrollToBottom();
    }
  }

  async function createNewChat() {
    if (busy) return;

    status = "";
    messages = [];
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
  <div class="chat-window">
    {#if status}
      <div class="chat-status li-subtle">
        {status}
      </div>
    {/if}

    <div class="chat-log" bind:this={logElement} aria-live="polite">
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
          {/if}
        </div>
      {/each}

      {#if busy && messageStream.length === 0}
        <div class="msg assistant">
          <div class="msg-md msg-pending" role="status" aria-live="polite">
            <span class="typing-indicator" aria-hidden="true">
              <span></span><span></span><span></span>
            </span>
            <span class="typing-text"></span>
          </div>
        </div>
      {/if}

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
  }

  .msg-md :global(p) {
    margin: 0 0 0.75em;
  }

  .msg-md :global(pre) {
    max-width: 100%;
    overflow-x: auto;
    white-space: pre-wrap;
  }

  .msg-md :global(code) {
    white-space: pre-wrap;
  }

  .msg-error {
    color: var(--danger);
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