<script lang="ts">
  import { getContext, onMount } from "svelte";
  import type { SessionTitleRequest } from "$lib/requestTypes";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import type { WindowInstanceProps } from "./index";
  import type { AppState } from "$lib/state.svelte";
  import type { Session } from "$lib/server/database/schema";
  import { showWindow } from "$lib/utils/workspaceState";

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
  let sessions = $state<Session[]>([]);

  onMount(() => {
    refreshSessions();

    window.addEventListener("sessions:refresh", refreshSessions);
    return () => window.removeEventListener("sessions:refresh", refreshSessions);
  });

  async function refreshSessions() {
    sessions = await loadSessions();
  }

  async function loadSessions(): Promise<Session[]> {
    const resp = await fetch("/sessions", {
      method: "GET",
    });

    return (await resp.json()) as Session[];
  }

  async function saveSessionTitle(id: string, title: string) {
    await fetch(`/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title } satisfies SessionTitleRequest),
    });
  }

  async function removeSession(id: string) {
    await fetch(`/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    try {
      localStorage.removeItem(`dk:query-graph:${id}`);
    } catch {
      // Session deletion is complete even when browser storage is unavailable.
    }
  }

  function handleSessionClick(session: Session) {
    appState.currentSession = session;
    showWindow("chat-window");
  }

  async function handleSessionKeydown(event: KeyboardEvent, session: Session) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleSessionClick(session);
  }

  async function renameSession(session: Session) {
    const title = prompt("Rename chat title:", session.title || "");
    if (title == null) return;

    await saveSessionTitle(session.id, title);
    await refreshSessions();

    if (appState.currentSession?.id === session.id) {
      appState.currentSession = sessions.find((item) => item.id === session.id);
    }
  }

  async function deleteSession(session: Session) {
    if (!confirm("Delete this chat history?")) return;

    await removeSession(session.id);
    sessions = sessions.filter((item) => item.id !== session.id);

    if (appState.currentSession?.id === session.id) {
      appState.currentSession = sessions[0];
    }

    await refreshSessions();
  }

  function formatDate(value: string | number | Date | null) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
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
  contentLabel="Chat History"
>
  <div class="form">
    <div class="list">
      {#if !sessions.length}
        <div class="list-item empty-state">No chat history yet.</div>
      {:else}
        {#each sessions as session (session.id)}
          <div
            class="list-item session-row"
            class:selected={session.id === appState.currentSession?.id}
            role="button"
            tabindex="0"
            onclick={() => handleSessionClick(session)}
            onkeydown={(event) => handleSessionKeydown(event, session)}
          >
            <div class="session-main">
              <span class="li-title">{session.title || "Untitled chat"}</span>
              <span class="li-right">{formatDate(session.updatedAt)}</span>
            </div>

            <button
              class="inline-action-button session-action-button"
              type="button"
              aria-label="Rename chat"
              title="Rename chat"
              onclick={(event) => {
                event.stopPropagation();
                renameSession(session);
              }}
            >
              <Icon name="edit" size={16} />
            </button>

            <button
              class="inline-action-button session-action-button danger"
              type="button"
              aria-label="Delete chat"
              title="Delete chat"
              onclick={(event) => {
                event.stopPropagation();
                deleteSession(session);
              }}
            >
              <Icon name="delete" size={16} />
            </button>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</BaseWindow>

<style>
  .session-row {
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 0;
    align-items: stretch;
    overflow: hidden;
    padding: 0;
    cursor: pointer;
  }

  .session-row:focus-within {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px
      color-mix(in oklab, var(--accent) 45%, transparent);
  }

  .session-main {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px 12px;
    align-items: center;
    padding: 10px 12px;
  }

  .session-action-button {
    height: auto;
    min-height: 52px;
    align-self: stretch;
  }

  .session-row > .session-action-button:last-child {
    border-radius: 0 11px 11px 0;
  }

  @media (max-width: 680px) {
    .session-main {
      grid-template-columns: 1fr;
    }
  }
</style>
