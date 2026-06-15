<script lang="ts">
  import { onMount } from "svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import type { WindowInstanceProps } from "./index.ts";

  type NotebookPage = {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  };

  type NotebookSave = {
    id: string;
    title: string;
    pages: NotebookPage[];
    activePageId: string;
    createdAt: string;
    updatedAt: string;
  };

  type StoredNotebookSave = Partial<NotebookSave> & {
    content?: string;
  };

  let {
    id,
    title,
    closable = false,
    height = null,
    collapsed = false,
    onToggleCollapse = () => {},
    onClose = () => {},
  }: WindowInstanceProps = $props();

  const STORAGE_KEY = "deployable-knowledge:notebooks";
  const ACTIVE_NOTEBOOK_KEY = "deployable-knowledge:activeNotebookId";

  let notebooks = $state<NotebookSave[]>([]);
  let activeNotebookId = $state("");
  let notes = $state("");
  let selectorOpen = $state(false);

  function makeId(prefix = "item") {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function makePage(title = "Page 1", content = ""): NotebookPage {
    const now = new Date().toISOString();

    return {
      id: makeId("page"),
      title,
      content,
      createdAt: now,
      updatedAt: now,
    };
  }

  function makeNotebook(title = "New Notebook"): NotebookSave {
    const now = new Date().toISOString();
    const firstPage = makePage("Page 1");

    return {
      id: makeId("notebook"),
      title,
      pages: [firstPage],
      activePageId: firstPage.id,
      createdAt: now,
      updatedAt: now,
    };
  }

  function normalizeNotebook(
    raw: StoredNotebookSave,
    index: number,
  ): NotebookSave {
    const now = new Date().toISOString();

    const existingPages =
      Array.isArray(raw.pages) && raw.pages.length > 0
        ? raw.pages.map((page, pageIndex) => ({
            id: page.id || makeId("page"),
            title: page.title || `Page ${pageIndex + 1}`,
            content: page.content ?? "",
            createdAt: page.createdAt || now,
            updatedAt: page.updatedAt || now,
          }))
        : [makePage("Page 1", raw.content ?? "")];

    const activePageId =
      existingPages.find((page) => page.id === raw.activePageId)?.id ??
      existingPages[0].id;

    return {
      id: raw.id || makeId("notebook"),
      title: raw.title || `Notebook ${index + 1}`,
      pages: existingPages,
      activePageId,
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now,
    };
  }

  function activeNotebook() {
    return notebooks.find((notebook) => notebook.id === activeNotebookId) ?? null;
  }

  function activePageForNotebook(notebook: NotebookSave) {
    return (
      notebook.pages.find((page) => page.id === notebook.activePageId) ??
      notebook.pages[0] ??
      null
    );
  }

  function activePage() {
    const notebook = activeNotebook();
    if (!notebook) return null;

    return activePageForNotebook(notebook);
  }

  function saveNotebooks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notebooks));
    localStorage.setItem(ACTIVE_NOTEBOOK_KEY, activeNotebookId);
  }

  function saveCurrentNotes() {
    const notebook = activeNotebook();
    const page = activePage();
    if (!notebook || !page) return;

    const now = new Date().toISOString();

    notebooks = notebooks.map((item) =>
      item.id === notebook.id
        ? {
            ...item,
            updatedAt: now,
            pages: item.pages.map((existingPage) =>
              existingPage.id === page.id
                ? {
                    ...existingPage,
                    content: notes,
                    updatedAt: now,
                  }
                : existingPage,
            ),
          }
        : item,
    );

    saveNotebooks();
  }

  function selectNotebook(notebookId: string) {
    saveCurrentNotes();

    const notebook = notebooks.find((item) => item.id === notebookId);
    if (!notebook) return;

    activeNotebookId = notebook.id;
    notes = activePageForNotebook(notebook)?.content ?? "";

    saveNotebooks();
  }

  function selectPage(pageId: string) {
    const notebook = activeNotebook();
    if (!notebook) return;

    saveCurrentNotes();

    const page = notebook.pages.find((item) => item.id === pageId);
    if (!page) return;

    notebooks = notebooks.map((item) =>
      item.id === notebook.id
        ? {
            ...item,
            activePageId: page.id,
          }
        : item,
    );

    notes = page.content;
    selectorOpen = false;

    saveNotebooks();
  }

  function createNotebook() {
    const notebookTitle = window.prompt("Notebook name", "New Notebook");
    if (notebookTitle === null) return;

    const notebook = makeNotebook(notebookTitle.trim() || "New Notebook");

    notebooks = [...notebooks, notebook];
    activeNotebookId = notebook.id;
    notes = activePageForNotebook(notebook)?.content ?? "";

    saveNotebooks();
  }

  function createPage() {
    const notebook = activeNotebook();
    if (!notebook) return;

    const pageTitle = window.prompt("Page name", `Page ${notebook.pages.length + 1}`);
    if (pageTitle === null) return;

    const page = makePage(pageTitle.trim() || `Page ${notebook.pages.length + 1}`);
    const now = new Date().toISOString();

    notebooks = notebooks.map((item) =>
      item.id === notebook.id
        ? {
            ...item,
            pages: [...item.pages, page],
            activePageId: page.id,
            updatedAt: now,
          }
        : item,
    );

    notes = page.content;

    saveNotebooks();
  }

  function deleteActiveNotebook() {
    const notebook = activeNotebook();
    if (!notebook) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete this notebook?\n\n${notebook.title}`,
    );

    if (!confirmed) return;

    if (notebooks.length <= 1) {
      const reset = makeNotebook("Notebook 1");
      notebooks = [reset];
      activeNotebookId = reset.id;
      notes = activePageForNotebook(reset)?.content ?? "";
      saveNotebooks();
      return;
    }

    const activeIndex = notebooks.findIndex((item) => item.id === notebook.id);
    const nextNotebooks = notebooks.filter((item) => item.id !== notebook.id);
    const nextActive =
      nextNotebooks[Math.max(0, activeIndex - 1)] ?? nextNotebooks[0];

    notebooks = nextNotebooks;
    activeNotebookId = nextActive.id;
    notes = activePageForNotebook(nextActive)?.content ?? "";

    saveNotebooks();
  }

  function deleteActivePage() {
    const notebook = activeNotebook();
    const page = activePage();
    if (!notebook || !page) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete this page?\n\n${page.title}`,
    );

    if (!confirmed) return;

    if (notebook.pages.length <= 1) {
      notes = "";
      saveCurrentNotes();
      return;
    }

    const activeIndex = notebook.pages.findIndex((item) => item.id === page.id);
    const nextPages = notebook.pages.filter((item) => item.id !== page.id);
    const nextPage = nextPages[Math.max(0, activeIndex - 1)] ?? nextPages[0];
    const now = new Date().toISOString();

    notebooks = notebooks.map((item) =>
      item.id === notebook.id
        ? {
            ...item,
            pages: nextPages,
            activePageId: nextPage.id,
            updatedAt: now,
          }
        : item,
    );

    notes = nextPage.content;

    saveNotebooks();
  }

  function clearNotes() {
    notes = "";
    saveCurrentNotes();
  }

  onMount(() => {
    const savedRaw = localStorage.getItem(STORAGE_KEY);
    const savedActiveNotebookId = localStorage.getItem(ACTIVE_NOTEBOOK_KEY);

    try {
      const parsed = savedRaw ? (JSON.parse(savedRaw) as StoredNotebookSave[]) : [];

      if (Array.isArray(parsed) && parsed.length > 0) {
        notebooks = parsed.map(normalizeNotebook);
      } else {
        notebooks = [makeNotebook("Notebook 1")];
      }
    } catch {
      notebooks = [makeNotebook("Notebook 1")];
    }

    activeNotebookId =
      notebooks.find((notebook) => notebook.id === savedActiveNotebookId)?.id ??
      notebooks[0]?.id ??
      "";

    notes = activePage()?.content ?? "";

    saveNotebooks();
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
  {#snippet titlebarActions()}
    <div class="notebook-title-action">
      <button
        class="notebook-selector-button"
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
              {#each activeNotebook()?.pages ?? [] as page (page.id)}
                <button
                  class="selector-item"
                  class:active={page.id === activeNotebook()?.activePageId}
                  type="button"
                  title={page.title}
                  onclick={() => selectPage(page.id)}
                >
                  {page.title}
                </button>
              {/each}
            </div>
          </section>
        </div>
      {/if}
    </div>
  {/snippet}

  <section class="notebook-main">
    <header class="notebook-header">
      <div>
        <h2>{activePage()?.title ?? activeNotebook()?.title ?? "Notebook"}</h2>
        <p>{activeNotebook()?.title ?? "Scratch notes for your current work."}</p>
      </div>

      <button class="btn btn-sm" type="button" onclick={clearNotes}>
        Clear
      </button>
    </header>

    <textarea
      class="notebook-textarea"
      bind:value={notes}
      oninput={saveCurrentNotes}
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

  .notebook-title-action {
    position: relative;
  }

  .notebook-selector-button {
    display: inline-grid;
    width: 28px;
    height: 28px;
    min-width: 28px;
    min-height: 28px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--muted);
    cursor: pointer;
    place-items: center;
  }

  .notebook-selector-button:hover,
  .notebook-selector-button.active {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
    color: var(--text);
  }

  .notebook-selector {
    position: absolute;
    top: calc(100% + 7px);
    right: 0;
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

  .notebook-main {
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

  .notebook-textarea:focus {
    border: 0;
    box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--accent) 35%, transparent);
    outline: none;
  }
</style>