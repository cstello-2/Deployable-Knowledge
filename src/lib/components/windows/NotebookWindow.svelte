<script lang="ts">
  import { getContext, onMount } from "svelte";
  import type {
    NotebookPageContentRequest,
    NotebookPageTitleRequest,
    NotebookTitleRequest,
  } from "$lib/requestTypes";
  import Dropdown from "$lib/components/menus/Dropdown.svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import { renderMarkdown } from "$lib/utils/markdown";
  import {
    NOTEBOOK_CONTEXT_CHANGED_EVENT,
    type NotebookContextChangedDetail,
    notebookProvidesContext as notebookIsSelectedForContext,
    pageProvidesNotebookContext,
    restoreNotebookContextPageIds,
    toggleNotebookContextNotebook,
    toggleNotebookContextPage,
  } from "$lib/utils/notebookContextSelection";
  import { applyNotebookState } from "$lib/utils/notebookState";
  import {
    NOTEBOOK_TEXT_CHARACTER_LIMIT,
    NOTEBOOK_TEXT_WARNING_CHARACTER_COUNT,
  } from "$lib/utils/contextLimits";
  import type { AppState } from "$lib/state.svelte";
  import type {
    Document,
    DocumentChunk,
    NotebookPage,
    NotebookSource,
    NotebookWithPages,
  } from "$lib/server/database/schema";
  import type { WindowInstanceProps } from "./index";

  type NotebookView = "notebooks" | "pages" | "editor";

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
      sourceType: Document["sourceType"];
      preview: string;
    };

  let notes = $state("");
  let previewMode = $state(false);
  let notebookView = $state<NotebookView>("editor");
  let loading = $state(false);
  let saveStatus = $state("");
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let selectedNotebookText = $state("");
  let notebookSelectionButtonVisible = $state(false);
  let notebookLocked = $derived(appState.assistantRequestInFlight);
  let otherPageCharacterCount = $derived(
    appState.activeNotebook?.pages.reduce(
      (total, page) =>
        page.id === appState.activePage?.id
          ? total
          : total + page.content.length,
      0,
    ) ?? 0,
  );
  let currentPageCharacterLimit = $derived(
    Math.max(0, NOTEBOOK_TEXT_CHARACTER_LIMIT - otherPageCharacterCount),
  );
  let notebookCharacterCount = $derived(
    otherPageCharacterCount + notes.length,
  );
  let notebookCharactersRemaining = $derived(
    Math.max(0, NOTEBOOK_TEXT_CHARACTER_LIMIT - notebookCharacterCount),
  );
  let notebookNearLimit = $derived(
    notebookCharacterCount >= NOTEBOOK_TEXT_WARNING_CHARACTER_COUNT,
  );
  let notebookAtLimit = $derived(
    notebookCharacterCount >= NOTEBOOK_TEXT_CHARACTER_LIMIT,
  );

  // Sources attached to the active notebook (via "Send to Notebook") — hidden
  // from the notebook page text, viewable here.
  let sourcesOpen = $state(false);
  let sources = $state<NotebookSourceItem[]>([]);
  let sourcesLoading = $state(false);

  function toggleSources() {
    if (notebookLocked) return;
    sourcesOpen = !sourcesOpen;
  }

  function showNotebooks() {
    if (notebookLocked) return;
    sourcesOpen = false;
    notebookView = "notebooks";
  }

  function showPages() {
    if (notebookLocked) return;
    sourcesOpen = false;
    notebookView = appState.activeNotebook ? "pages" : "notebooks";
  }

  function navigateBack() {
    if (notebookLocked) return;
    if (notebookView === "editor") {
      showPages();
    } else if (notebookView === "pages") {
      showNotebooks();
    }
  }

  $effect(() => {
    if (collapsed) sourcesOpen = false;
  });

  $effect(() => {
    if (!notebookLocked) return;
    sourcesOpen = false;
    notebookSelectionButtonVisible = false;
    selectedNotebookText = "";
  });

  function applyState(data: { activeNotebookId: string | null; notebooks: NotebookWithPages[] }) {
    applyNotebookState(appState, data);
    notes = appState.activePage?.content ?? "";
    loadSources();
  }

  function pageProvidesContext(pageId: string) {
    return pageProvidesNotebookContext(appState, pageId);
  }

  function notebookProvidesContext(notebook: NotebookWithPages) {
    return notebookIsSelectedForContext(appState, notebook);
  }

  function togglePageContext(pageId: string) {
    if (notebookLocked) return;
    toggleNotebookContextPage(appState, pageId);
  }

  function toggleNotebookContext(notebook: NotebookWithPages) {
    if (notebookLocked) return;
    toggleNotebookContextNotebook(appState, notebook);
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
    if (notebookLocked) return;
    const notebookId = appState.activeNotebookId;
    if (!notebookId) return;
    await fetch(`/notebooks/${notebookId}/sources/${sourceId}`, { method: "DELETE" });
    await loadSources();
  }

  async function clearAllSources() {
    if (notebookLocked) return;
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
      if (!appState.activeNotebook) notebookView = "notebooks";
      else if (!appState.activePage) notebookView = "pages";
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
      body: JSON.stringify({
        content: notes,
      } satisfies NotebookPageContentRequest),
    });

    if (!res.ok) {
      if (res.status === 413) {
        saveStatus = "Limit reached";
        showToast(
          `Notebook text is limited to ${NOTEBOOK_TEXT_CHARACTER_LIMIT.toLocaleString()} characters`,
        );
        return;
      }

      saveStatus = "Save failed";
      return;
    }
    appState.notebooks = (await res.json()).notebooks ?? appState.notebooks;
    saveStatus = "Saved";
  }

  function queueSaveCurrentPage() {
    if (notebookLocked) return;
    saveStatus = "Saving…";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveCurrentPage();
    }, 350);
  }

  async function flushPendingSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    await saveCurrentPage();
  }

  async function selectNotebook(notebookId: string): Promise<boolean> {
    if (notebookLocked) return false;
    await flushPendingSave();
    const res = await fetch(`/notebooks/${notebookId}/select`, { method: "POST" });
    if (!res.ok) { showToast("Failed to select notebook"); return false; }
    applyState(await res.json());
    return true;
  }

  async function selectPage(page: NotebookPage): Promise<boolean> {
    if (notebookLocked) return false;
    const nb = appState.activeNotebook;
    if (!nb) return false;
    await flushPendingSave();
    const res = await fetch(`/notebooks/${nb.id}/pages/${page.id}/select`, { method: "POST" });
    if (!res.ok) { showToast("Failed to select page"); return false; }
    applyState(await res.json());
    return true;
  }

  async function openNotebookPages(notebookId: string) {
    if (notebookLocked) return;
    const selected =
      notebookId === appState.activeNotebookId ||
      (await selectNotebook(notebookId));

    if (selected) notebookView = "pages";
  }

  async function navigateToPage(page: NotebookPage) {
    if (notebookLocked) return;
    const selected =
      page.id === appState.activePage?.id || (await selectPage(page));

    if (selected) {
      sourcesOpen = false;
      notebookView = "editor";
    }
  }

  async function createNotebook() {
    if (notebookLocked) return;
    const requestedTitle = window.prompt("Notebook name", "New Notebook");
    if (requestedTitle === null) return;
    await flushPendingSave();

    const res = await fetch("/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: requestedTitle.trim() || "New Notebook",
      } satisfies NotebookTitleRequest),
    });

    if (!res.ok) {
      showToast("Failed to create notebook");
      return;
    }

    applyState(await res.json());
    notebookView = "editor";
    showToast("Notebook created");
  }

  async function createPage() {
    if (notebookLocked) return;
    const notebook = appState.activeNotebook;
    if (!notebook) return;

    const defaultTitle = `Page ${notebook.pages.length + 1}`;
    const requestedTitle = window.prompt("Page name", defaultTitle);
    if (requestedTitle === null) return;
    await flushPendingSave();

    const res = await fetch(`/notebooks/${notebook.id}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: requestedTitle.trim() || defaultTitle,
      } satisfies NotebookPageTitleRequest),
    });

    if (!res.ok) {
      showToast("Failed to create page");
      return;
    }

    applyState(await res.json());
    notebookView = "editor";
    showToast("Page created");
  }

  async function renameNotebook(notebook: NotebookWithPages) {
    if (notebookLocked) return;
    const requestedTitle = window.prompt("Rename notebook", notebook.title);
    const nextTitle = requestedTitle?.trim();
    if (!nextTitle || nextTitle === notebook.title) return;

    await flushPendingSave();
    const res = await fetch(`/notebooks/${notebook.id}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
      } satisfies NotebookTitleRequest),
    });

    if (!res.ok) {
      showToast("Failed to rename notebook");
      return;
    }

    applyState(await res.json());
    showToast("Notebook renamed");
  }

  async function renamePage(page: NotebookPage) {
    if (notebookLocked) return;
    const notebook = appState.activeNotebook;
    if (!notebook) return;

    const requestedTitle = window.prompt("Rename page", page.title);
    const nextTitle = requestedTitle?.trim();
    if (!nextTitle || nextTitle === page.title) return;

    await flushPendingSave();
    const res = await fetch(`/notebooks/${notebook.id}/pages/${page.id}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
      } satisfies NotebookPageTitleRequest),
    });

    if (!res.ok) {
      showToast("Failed to rename page");
      return;
    }

    applyState(await res.json());
    showToast("Page renamed");
  }

  async function deleteNotebook(notebook: NotebookWithPages) {
    if (notebookLocked) return;
    const pageLabel = notebook.pages.length === 1 ? "page" : "pages";
    if (
      !window.confirm(
        `Delete “${notebook.title}” and its ${notebook.pages.length} ${pageLabel}? This cannot be undone.`,
      )
    ) {
      return;
    }

    await flushPendingSave();
    const res = await fetch(`/notebooks/${notebook.id}/delete`, {
      method: "DELETE",
    });

    if (!res.ok) {
      showToast("Failed to delete notebook");
      return;
    }

    applyState(await res.json());
    notebookView = "notebooks";
    showToast("Notebook deleted");
  }

  async function deletePage(page: NotebookPage) {
    if (notebookLocked) return;
    const notebook = appState.activeNotebook;
    if (!notebook) return;

    if (
      !window.confirm(
        `Delete “${page.title}”? This cannot be undone.`,
      )
    ) {
      return;
    }

    await flushPendingSave();
    const res = await fetch(
      `/notebooks/${notebook.id}/pages/${page.id}/delete`,
      { method: "DELETE" },
    );

    if (!res.ok) {
      showToast("Failed to delete page");
      return;
    }

    applyState(await res.json());
    notebookView = "pages";
    showToast("Page deleted");
  }

  function pagePreview(content: string) {
    const compact = content.replace(/\s+/g, " ").trim();
    if (!compact) return "Empty page";
    return compact.length > 100 ? `${compact.slice(0, 100).trimEnd()}…` : compact;
  }

  async function handleNotebooksUpdated() {
    await loadNotebooks();
    notebookView = appState.activePage ? "editor" : "pages";
  }

  function handleNotebookSelection(event: Event) {
    if (notebookLocked) return;
    const textarea = event.currentTarget as HTMLTextAreaElement;
    const selected = textarea.value
      .slice(textarea.selectionStart, textarea.selectionEnd)
      .trim();
    selectedNotebookText = selected;
    notebookSelectionButtonVisible = selected.length > 0;
  }

  function sendSelectionToChat() {
    if (notebookLocked) return;
    const text = selectedNotebookText.trim();
    if (!text) return;
    window.dispatchEvent(new CustomEvent("dk:send-to-chat", {
      detail: { text },
    }));
    notebookSelectionButtonVisible = false;
    selectedNotebookText = "";
    saveStatus = "Sent to chat";
  }

  function togglePreviewMode() {
    if (notebookLocked) return;
    previewMode = !previewMode;
  }

  onMount(() => {
    restoreNotebookContextPageIds(appState);
    void loadNotebooks();
    const handleNotebookContextChanged = (event: Event) => {
      if (notebookLocked) return;
      const detail = (event as CustomEvent<NotebookContextChangedDetail>).detail;
      if (!detail?.pageIds || !detail?.notebookIds) return;
      appState.notebookContextNotebookIds = [...detail.notebookIds];
      appState.notebookContextPageIds = [...detail.pageIds];
    };
    window.addEventListener("notebook-sources:refresh", loadSources);
    window.addEventListener("dk:notebooks-updated", handleNotebooksUpdated);
    window.addEventListener(
      NOTEBOOK_CONTEXT_CHANGED_EVENT,
      handleNotebookContextChanged,
    );
    return () => {
      window.removeEventListener("notebook-sources:refresh", loadSources);
      window.removeEventListener("dk:notebooks-updated", handleNotebooksUpdated);
      window.removeEventListener(
        NOTEBOOK_CONTEXT_CHANGED_EVENT,
        handleNotebookContextChanged,
      );
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
  controlsDisabled={notebookLocked}
  {onToggleCollapse}
  {onClose}
  contentLabel="Notebook content"
>
  <fieldset
    class="notebook-main"
    disabled={notebookLocked}
    aria-busy={notebookLocked}
  >
    <header class="notebook-header">
      <div class="notebook-heading-row">
        {#if notebookView !== "notebooks"}
          <button
            class="notebook-back"
            type="button"
            title={notebookView === "editor" ? "Back to pages" : "Back to notebooks"}
            aria-label={notebookView === "editor" ? "Back to pages" : "Back to notebooks"}
            onclick={navigateBack}
          >
            <Icon name="arrow_back" size={18} />
          </button>
        {/if}

        <div class="notebook-heading">
          {#if loading}
            <h2>Loading notebook…</h2>
            <p>Loading your workspace</p>
          {:else if notebookView === "notebooks"}
            <h2>Notebooks</h2>
            <p>{appState.notebooks.length} available</p>
          {:else if notebookView === "pages"}
            <h2>{appState.activeNotebook?.title ?? "Notebook"}</h2>
            <p>{appState.activeNotebook?.pages.length ?? 0} pages</p>
          {:else}
            <h2>{appState.activePage?.title ?? "Page"}</h2>
            <p>
              {appState.activeNotebook?.title ?? "Notebook"}
              {#if saveStatus}
                · {saveStatus}
              {/if}
            </p>
          {/if}
        </div>
      </div>

      {#if notebookView === "notebooks"}
        <div class="inline-button-group notebook-create-actions">
          <button
            class="inline-action-button"
            type="button"
            title="Create notebook"
            aria-label="Create notebook"
            onclick={createNotebook}
          >
            <Icon name="add" size={17} />
          </button>
        </div>
      {:else if notebookView === "pages"}
        <div class="inline-button-group notebook-create-actions">
          <button
            class="inline-action-button"
            type="button"
            title="Create page"
            aria-label="Create page"
            onclick={createPage}
          >
            <Icon name="add" size={17} />
          </button>
        </div>
      {:else}
        <div class="notebook-actions">
          {#if appState.activePage}
            <button
              class="icon-action context-toggle"
              class:active={pageProvidesContext(appState.activePage.id)}
              type="button"
              title={pageProvidesContext(appState.activePage.id)
                ? "Remove this page from context"
                : "Use this page for context"}
              aria-label={pageProvidesContext(appState.activePage.id)
                ? "Remove this page from context"
                : "Use this page for context"}
              aria-pressed={pageProvidesContext(appState.activePage.id)}
              onclick={() => togglePageContext(appState.activePage!.id)}
            >
              <Icon name="library_add_check" size={17} />
            </button>
          {/if}
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
                disabled={notebookLocked}
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
                  disabled={notebookLocked || !sources.length}
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
                        disabled={notebookLocked}
                        onclick={() => removeSource(source.id)}
                      >
                        <Icon name="close" size={14} />
                      </button>
                      <div class="source-row-main">
                        <span class="source-doc-title">{source.documentTitle}</span>
                        {#if source.sourceType !== "DOCX"}
                          <span class="source-page">Page {source.pageIndex + 1}</span>
                        {/if}
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
            onclick={togglePreviewMode}
          >
            <Icon name={previewMode ? "edit" : "visibility"} size={17} />
          </button>
        </div>
      {/if}
    </header>

    {#if notebookView === "notebooks"}
      <nav class="notebook-browser" aria-label="Notebooks">
        <div class="navigation-list">
          {#if appState.notebooks.length}
            {#each appState.notebooks as notebook (notebook.id)}
              <div
                class="navigation-item"
                class:active={notebook.id === appState.activeNotebookId}
              >
                <button
                  class="navigation-target"
                  type="button"
                  aria-current={notebook.id === appState.activeNotebookId
                    ? "true"
                    : undefined}
                  onclick={() => openNotebookPages(notebook.id)}
                >
                  <span class="entity-navigation-icon">
                    <Icon name="menu_book" size={20} />
                  </span>
                  <span class="navigation-item-copy">
                    <strong>{notebook.title}</strong>
                    <small>
                      {notebook.pages.length}
                      {notebook.pages.length === 1 ? "page" : "pages"}
                    </small>
                  </span>
                </button>
                <button
                  class="inline-action-button navigation-row-action context-toggle"
                  class:active={notebookProvidesContext(notebook)}
                  type="button"
                  title={notebookProvidesContext(notebook)
                    ? `Remove ${notebook.title} from context`
                    : `Use ${notebook.title} for context`}
                  aria-label={notebookProvidesContext(notebook)
                    ? `Remove ${notebook.title} from context`
                    : `Use ${notebook.title} for context`}
                  aria-pressed={notebookProvidesContext(notebook)}
                  onclick={() => toggleNotebookContext(notebook)}
                >
                  <Icon name="library_add_check" size={16} />
                </button>
                <button
                  class="inline-action-button navigation-row-action danger"
                  type="button"
                  title={`Delete ${notebook.title}`}
                  aria-label={`Delete ${notebook.title}`}
                  onclick={() => deleteNotebook(notebook)}
                >
                  <Icon name="delete" size={16} />
                </button>
                <button
                  class="inline-action-button navigation-row-action"
                  type="button"
                  title={`Rename ${notebook.title}`}
                  aria-label={`Rename ${notebook.title}`}
                  onclick={() => renameNotebook(notebook)}
                >
                  <Icon name="edit" size={16} />
                </button>
              </div>
            {/each}
          {:else}
            <p class="navigation-empty">No notebooks available.</p>
          {/if}
        </div>
      </nav>
    {:else if notebookView === "pages"}
      <nav class="notebook-browser" aria-label="Notebook pages">
        <div class="navigation-list">
          {#if appState.activeNotebook?.pages.length}
            {#each appState.activeNotebook.pages as page (page.id)}
              <div
                class="navigation-item"
                class:active={page.id === appState.activePage?.id}
              >
                <button
                  class="navigation-target"
                  type="button"
                  aria-current={page.id === appState.activePage?.id
                    ? "page"
                    : undefined}
                  onclick={() => navigateToPage(page)}
                >
                  <span class="entity-navigation-icon">
                    <Icon name="description" size={20} />
                  </span>
                  <span class="navigation-item-copy">
                    <strong>{page.title}</strong>
                    <small>{pagePreview(page.content)}</small>
                  </span>
                </button>
                <button
                  class="inline-action-button navigation-row-action context-toggle"
                  class:active={pageProvidesContext(page.id)}
                  type="button"
                  title={pageProvidesContext(page.id)
                    ? `Remove ${page.title} from context`
                    : `Use ${page.title} for context`}
                  aria-label={pageProvidesContext(page.id)
                    ? `Remove ${page.title} from context`
                    : `Use ${page.title} for context`}
                  aria-pressed={pageProvidesContext(page.id)}
                  onclick={() => togglePageContext(page.id)}
                >
                  <Icon name="library_add_check" size={16} />
                </button>
                <button
                  class="inline-action-button navigation-row-action danger"
                  type="button"
                  title={`Delete ${page.title}`}
                  aria-label={`Delete ${page.title}`}
                  onclick={() => deletePage(page)}
                >
                  <Icon name="delete" size={16} />
                </button>
                <button
                  class="inline-action-button navigation-row-action"
                  type="button"
                  title={`Rename ${page.title}`}
                  aria-label={`Rename ${page.title}`}
                  onclick={() => renamePage(page)}
                >
                  <Icon name="edit" size={16} />
                </button>
              </div>
            {/each}
          {:else}
            <p class="navigation-empty">No pages in this notebook.</p>
          {/if}
        </div>
      </nav>
    {:else}
      <div class="notebook-editor-wrap">
        {#if notebookSelectionButtonVisible && !previewMode}
          <button
            class="selection-action notebook-selection-action"
            type="button"
            onclick={sendSelectionToChat}
          >
            Send to Chat
          </button>
        {/if}
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
            maxlength={currentPageCharacterLimit}
            oninput={queueSaveCurrentPage}
            onselect={handleNotebookSelection}
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
        {/if}
        <div
          class="notebook-character-count"
          class:warning={notebookNearLimit && !notebookAtLimit}
          class:limit={notebookAtLimit}
          role="status"
          aria-live="polite"
        >
          <span>Notebook text</span>
          <span>
            {notebookCharacterCount.toLocaleString()} / {NOTEBOOK_TEXT_CHARACTER_LIMIT.toLocaleString()}
            characters
            {#if notebookAtLimit}
              · limit reached
            {:else if notebookNearLimit}
              · {notebookCharactersRemaining.toLocaleString()} remaining
            {/if}
          </span>
        </div>
      </div>
    {/if}
  </fieldset>

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
    margin: 0;
    padding: 0;
    border: 0;
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

  .notebook-heading-row {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 9px;
  }

  .notebook-heading {
    min-width: 0;
  }

  .notebook-heading h2,
  .notebook-heading p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .notebook-back {
    display: inline-grid;
    width: 30px;
    height: 30px;
    min-width: 30px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    place-items: center;
  }

  .notebook-back:hover {
    border-color: var(--border);
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 3%));
    color: var(--text);
  }

  .notebook-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .notebook-create-actions {
    grid-auto-columns: 30px;
    height: 30px;
    border-radius: 9px;
  }

  .notebook-create-actions .inline-action-button {
    width: 30px;
    min-width: 30px;
    height: 30px;
    min-height: 30px;
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

  .icon-action.active:not(.context-toggle) {
    background: color-mix(in oklab, var(--accent) 18%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in oklab, var(--accent) 28%, transparent);
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

  :global(.notebook-sources-dropdown) {
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

  .notebook-browser {
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    flex: 1 1 auto;
  }

  .navigation-list {
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 10px;
    overflow-y: auto;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 8px;
  }

  .navigation-item {
    display: grid;
    width: 100%;
    min-height: 58px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 1%));
    color: var(--text);
    grid-template-columns: minmax(0, 1fr) repeat(3, auto);
    align-items: stretch;
  }

  .navigation-item:focus-within {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px
      color-mix(in oklab, var(--accent) 45%, transparent);
  }

  .navigation-item:hover {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 3%));
  }

  .navigation-item.active {
    border-color: color-mix(in oklab, var(--accent) 52%, var(--border));
    background: color-mix(in oklab, var(--accent) 10%, transparent);
  }

  .navigation-target {
    display: grid;
    width: 100%;
    min-width: 0;
    min-height: 56px;
    padding: 9px 6px 9px 10px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    text-align: left;
  }

  .navigation-row-action {
    height: auto;
    min-height: 56px;
    align-self: stretch;
  }

  .navigation-item > .navigation-row-action:last-child {
    border-radius: 0 10px 10px 0;
  }

  .navigation-item-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  .navigation-item-copy strong,
  .navigation-item-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .navigation-item-copy strong {
    font-size: 12px;
    font-weight: 650;
  }

  .navigation-item-copy small {
    color: var(--muted);
    font-size: 11px;
    font-weight: 400;
  }

  .navigation-empty {
    margin: 0;
    padding: 18px 12px;
    color: var(--muted);
    font-size: 12px;
    text-align: center;
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
    flex-direction: column;
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
    box-shadow: var(--shadow);
    color: var(--text);
    cursor: pointer;
  }

  .selection-action:hover {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
  }

  .notebook-character-count {
    display: flex;
    min-height: 30px;
    padding: 6px 12px;
    border-top: 1px solid var(--border);
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--muted);
    font-size: 11px;
    justify-content: space-between;
    gap: 12px;
  }

  .notebook-character-count.warning {
    color: var(--warning, #d6a84b);
  }

  .notebook-character-count.limit {
    color: var(--danger, #e06c75);
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
