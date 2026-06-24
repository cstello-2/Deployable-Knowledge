<script lang="ts">
  import { getContext, onMount } from "svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import type { AppState } from "$lib/state.svelte";
  import type { NotebookPage, NotebookWithPages } from "$lib/server/database/schema";
  import type { WindowInstanceProps } from "./index";

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

  let notes = $state("");
  let selectorOpen = $state(false);
  let loading = $state(false);
  let saveStatus = $state("");
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let selectedNotebookText = $state("");
  let notebookSelectionButtonVisible = $state(false);

  function applyState(data: { activeNotebookId: string | null; notebooks: NotebookWithPages[] }) {
    appState.notebooks = data.notebooks ?? [];
    appState.activeNotebookId = data.activeNotebookId ?? appState.notebooks[0]?.id ?? null;
    appState.activeNotebook = appState.notebooks.find((nb) => nb.id === appState.activeNotebookId) ?? appState.notebooks[0] ?? null;
    appState.activePage = appState.activeNotebook?.pages.find((p) => p.id === appState.activeNotebook?.activePageId) ?? appState.activeNotebook?.pages[0] ?? null;
    notes = appState.activePage?.content ?? "";
  }

  async function loadNotebooks() {
    loading = true;
    try {
      const res = await fetch("/notebooks");
      if (!res.ok) { showToast("Notebook failed to load"); return; }
      applyState(await res.json());
    } finally {
      loading = false;
    }
  }

  async function saveCurrentPage() {
    const nb = appState.activeNotebook;
    const page = appState.activePage;
    if (!nb || !page) return;

    const res = await fetch(`/notebooks/${nb.id}/pages/${page.id}/update`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: notes }),
    });

    if (!res.ok) { saveStatus = "Save failed"; return; }
    appState.notebooks = (await res.json()).notebooks ?? appState.notebooks;
    saveStatus = "Saved";
  }

  function queueSaveCurrentPage() {
    saveStatus = "Saving…";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveCurrentPage(); }, 350);
  }

  async function selectNotebook(notebookId: string) {
    if (saveTimer) { clearTimeout(saveTimer); await saveCurrentPage(); }
    const res = await fetch(`/notebooks/${notebookId}/select`, { method: "POST" });
    if (!res.ok) { showToast("Failed to select notebook"); return; }
    applyState(await res.json());
  }

  async function selectPage(page: NotebookPage) {
    const nb = appState.activeNotebook;
    if (!nb) return;
    if (saveTimer) { clearTimeout(saveTimer); await saveCurrentPage(); }
    const res = await fetch(`/notebooks/${nb.id}/pages/${page.id}/select`, { method: "POST" });
    if (!res.ok) { showToast("Failed to select page"); return; }
    applyState(await res.json());
    selectorOpen = false;
  }

  async function createNotebook() {
    const notebookTitle = window.prompt("Notebook name", "New Notebook");
    if (notebookTitle === null) return;
    const res = await fetch("/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: notebookTitle.trim() || "New Notebook" }),
    });
    if (!res.ok) { showToast("Failed to create notebook"); return; }
    applyState(await res.json());
    showToast("Notebook created");
  }

  async function createPage() {
    const nb = appState.activeNotebook;
    if (!nb) return;
    const pageTitle = window.prompt("Page name", `Page ${nb.pages.length + 1}`);
    if (pageTitle === null) return;
    const res = await fetch(`/notebooks/${nb.id}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: pageTitle.trim() || `Page ${nb.pages.length + 1}` }),
    });
    if (!res.ok) { showToast("Failed to create page"); return; }
    applyState(await res.json());
    showToast("Page created");
  }

  async function deleteNotebook(notebookId: string) {
    const nb = appState.notebooks.find((n) => n.id === notebookId);
    if (!nb || !window.confirm(`Delete "${nb.title}"?`)) return;
    const res = await fetch(`/notebooks/${notebookId}/delete`, { method: "DELETE" });
    if (!res.ok) { showToast("Failed to delete notebook"); return; }
    applyState(await res.json());
    showToast("Notebook deleted");
  }

  async function deletePage(page: NotebookPage) {
    const nb = appState.activeNotebook;
    if (!nb || !window.confirm(`Delete "${page.title}"?`)) return;
    const res = await fetch(`/notebooks/${nb.id}/pages/${page.id}/delete`, { method: "DELETE" });
    if (!res.ok) { showToast("Failed to delete page"); return; }
    applyState(await res.json());
    showToast("Page deleted");
  }

  async function clearNotes() {
    notes = "";
    await saveCurrentPage();
  }

  function handleNotebookSelection() {
    const textarea = document.querySelector<HTMLTextAreaElement>(".notebook-textarea");
    if (!textarea) return;
    const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).trim();
    selectedNotebookText = selected;
    notebookSelectionButtonVisible = selected.length > 0;
  }

  function sendSelectionToChat() {
    if (!selectedNotebookText.trim()) return;
    window.dispatchEvent(new CustomEvent("dk:send-to-chat", { detail: { text: selectedNotebookText.trim() } }));
    notebookSelectionButtonVisible = false;
    selectedNotebookText = "";
    saveStatus = "Sent to chat";
  }

  async function appendTextFromChat(event: Event) {
    const { text } = (event as CustomEvent<{ text: string }>).detail;
    if (!text?.trim() || !appState.activePage) return;
    notes = notes.trim() ? `${notes.trimEnd()}\n\n${text.trim()}` : text.trim();
    await saveCurrentPage();
    saveStatus = "Added from chat";
  }

  onMount(() => {
    loadNotebooks();
    window.addEventListener("dk:send-to-notebook", appendTextFromChat);
    return () => {
      window.removeEventListener("dk:send-to-notebook", appendTextFromChat);
      if (saveTimer) clearTimeout(saveTimer);
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
  contentLabel="Notebook content"
>
  <section class="notebook-main">
    <header class="notebook-header">
      <div>
        <h2>{appState.activePage?.title ?? appState.activeNotebook?.title ?? "Notebook"}</h2>
        <p>
          {#if loading}
            Loading notebook…
          {:else}
            {appState.activeNotebook?.title ?? "Scratch notes for your current work."}
            {#if saveStatus}
              · {saveStatus}
            {/if}
          {/if}
        </p>
      </div>

      <div class="notebook-actions">
        <button
          class="icon-action"
          class:active={selectorOpen}
          type="button"
          title="Open notebook selector"
          aria-label="Open notebook selector"
          aria-expanded={selectorOpen}
          data-window-action
          onclick={() => (selectorOpen = !selectorOpen)}
        >
          <Icon name="menu_book" size={17} />
        </button>

        <button class="btn btn-sm" type="button" onclick={clearNotes}>
          Clear
        </button>
      </div>
    </header>

    {#if selectorOpen && !collapsed}
      <div class="notebook-selector" data-window-action>
        <div class="tag-menu">
          <div class="tag-menu-title">Notebooks</div>
          <div class="tag-menu-list">
            {#each appState.notebooks as notebook (notebook.id)}
              <button
                class="tag-chip"
                class:selected={notebook.id === appState.activeNotebookId}
                type="button"
                title={notebook.title}
                onclick={() => selectNotebook(notebook.id)}
              >
                <span>{notebook.title}</span>
                <span
                  class="tag-chip-x"
                  aria-hidden="true"
                  onclick={(e) => { e.stopPropagation(); deleteNotebook(notebook.id); }}
                >
                  <Icon name="close" size={12} />
                </span>
              </button>
            {:else}
              <div class="li-subtle menu-empty">No notebooks yet.</div>
            {/each}
          </div>
          <button class="btn btn-sm" type="button" onclick={createNotebook}>
            <Icon name="add" size={14} /> New Notebook
          </button>
        </div>

        <div class="tag-menu">
          <div class="tag-menu-title">Pages</div>
          <div class="tag-menu-list">
            {#each appState.activeNotebook?.pages ?? [] as page (page.id)}
              <button
                class="tag-chip"
                class:selected={page.id === appState.activeNotebook?.activePageId}
                type="button"
                title={page.title}
                onclick={() => selectPage(page)}
              >
                <span>{page.title}</span>
                <span
                  class="tag-chip-x"
                  aria-hidden="true"
                  onclick={(e) => { e.stopPropagation(); deletePage(page); }}
                >
                  <Icon name="close" size={12} />
                </span>
              </button>
            {:else}
              <div class="li-subtle menu-empty">No pages yet.</div>
            {/each}
          </div>
          <button class="btn btn-sm" type="button" onclick={createPage}>
            <Icon name="add" size={14} /> New Page
          </button>
        </div>
      </div>
    {/if}

    <div class="notebook-editor-wrap">
      {#if notebookSelectionButtonVisible}
        <button
          class="selection-action notebook-selection-action"
          type="button"
          onclick={sendSelectionToChat}
        >
          Send to Chat
        </button>
      {/if}

      <textarea
        class="notebook-textarea"
        bind:value={notes}
        oninput={queueSaveCurrentPage}
        onmouseup={handleNotebookSelection}
        onkeyup={handleNotebookSelection}
       onblur={() => {
          window.setTimeout(() => {
            notebookSelectionButtonVisible = false;
          }, 180);
        }}
        placeholder="Write notes here..."
        aria-label="Notebook notes"
      ></textarea>
    </div>
  </section>

</BaseWindow>

<style>
  :global(.miniwin[data-window-id="notebook-window"] .content) {
    padding: 0;
  }

  :global(.miniwin[data-window-id="notebook-window"] .content-inner) {
    position: relative;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }

  .notebook-main {
    position: relative;
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    flex-direction: column;
  }

  .notebook-header {
    display: flex;
    min-height: 48px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(
      180deg,
      hsl(var(--h) var(--sat) calc(var(--l-elev) + 2%)),
      hsl(var(--h) var(--sat) calc(var(--l-panel) + 1%))
    );
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .notebook-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.25px;
  }

  .notebook-header p {
    margin: 3px 0 0;
    color: var(--muted);
    font-size: 11px;
  }

  .notebook-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .icon-action {
    display: inline-grid;
    width: 30px;
    height: 30px;
    min-width: 30px;
    min-height: 30px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--muted);
    cursor: pointer;
    place-items: center;
  }

  .icon-action:hover,
  .icon-action.active {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
    color: var(--text);
  }

  .notebook-selector {
    position: absolute;
    top: 56px;
    right: 10px;
    z-index: 100;
    display: flex;
    gap: 6px;
  }

  .notebook-selector :global(.tag-menu) {
    position: static;
    width: min(160px, 38vw);
  }

  .notebook-textarea {
    width: 100%;
    min-height: 0;
    padding: 14px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--text);
    line-height: 1.45;
    resize: none;
    flex: 1 1 auto;
  }
  .notebook-editor-wrap {
    position: relative;
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
  }

  .selection-action {
    position: absolute;
    z-index: 30;
    top: 10px;
    right: 14px;
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

  .notebook-selection-action {
    top: 10px;
    right: 14px;
  }

  .notebook-textarea:focus {
    border: 0;
    box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--accent) 35%, transparent);
    outline: none;
  }

</style>
