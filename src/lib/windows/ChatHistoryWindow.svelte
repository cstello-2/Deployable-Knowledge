<script lang="ts">
  import { onMount } from "svelte";
  import BaseWindow from "$lib/components/BaseWindow.svelte";
  import { errorMessage } from "$lib/errors";
  import {
    currentSessionId,
    deleteSession,
    loadSession,
    refreshSessions,
    renameSession,
    sessions,
  } from "$lib/sessionState";
  import type { SessionSummary } from "$lib/sdk";
  import type { WindowInstanceProps } from "./index.ts";

  let {
    id,
    title,
    closable = false,
    height = null,
    collapsed = false,
    onToggleCollapse = () => {},
    onClose = () => {},
  }: WindowInstanceProps = $props();

  let loading = $state(false);
  let status = $state("");
  let busySessionId = $state<string | null>(null);

  onMount(() => {
    void loadSessions();
  });

  async function loadSessions() {
    loading = true;
    status = "";

    try {
      await refreshSessions();
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  async function selectSession(sessionId: string) {
    if (busySessionId) return;
    busySessionId = sessionId;
    status = "";

    try {
      await loadSession(sessionId);
    } catch (error) {
      status = errorMessage(error);
    } finally {
      busySessionId = null;
    }
  }

  async function renameChat(event: MouseEvent, summary: SessionSummary) {
    event.stopPropagation();
    const title = window.prompt("Rename chat title:", summary.title || "");
    if (title === null) return;

    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === summary.title) return;

    busySessionId = summary.session_id;
    status = "";

    try {
      await renameSession(summary.session_id, nextTitle);
    } catch (error) {
      status = errorMessage(error);
    } finally {
      busySessionId = null;
    }
  }

  async function deleteChat(event: MouseEvent, sessionId: string) {
    event.stopPropagation();
    if (!window.confirm("Delete this chat history?")) return;

    busySessionId = sessionId;
    status = "";

    try {
      await deleteSession(sessionId);
    } catch (error) {
      status = errorMessage(error);
    } finally {
      busySessionId = null;
    }
  }

  function handleSessionKeydown(event: KeyboardEvent, sessionId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void selectSession(sessionId);
  }

  function formatDate(value: string) {
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
    {#if status}
      <div class="chat-status li-subtle">{status}</div>
    {/if}

    <div class="list">
      {#if loading}
        <div class="list-item empty-state">Loading chat history...</div>
      {:else if !$sessions.length}
        <div class="list-item empty-state">No chat history yet.</div>
      {:else}
        {#each $sessions as summary (summary.session_id)}
          <div
            class="list-item session-row"
            class:selected={summary.session_id === $currentSessionId}
            role="button"
            tabindex="0"
            onclick={() => selectSession(summary.session_id)}
            onkeydown={(event) =>
              handleSessionKeydown(event, summary.session_id)}
          >
            <div class="document-row">
              <span class="li-title">{summary.title || "Untitled chat"}</span>
              <span class="li-right">{formatDate(summary.created_at)}</span>
            </div>
            <div class="li-actions">
              <button
                class="btn"
                type="button"
                disabled={busySessionId === summary.session_id}
                onclick={(event) => renameChat(event, summary)}
              >
                Rename
              </button>
              <button
                class="btn btn-danger"
                type="button"
                disabled={busySessionId === summary.session_id}
                onclick={(event) => deleteChat(event, summary.session_id)}
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
