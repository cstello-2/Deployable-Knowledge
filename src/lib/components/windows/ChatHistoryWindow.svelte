<script lang="ts">
  import { getContext, onMount } from "svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import type { WindowInstanceProps } from "./index";
  import type { AppState } from "$lib/state.svelte";
  import type { Session } from "$lib/server/database/schema";

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
      body: JSON.stringify({ title }),
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

  async function handleSessionKeydown(event: KeyboardEvent, session: Session) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();

    appState.currentSession = session;
  }

  async function renameSession(session: Session) {
    const title = prompt("Rename chat title:", session.title || "");
    if (title == null) return;

    await saveSessionTitle(session.id, title);
    await refreshSessions();

    if (appState.currentSession?.id === session.id) {
      appState.currentSession = sessions.find(
        (item) => item.id === session.id,
      );
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
            onclick={() => {
              appState.currentSession = session;
            }}
            onkeydown={(event) => handleSessionKeydown(event, session)}
          >
            <div class="document-row">
              <span class="li-title">{session.title || "Untitled chat"}</span>
              <span class="li-right">{formatDate(session.updatedAt)}</span>
            </div>
            <div class="li-actions">
              <button
                class="btn"
                type="button"
                onclick={(event) => {
                  event.stopPropagation();
                  renameSession(session);
                }}
              >
                Rename
              </button>
              <button
                class="btn btn-danger"
                type="button"
                onclick={(event) => {
                  event.stopPropagation();
                  deleteSession(session);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</BaseWindow>

<style>
  .session-row {
    cursor: pointer;
  }

  .session-row:focus-visible {
    outline: 2px solid hsl(var(--h) var(--sat) calc(var(--l-border) + 18%));
    outline-offset: 2px;
  }

  .document-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
</style>
