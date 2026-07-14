<script lang="ts">
  import { getContext, onMount } from "svelte";
  import Dropdown from "$lib/components/menus/Dropdown.svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import { renderMarkdown } from "$lib/utils/markdown";
  import type { AppState } from "$lib/state.svelte";
  import type {
    Document,
    DocumentChunk,
    NotebookPage,
    NotebookSource,
    NotebookWithPages,
  } from "$lib/server/database/schema";
  import type { WindowInstanceProps } from "./index";

  // dk:send-to-notebook carries fully-composed text — just appended as plain text.
  type SendToNotebookDetail = { text: string };

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

  // Mirrors the shape returned by GET /notebooks/:id/sources — every real
  // field is derived from the schema types; only `preview` is computed
  // server-side and has no column of its own.
  type NotebookSourceItem = Pick<NotebookSource, "id" | "chunkId" | "createdAt"> &
    Pick<DocumentChunk, "pageIndex"> & {
      documentTitle: Document["title"];
      preview: string;
    };

  let notes = $state("");
  let previewMode = $state(false);
  let selectorOpen = $state(false);
  let loading = $state(false);
  let saveStatus = $state("");
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let editingId = $state<string | null>(null);
  let editingTitle = $state("");

  // Sources attached to the active notebook (via "Send to Notebook") — hidden
  // from the notebook page text, viewable here.
  let sourcesOpen = $state(false);
  let sources = $state<NotebookSourceItem[]>([]);
  let sourcesLoading = $state(false);

  function focusOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function startEdit(id: string, currentTitle: string) {
    editingId = id;
    editingTitle = currentTitle;
  }

  function cancelEdit() {
    editingId = null;
    editingTitle = "";
  }

  function toggleSources() {
    sourcesOpen = !sourcesOpen;
    if (sourcesOpen) selectorOpen = false;
  }

  function toggleSelector() {
    selectorOpen = !selectorOpen;
    if (selectorOpen) sourcesOpen = false;
  }

  $effect(() => {
    if (!collapsed) return;

    sourcesOpen = false;
    selectorOpen = false;
  });

  async function commitEdit(type: "notebook" | "page", id: string) {
    const title = editingTitle.trim();
    editingId = null;
    editingTitle = "";
    if (!title) return;
    if (type === "notebook") {
      await renameNotebook(id, title);
    } else {
      const page = appState.activeNotebook?.pages.find((p) => p.id === id);
      if (page) await renamePage(page, title);
    }
  }

  async function renameNotebook(notebookId: string, title: string) {
    const res = await fetch(`/notebooks/${notebookId}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) { showToast("Failed to rename notebook"); return; }
    applyState(await res.json());
  }

  async function renamePage(page: NotebookPage, title: string) {
    const nb = appState.activeNotebook;
    if (!nb) return;
    const res = await fetch(`/notebooks/${nb.id}/pages/${page.id}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) { showToast("Failed to rename page"); return; }
    applyState(await res.json());
  }

  function applyState(data: { activeNotebookId: string | null; notebooks: NotebookWithPages[] }) {
    appState.notebooks = data.notebooks ?? [];
    appState.activeNotebookId = data.activeNotebookId ?? appState.notebooks[0]?.id ?? null;
    appState.activeNotebook = appState.notebooks.find((nb) => nb.id === appState.activeNotebookId) ?? appState.notebooks[0] ?? null;
    appState.activePage = appState.activeNotebook?.pages.find((p) => p.id === appState.activeNotebook?.activePageId) ?? appState.activeNotebook?.pages[0] ?? null;
    notes = appState.activePage?.content ?? "";
    loadSources();
  }

  async function loadSources() {
    const notebookId = appState.activeNotebookId;
    if (!notebookId) { sources = []; return; }
    sourcesLoading = true;
    try {
      const res = await fetch(`/notebooks/${notebookId}/sources`);
      if (!res.ok) { sources = []; return; }
      const data = (await res.json()) as { sources: NotebookSourceItem[] };
      sources = data.sources ?? [];
    } finally {
      sourcesLoading = false;
    }
  }

  async function removeSource(sourceId: string) {
    const notebookId = appState.activeNotebookId;
    if (!notebookId) return;
    await fetch(`/notebooks/${notebookId}/sources/${sourceId}`, { method: "DELETE" });
    await loadSources();
  }

  async function clearAllSources() {
    const notebookId = appState.activeNotebookId;
    if (!notebookId || !sources.length) return;
    if (!window.confirm("Remove all sources attached to this notebook?")) return;
    await fetch(`/notebooks/${notebookId}/sources`, { method: "DELETE" });
    await loadSources();
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

  // Fired by the Send to Notebook button on an assistant reply the text is
  // already fully composed (reply + hydrated source excerpts), so just append it.
  async function appendTextFromChat(event: Event) {
    const { text } = (event as CustomEvent<SendToNotebookDetail>).detail;
    if (!text?.trim() || !appState.activePage) return;
    notes = notes.trim() ? `${notes.trimEnd()}\n\n${text.trim()}` : text.trim();
    await saveCurrentPage();
    saveStatus = "Added from chat";
  }

  onMount(() => {
    loadNotebooks();
    window.addEventListener("dk:send-to-notebook", appendTextFromChat);
    window.addEventListener("notebook-sources:refresh", loadSources);
    return () => {
      window.removeEventListener("dk:send-to-notebook", appendTextFromChat);
      window.removeEventListener("notebook-sources:refresh", loadSources);
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
        <Dropdown
          id="notebook_sources"
          bind:open={sourcesOpen}
          align="end"
          width="340px"
          maxHeight={430}
          role="dialog"
          ariaLabel="Loaded notebook sources"
          menuClass="notebook-sources-dropdown"
        >
          {#snippet trigger({ open, menuId })}
            <button
              class="icon-action"
              class:active={open}
              type="button"
              title="View loaded sources"
              aria-label="View loaded sources"
              aria-haspopup="dialog"
              aria-controls={menuId}
              aria-expanded={open}
              data-window-action
              onclick={toggleSources}
            >
              <Icon name="description" size={17} />
              {#if sources.length}
                <span class="source-count-badge">{sources.length}</span>
              {/if}
            </button>
          {/snippet}

          <div class="sources-panel" data-window-action>
            <header class="sources-panel-header">
              <span>Loaded Sources ({sources.length})</span>
              <button
                class="btn btn-sm btn-danger"
                type="button"
                disabled={!sources.length}
                onclick={clearAllSources}
              >
                Clear All
              </button>
            </header>

            <div class="sources-list">
              {#if sourcesLoading}
                <div class="sources-empty">Loading…</div>
              {:else if !sources.length}
                <div class="sources-empty">
                  No sources loaded yet. Use "Send to Notebook" on an assistant
                  reply to attach its sources.
                </div>
              {:else}
                {#each sources as source (source.id)}
                  <div class="source-row">
                    <button
                      class="source-remove"
                      type="button"
                      title="Remove source"
                      aria-label="Remove source"
                      onclick={() => removeSource(source.id)}
                    >
                      <Icon name="close" size={14} />
                    </button>
                    <div class="source-row-main">
                      <span class="source-doc-title">{source.documentTitle}</span>
                      <span class="source-page">Page {source.pageIndex + 1}</span>
                    </div>
                    <p class="source-preview">{source.preview}</p>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        </Dropdown>

        <button
          class="icon-action"
          class:active={previewMode}
          type="button"
          title={previewMode ? "Edit notes" : "Preview markdown"}
          aria-label={previewMode ? "Edit notes" : "Preview markdown"}
          aria-pressed={previewMode}
          data-window-action
          onclick={() => (previewMode = !previewMode)}
        >
          <Icon name={previewMode ? "edit" : "visibility"} size={17} />
        </button>

        <Dropdown
          id="notebook_selector"
          bind:open={selectorOpen}
          align="end"
          width="320px"
          maxHeight={430}
          role="dialog"
          ariaLabel="Choose notebook and page"
          menuClass="notebook-selector-dropdown"
        >
          {#snippet trigger({ open, menuId })}
            <button
              class="icon-action"
              class:active={open}
              type="button"
              title="Open notebook selector"
              aria-label="Open notebook selector"
              aria-haspopup="dialog"
              aria-controls={menuId}
              aria-expanded={open}
              data-window-action
              onclick={toggleSelector}
            >
              <Icon name="menu_book" size={17} />
            </button>
          {/snippet}

          <div class="notebook-selector" data-window-action>
            <section class="selector-column">
              <header class="selector-header">
                <span>Notebooks</span>
                <div class="inline-button-group selector-actions">
                  <button
                    class="inline-action-button"
                    type="button"
                    title="Create notebook"
                    aria-label="Create notebook"
                    onclick={createNotebook}
                  >
                    <Icon name="add" size={16} />
                  </button>
                  <button
                    class="inline-action-button danger"
                    type="button"
                    title="Delete selected notebook"
                    aria-label="Delete selected notebook"
                    onclick={() =>
                      appState.activeNotebookId &&
                      deleteNotebook(appState.activeNotebookId)}
                  >
                    <Icon name="delete" size={16} />
                  </button>
                </div>
              </header>

              <div class="selector-list">
                {#each appState.notebooks as notebook (notebook.id)}
                  <button
                    class="selector-item"
                    class:active={notebook.id === appState.activeNotebookId}
                    type="button"
                    title={notebook.title}
                    onclick={() => selectNotebook(notebook.id)}
                    ondblclick={(event) => {
                      event.stopPropagation();
                      startEdit(`nb-${notebook.id}`, notebook.title);
                    }}
                  >
                    {#if editingId === `nb-${notebook.id}`}
                      <input
                        class="item-edit-input"
                        type="text"
                        bind:value={editingTitle}
                        use:focusOnMount
                        onclick={(event) => event.stopPropagation()}
                        onblur={() => commitEdit("notebook", notebook.id)}
                        onkeydown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          else if (event.key === "Escape") cancelEdit();
                        }}
                      />
                    {:else}
                      {notebook.title}
                    {/if}
                  </button>
                {/each}
              </div>
            </section>

            <section class="selector-column">
              <header class="selector-header">
                <span>Pages</span>
                <div class="inline-button-group selector-actions">
                  <button
                    class="inline-action-button"
                    type="button"
                    title="Create page"
                    aria-label="Create page"
                    onclick={createPage}
                  >
                    <Icon name="add" size={16} />
                  </button>
                  <button
                    class="inline-action-button danger"
                    type="button"
                    title="Delete selected page"
                    aria-label="Delete selected page"
                    onclick={() =>
                      appState.activePage && deletePage(appState.activePage)}
                  >
                    <Icon name="delete" size={16} />
                  </button>
                </div>
              </header>

              <div class="selector-list">
                {#each appState.activeNotebook?.pages ?? [] as page (page.id)}
                  <button
                    class="selector-item"
                    class:active={
                      page.id === appState.activeNotebook?.activePageId
                    }
                    type="button"
                    title={page.title}
                    onclick={() => selectPage(page)}
                    ondblclick={(event) => {
                      event.stopPropagation();
                      startEdit(`pg-${page.id}`, page.title);
                    }}
                  >
                    {#if editingId === `pg-${page.id}`}
                      <input
                        class="item-edit-input"
                        type="text"
                        bind:value={editingTitle}
                        use:focusOnMount
                        onclick={(event) => event.stopPropagation()}
                        onblur={() => commitEdit("page", page.id)}
                        onkeydown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          else if (event.key === "Escape") cancelEdit();
                        }}
                      />
                    {:else}
                      {page.title}
                    {/if}
                  </button>
                {/each}
              </div>
            </section>
          </div>
        </Dropdown>

      </div>
    </header>

    <div class="notebook-editor-wrap">
      {#if previewMode}
        <div class="notebook-preview" aria-label="Notebook preview">
          {#if notes.trim()}
            <div class="msg-md">{@html renderMarkdown(notes)}</div>
          {:else}
            <p class="notebook-preview-empty">Nothing to preview yet.</p>
          {/if}
        </div>
      {:else}
        <textarea
          class="notebook-textarea"
          bind:value={notes}
          oninput={queueSaveCurrentPage}
          placeholder="Write notes here..."
          aria-label="Notebook notes"
        ></textarea>
      {/if}
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
    position: relative;
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

  .source-count-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    display: inline-grid;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    border-radius: 999px;
    background: var(--accent);
    color: hsl(var(--h) var(--sat) 8%);
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    place-items: center;
  }

  :global(.notebook-sources-dropdown),
  :global(.notebook-selector-dropdown) {
    padding: 0;
    overflow: hidden;
  }

  .sources-panel {
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    flex: 1 1 auto;
    flex-direction: column;
  }

  .sources-panel-header {
    display: flex;
    min-height: 36px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
  }

  .sources-list {
    display: flex;
    min-height: 0;
    overflow-y: auto;
    padding: 6px;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 6px;
    max-height: min(380px, calc(100vh - 96px));
  }

  .sources-empty {
    padding: 12px 8px;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
  }

  .source-row {
    position: relative;
    padding: 8px 28px 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 2%));
  }

  .source-row-main {
    display: flex;
    align-items: baseline;
    gap: 6px;
    overflow: hidden;
  }

  .source-doc-title {
    overflow: hidden;
    color: var(--text);
    font-size: 12px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-page {
    flex: 0 0 auto;
    color: var(--muted);
    font-size: 11px;
  }

  .source-preview {
    margin: 4px 0 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .source-remove {
    position: absolute;
    top: 6px;
    right: 6px;
    display: inline-grid;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    place-items: center;
  }

  .source-remove:hover {
    background: color-mix(in oklab, #ff6b6b 14%, transparent);
    color: color-mix(in oklab, #ff6b6b 78%, var(--text));
  }

  .notebook-selector {
    display: grid;
    width: 100%;
    height: min(420px, calc(100vh - 96px));
    min-height: 0;
    overflow: hidden;
    grid-template-columns: 1fr 1fr;
  }

  .selector-column {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
  }

  .selector-column + .selector-column {
    border-left: 1px solid var(--border);
  }

  .selector-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    min-height: 36px;
    padding: 5px;
    border-bottom: 1px solid var(--border);
    align-items: center;
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
  }

  .selector-header span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selector-actions {
    width: 58px;
    height: 24px;
    grid-auto-columns: 28px;
    border-radius: 8px;
  }

  .selector-actions .inline-action-button {
    width: 28px;
    min-width: 28px;
    height: 24px;
    min-height: 24px;
  }

  .selector-list {
    display: flex;
    min-height: 0;
    overflow-y: auto;
    padding: 6px;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 4px;
  }

  .selector-item {
    width: 100%;
    min-height: 30px;
    padding: 7px 8px;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selector-item:hover {
    border-color: var(--border);
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 2%));
  }

  .selector-item.active {
    border-color: color-mix(in oklab, var(--accent) 50%, var(--border));
    background: color-mix(in oklab, var(--accent) 14%, transparent);
  }

  .item-edit-input {
    width: 100%;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: inherit;
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

  .notebook-textarea:focus {
    border: 0;
    box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--accent) 35%, transparent);
    outline: none;
  }

  .notebook-preview {
    width: 100%;
    min-height: 0;
    padding: 14px;
    overflow: auto;
    flex: 1 1 auto;
  }

  .notebook-preview-empty {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
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

</style>
