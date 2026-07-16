<script lang="ts">
  import { getContext } from "svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import type { AppState } from "$lib/state.svelte";
  import {
    applyNotebookState,
    type NotebookStateResponse,
  } from "$lib/utils/notebookState";

  export type NotebookDestination = {
    notebookId: string;
    notebookTitle: string;
    pageId: string;
    pageTitle: string;
  };

  type Props = {
    open: boolean;
    kindLabel: string;
    itemTitle: string;
    actionLabel: string;
    ariaLabel: string;
    onClose: () => void;
    onSave: (destination: NotebookDestination) => Promise<void>;
  };

  let {
    open,
    kindLabel,
    itemTitle,
    actionLabel,
    ariaLabel,
    onClose,
    onSave,
  }: Props = $props();

  const appState = getContext<AppState>("appState");

  let loading = $state(false);
  let error = $state("");
  let destinationNotebookId = $state("");
  let destinationPageId = $state("");
  let existingNotebookNewPageTitle = $state("");
  let newNotebookTitle = $state("");
  let newPageTitle = $state("");
  let wasOpen = false;

  let destinationNotebook = $derived(
    appState.notebooks.find(
      (notebook) => notebook.id === destinationNotebookId,
    ) ?? null,
  );
  let destinationPage = $derived(
    destinationNotebook?.pages.find((page) => page.id === destinationPageId) ??
      null,
  );

  $effect(() => {
    if (open && !wasOpen) {
      wasOpen = true;
      resetForm();
      void loadDestinations();
    } else if (!open) {
      wasOpen = false;
    }
  });

  function resetForm() {
    error = "";
    existingNotebookNewPageTitle = "";
    newNotebookTitle = "";
    newPageTitle = "";
  }

  function notifyNotebookChanged() {
    window.dispatchEvent(new CustomEvent("dk:notebooks-updated"));
  }

  function chooseDestinationNotebook(
    notebookId: string,
    preferredPageId?: string | null,
  ) {
    destinationNotebookId = notebookId;
    const notebook = appState.notebooks.find(
      (candidate) => candidate.id === notebookId,
    );
    destinationPageId =
      notebook?.pages.find((page) => page.id === preferredPageId)?.id ??
      notebook?.pages.find((page) => page.id === notebook.activePageId)?.id ??
      notebook?.pages[0]?.id ??
      "";
  }

  async function loadDestinations() {
    loading = true;
    error = "";
    try {
      const response = await fetch("/notebooks");
      if (!response.ok) {
        throw new Error("Notebook destinations could not be loaded.");
      }
      const data = await response.json() as NotebookStateResponse;
      applyNotebookState(appState, data);
      const notebookId =
        data.notebooks.find(
          (notebook) => notebook.id === data.activeNotebookId,
        )?.id ??
        data.notebooks[0]?.id ??
        "";
      chooseDestinationNotebook(notebookId);
    } catch (loadError) {
      error = loadError instanceof Error
        ? loadError.message
        : "Notebook destinations could not be loaded.";
    } finally {
      loading = false;
    }
  }

  async function createPageInExistingNotebook() {
    const notebookId = destinationNotebookId;
    const pageTitle = existingNotebookNewPageTitle.trim();
    if (loading) return;
    if (!notebookId) {
      error = "Choose a notebook before creating a page.";
      return;
    }
    if (!pageTitle) {
      error = "Enter a page name.";
      return;
    }

    loading = true;
    error = "";
    try {
      const response = await fetch(`/notebooks/${notebookId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: pageTitle }),
      });
      const data = await response.json() as NotebookStateResponse & {
        message?: string;
        createdPageId?: string;
      };
      if (!response.ok) {
        throw new Error(data.message || "The page could not be created.");
      }
      applyNotebookState(appState, data);
      chooseDestinationNotebook(notebookId, data.createdPageId);
      existingNotebookNewPageTitle = "";
      notifyNotebookChanged();
      showToast("Page created and selected");
    } catch (createError) {
      error = createError instanceof Error
        ? createError.message
        : "The page could not be created.";
    } finally {
      loading = false;
    }
  }

  async function createDestination() {
    const notebookTitle = newNotebookTitle.trim();
    const pageTitle = newPageTitle.trim();
    if (loading) return;
    if (!notebookTitle || !pageTitle) {
      error = "Enter both a notebook name and a page name.";
      return;
    }

    loading = true;
    error = "";
    try {
      const response = await fetch("/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: notebookTitle, pageTitle }),
      });
      const data = await response.json() as NotebookStateResponse & {
        message?: string;
        createdNotebookId?: string;
        createdPageId?: string;
      };
      if (!response.ok) {
        throw new Error(data.message || "The destination could not be created.");
      }
      applyNotebookState(appState, data);
      chooseDestinationNotebook(
        data.createdNotebookId ?? data.activeNotebookId ?? "",
        data.createdPageId,
      );
      newNotebookTitle = "";
      newPageTitle = "";
      notifyNotebookChanged();
      showToast("Notebook and page created");
    } catch (createError) {
      error = createError instanceof Error
        ? createError.message
        : "The destination could not be created.";
    } finally {
      loading = false;
    }
  }

  async function save() {
    if (!destinationNotebook || !destinationPage || loading) return;
    loading = true;
    error = "";
    try {
      await onSave({
        notebookId: destinationNotebook.id,
        notebookTitle: destinationNotebook.title,
        pageId: destinationPage.id,
        pageTitle: destinationPage.title,
      });
    } catch (saveError) {
      error = saveError instanceof Error
        ? saveError.message
        : "The item could not be saved.";
    } finally {
      loading = false;
    }
  }
</script>

{#if open}
  <div class="save-dialog-backdrop">
    <div
      class="save-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <header class="save-dialog-header">
        <div>
          <div class="kind">{kindLabel}</div>
          <h3>{itemTitle}</h3>
        </div>
        <button
          class="icon-action"
          type="button"
          aria-label="Close save destination"
          disabled={loading}
          onclick={onClose}
        >
          <Icon name="close" size={17} />
        </button>
      </header>

      {#if loading && !appState.notebooks.length}
        <div class="save-dialog-loading" role="status">
          Loading notebook destinations...
        </div>
      {:else}
        <div class="destination-choice-label">
          1. Save to an existing notebook and page
        </div>
        <div class="destination-grid">
          <label>
            <span>Notebook</span>
            <select
              class="input"
              aria-label="Destination notebook"
              value={destinationNotebookId}
              onchange={(event) =>
                chooseDestinationNotebook(event.currentTarget.value)}
            >
              {#each appState.notebooks as notebook (notebook.id)}
                <option value={notebook.id}>{notebook.title}</option>
              {/each}
            </select>
          </label>

          <label>
            <span>Page</span>
            <select
              class="input"
              aria-label="Destination page"
              bind:value={destinationPageId}
              disabled={!destinationNotebook?.pages.length}
            >
              {#each destinationNotebook?.pages ?? [] as page (page.id)}
                <option value={page.id}>{page.title}</option>
              {/each}
            </select>
          </label>
        </div>

        <div class="destination-summary" role="status">
          {#if destinationNotebook && destinationPage}
            Destination:
            <strong>
              {destinationNotebook.title} → {destinationPage.title}
            </strong>
          {:else}
            Choose or create a notebook page before saving.
          {/if}
        </div>

        <section class="destination-create-section">
          <h4>2. Create a new page in the selected notebook</h4>
          <div class="destination-create-page-row">
            <input
              class="input"
              type="text"
              aria-label="New page name in selected notebook"
              placeholder="New page name"
              bind:value={existingNotebookNewPageTitle}
              disabled={!destinationNotebookId || loading}
            />
            <button
              class="btn btn-sm"
              type="button"
              disabled={!destinationNotebookId ||
                !existingNotebookNewPageTitle.trim() ||
                loading}
              onclick={createPageInExistingNotebook}
            >
              Create page
            </button>
          </div>
        </section>

        <section class="destination-create-section">
          <h4>3. Create a new notebook and page</h4>
          <div class="destination-create-fields">
            <input
              class="input"
              type="text"
              aria-label="New notebook name"
              placeholder="New notebook name"
              bind:value={newNotebookTitle}
            />
            <input
              class="input"
              type="text"
              aria-label="New page name"
              placeholder="New page name"
              bind:value={newPageTitle}
            />
          </div>
          <div class="destination-create-actions">
            <button
              class="btn btn-sm"
              type="button"
              disabled={!newNotebookTitle.trim() ||
                !newPageTitle.trim() ||
                loading}
              onclick={createDestination}
            >
              {loading ? "Creating..." : "Create notebook and page"}
            </button>
          </div>
        </section>
      {/if}

      {#if error}
        <div class="save-dialog-error" role="alert">{error}</div>
      {/if}

      <footer class="save-dialog-footer">
        <button
          class="btn btn-sm"
          type="button"
          disabled={loading}
          onclick={onClose}
        >
          Cancel
        </button>
        <button
          class="btn btn-sm save-dialog-primary"
          type="button"
          disabled={!destinationNotebook || !destinationPage || loading}
          onclick={save}
        >
          {loading ? "Saving..." : actionLabel}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .save-dialog-backdrop {
    position: absolute;
    z-index: 40;
    inset: 0;
    display: grid;
    overflow: auto;
    padding: 18px;
    background: rgb(2 6 23 / 72%);
    place-items: center;
    backdrop-filter: blur(5px);
  }

  .save-dialog {
    display: grid;
    width: min(620px, 100%);
    max-height: 100%;
    overflow: auto;
    gap: 14px;
    padding: 16px;
    border: 1px solid color-mix(in oklab, var(--accent) 44%, var(--border));
    border-radius: 16px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    box-shadow: 0 24px 70px rgb(0 0 0 / 48%);
  }

  .save-dialog-header,
  .save-dialog-footer {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .save-dialog-header {
    justify-content: space-between;
  }

  .save-dialog-header h3,
  .destination-create-section h4 {
    margin: 2px 0 0;
  }

  .icon-action {
    display: inline-grid;
    width: 30px;
    height: 30px;
    min-width: 30px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--muted);
    cursor: pointer;
    place-items: center;
  }

  .destination-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .destination-grid label {
    display: grid;
    min-width: 0;
    gap: 5px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }

  .destination-grid select {
    width: 100%;
  }

  .destination-summary,
  .save-dialog-loading,
  .save-dialog-error {
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
    color: var(--muted);
    font-size: 12px;
  }

  .destination-summary strong {
    color: var(--text);
  }

  .save-dialog-error {
    border-color: color-mix(in oklab, #ef4444 50%, var(--border));
    color: #fca5a5;
  }

  .destination-create-section {
    display: grid;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .destination-create-section h4,
  .destination-choice-label {
    color: var(--text);
    font-size: 12px;
    font-weight: 700;
  }

  .destination-create-page-row {
    display: flex;
    gap: 8px;
  }

  .destination-create-page-row .input {
    min-width: 0;
    flex: 1 1 auto;
  }

  .destination-create-page-row .btn {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .destination-create-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .destination-create-fields .input {
    min-width: 0;
  }

  .destination-create-actions,
  .save-dialog-footer {
    justify-content: flex-end;
  }

  .destination-create-actions {
    display: flex;
  }

  .destination-create-actions .btn {
    white-space: nowrap;
  }

  .save-dialog-primary {
    border-color: color-mix(in oklab, var(--accent) 60%, var(--border));
    background: color-mix(in oklab, var(--accent) 20%, transparent);
  }

  .kind {
    color: rgb(148 163 184);
    font-size: 11px;
  }

  @media (max-width: 760px) {
    .destination-grid,
    .destination-create-fields {
      grid-template-columns: 1fr;
    }

    .destination-create-page-row {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
