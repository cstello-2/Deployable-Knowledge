<script lang="ts">
  import { onMount } from "svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { notebookRequest, type Notebook, type NotebookPage } from "$lib/api/notebook";
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

  let notebooks = $state<Notebook[]>([]);
  let activeNotebookId = $state<string | null>(null);
  let notes = $state("");
  let selectorOpen = $state(false);
  let loading = $state(false);
  let saveStatus = $state("");
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let selectedNotebookText = $state("");
  let notebookSelectionButtonVisible = $state(false);

  const activeNotebook = $derived(
    notebooks.find((notebook) => notebook.id === activeNotebookId) ??
      notebooks[0] ??
      null,
  );

  const activePage = $derived(
    activeNotebook?.pages.find((page) => page.id === activeNotebook.activePageId) ??
      activeNotebook?.pages[0] ??
      null,
  );

  async function loadNotebookState() {
    loading = true;

    try {
      const data = await notebookRequest();
      notebooks = data.notebooks ?? [];
      activeNotebookId = data.activeNotebookId ?? notebooks[0]?.id ?? null;
      notes =
        notebooks
          .find((notebook) => notebook.id === activeNotebookId)
          ?.pages.find((page) => page.id === notebooks.find((notebook) => notebook.id === activeNotebookId)?.activePageId)
          ?.content ??
        notebooks.find((notebook) => notebook.id === activeNotebookId)?.pages[0]?.content ??
        "";
    } catch (error) {
      alert(
        "Notebook failed to load: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      loading = false;
    }
  }

  function applyNotebookState(data: { activeNotebookId: string | null; notebooks: Notebook[] }) {
    notebooks = data.notebooks ?? [];
    activeNotebookId = data.activeNotebookId ?? notebooks[0]?.id ?? null;

    const notebook =
      notebooks.find((item) => item.id === activeNotebookId) ?? notebooks[0] ?? null;
    const page =
      notebook?.pages.find((item) => item.id === notebook.activePageId) ??
      notebook?.pages[0] ??
      null;

    notes = page?.content ?? "";
  }

  async function runNotebookAction(
    action: Parameters<typeof notebookRequest>[0],
    status = "",
  ) {
    if (!action) return;

    try {
      applyNotebookState(await notebookRequest(action));
      saveStatus = status;
    } catch (error) {
      alert(
        "Notebook action failed: " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  async function saveCurrentPage() {
    if (!activePage) return;

    try {
      await notebookRequest({
        action: "page.update",
        pageId: activePage.id,
        content: notes,
      });

      notebooks = notebooks.map((notebook) =>
        notebook.id === activeNotebook?.id
          ? {
              ...notebook,
              pages: notebook.pages.map((page) =>
                page.id === activePage.id ? { ...page, content: notes } : page,
              ),
            }
          : notebook,
      );

      saveStatus = "Saved";
    } catch (error) {
      saveStatus = "Save failed";
      console.error(error);
    }
  }

  function queueSaveCurrentPage() {
    saveStatus = "Saving…";

    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
      saveCurrentPage();
    }, 350);
  }

  async function selectNotebook(notebookId: string) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      await saveCurrentPage();
    }

    await runNotebookAction({ action: "notebook.select", notebookId });
  }

  async function selectPage(page: NotebookPage) {
    if (!activeNotebook) return;

    if (saveTimer) {
      clearTimeout(saveTimer);
      await saveCurrentPage();
    }

    await runNotebookAction({
      action: "page.select",
      notebookId: activeNotebook.id,
      pageId: page.id,
    });

    selectorOpen = false;
  }

  async function createNotebook() {
    const notebookTitle = window.prompt("Notebook name", "New Notebook");
    if (notebookTitle === null) return;

    await runNotebookAction(
      {
        action: "notebook.create",
        title: notebookTitle.trim() || "New Notebook",
      },
      "Notebook created",
    );
  }

  async function createPage() {
    if (!activeNotebook) return;

    const pageTitle = window.prompt(
      "Page name",
      `Page ${activeNotebook.pages.length + 1}`,
    );

    if (pageTitle === null) return;

    await runNotebookAction(
      {
        action: "page.create",
        notebookId: activeNotebook.id,
        title: pageTitle.trim() || `Page ${activeNotebook.pages.length + 1}`,
      },
      "Page created",
    );
  }

  async function deleteActiveNotebook() {
    if (!activeNotebook) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete this notebook?\n\n${activeNotebook.title}`,
    );

    if (!confirmed) return;

    await runNotebookAction(
      { action: "notebook.delete", notebookId: activeNotebook.id },
      "Notebook deleted",
    );
  }

  async function deleteActivePage() {
    if (!activeNotebook || !activePage) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete this page?\n\n${activePage.title}`,
    );

    if (!confirmed) return;

    await runNotebookAction(
      {
        action: "page.delete",
        notebookId: activeNotebook.id,
        pageId: activePage.id,
      },
      "Page deleted",
    );
  }

  async function clearNotes() {
    notes = "";
    await saveCurrentPage();
  }

  function handleNotebookSelection() {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      ".notebook-textarea",
    );

    if (!textarea) return;

    const selected = textarea.value
      .slice(textarea.selectionStart, textarea.selectionEnd)
      .trim();

    selectedNotebookText = selected;
    notebookSelectionButtonVisible = selected.length > 0;
  }

  function sendSelectionToChat() {
    if (!selectedNotebookText.trim()) return;

    window.dispatchEvent(
      new CustomEvent("dk:send-to-chat", {
        detail: {
          text: selectedNotebookText.trim(),
        },
      }),
    );

    notebookSelectionButtonVisible = false;
    selectedNotebookText = "";
    saveStatus = "Sent to chat";
  }

  async function appendTextFromChat(event: Event) {
    const text = String((event as CustomEvent<{ text?: string }>).detail?.text ?? "")
      .trim();

    if (!text || !activePage) return;

    notes = notes.trim()
      ? `${notes.trimEnd()}\n\n${text}`
      : text;

    await saveCurrentPage();
    saveStatus = "Added from chat";
  }

  onMount(() => {
    loadNotebookState();
    window.addEventListener("dk:send-to-notebook", appendTextFromChat);

    return () => {
      window.addEventListener("dk:send-to-notebook", appendTextFromChat);
      if (saveTimer) {
        clearTimeout(saveTimer);
      }
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
        <h2>{activePage?.title ?? activeNotebook?.title ?? "Notebook"}</h2>
        <p>
          {#if loading}
            Loading notebook…
          {:else}
            {activeNotebook?.title ?? "Scratch notes for your current work."}
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
        <section class="selector-column">
          <header class="selector-header">
            <span>Notebooks</span>

            <div class="segmented-actions">
              <button
                type="button"
                title="Create notebook"
                aria-label="Create notebook"
                onclick={createNotebook}
              >
                +
              </button>
              <div aria-hidden="true"></div>
              <button
                class="danger"
                type="button"
                title="Delete selected notebook"
                aria-label="Delete selected notebook"
                onclick={deleteActiveNotebook}
              >
                ×
              </button>
            </div>
          </header>

          <div class="selector-list">
            {#each notebooks as notebook (notebook.id)}
              <button
                class="selector-item"
                class:active={notebook.id === activeNotebookId}
                type="button"
                title={notebook.title}
                onclick={() => selectNotebook(notebook.id)}
              >
                {notebook.title}
              </button>
            {/each}
          </div>
        </section>

        <section class="selector-column">
          <header class="selector-header">
            <span>Pages</span>

            <div class="segmented-actions">
              <button
                type="button"
                title="Create page"
                aria-label="Create page"
                onclick={createPage}
              >
                +
              </button>
              <div aria-hidden="true"></div>
              <button
                class="danger"
                type="button"
                title="Delete selected page"
                aria-label="Delete selected page"
                onclick={deleteActivePage}
              >
                ×
              </button>
            </div>
          </header>

          <div class="selector-list">
            {#each activeNotebook?.pages ?? [] as page (page.id)}
              <button
                class="selector-item"
                class:active={page.id === activeNotebook?.activePageId}
                type="button"
                title={page.title}
                onclick={() => selectPage(page)}
              >
                {page.title}
              </button>
            {/each}
          </div>
        </section>
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
    <textarea
      class="notebook-textarea"
      bind:value={notes}
      oninput={queueSaveCurrentPage}
      placeholder="Write notes here..."
      aria-label="Notebook notes"
    ></textarea>
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
    display: grid;
    width: min(320px, 72vw);
    height: min(430px, 62vh);
    overflow: hidden;
    grid-template-columns: 1fr 1fr;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) - 1%));
    box-shadow: var(--shadow);
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

  .segmented-actions {
    display: grid;
    width: 58px;
    height: 24px;
    overflow: hidden;
    grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr);
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 2%));
  }

  .segmented-actions div {
    background: var(--border);
  }

  .segmented-actions button {
    display: grid;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    place-items: center;
  }

  .segmented-actions button:hover {
    background: color-mix(in oklab, var(--accent) 12%, transparent);
  }

  .segmented-actions button.danger {
    color: color-mix(in oklab, #ff6b6b 78%, var(--text));
    font-size: 17px;
  }

  .segmented-actions button.danger:hover {
    background: color-mix(in oklab, #ff6b6b 12%, transparent);
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
