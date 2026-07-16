<script lang="ts">
  import { getContext } from "svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import type { AppState } from "$lib/state.svelte";
  import {
    clearNotebookContext,
    getNotebookContextSummary,
    notebookContextCoverage,
    pageProvidesNotebookContext,
    selectAllNotebookContext,
    toggleNotebookContextNotebook,
    toggleNotebookContextPage,
  } from "$lib/utils/notebookContextSelection";
  import {
    applyNotebookState,
    type NotebookStateResponse,
  } from "$lib/utils/notebookState";

  type Props = {
    open: boolean;
    onClose: () => void;
  };

  let { open, onClose }: Props = $props();

  const appState = getContext<AppState>("appState");
  let loading = $state(false);
  let error = $state("");
  let wasOpen = false;
  let contextSummary = $derived(getNotebookContextSummary(appState));
  let allSelected = $derived(
    appState.notebooks.length > 0 &&
      appState.notebooks.every(
        (notebook) => notebookContextCoverage(appState, notebook) === "all",
      ),
  );

  $effect(() => {
    if (open && !wasOpen) {
      wasOpen = true;
      void loadNotebooks();
    } else if (!open) {
      wasOpen = false;
    }
  });

  async function loadNotebooks() {
    loading = true;
    error = "";
    try {
      const response = await fetch("/notebooks");
      if (!response.ok) throw new Error("Notebook context could not be loaded.");
      applyNotebookState(appState, await response.json() as NotebookStateResponse);
    } catch (loadError) {
      error = loadError instanceof Error
        ? loadError.message
        : "Notebook context could not be loaded.";
    } finally {
      loading = false;
    }
  }

  function toggleAll() {
    if (allSelected) {
      clearNotebookContext(appState);
    } else {
      selectAllNotebookContext(appState);
    }
  }
</script>

{#if open}
  <div class="context-dialog-backdrop">
    <div
      class="context-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Choose notebook context"
    >
      <header class="context-dialog-header">
        <div>
          <div class="kind">Use for Context</div>
          <h3>Choose notebooks and pages</h3>
        </div>
        <button
          class="icon-action"
          type="button"
          aria-label="Close notebook context picker"
          onclick={onClose}
        >
          <Icon name="close" size={17} />
        </button>
      </header>

      <div class="context-toolbar">
        <button
          class="select-all"
          class:selected={allSelected}
          type="button"
          aria-pressed={allSelected}
          onclick={toggleAll}
        >
          <Icon
            name={allSelected ? "check_box" : "select_all"}
            size={17}
          />
          {allSelected ? "Clear All" : "Select All"}
        </button>
        <span>{contextSummary}</span>
      </div>

      {#if loading && !appState.notebooks.length}
        <div class="context-message" role="status">
          Loading notebooks and pages...
        </div>
      {:else if appState.notebooks.length}
        <div class="context-list" aria-label="Available notebook context">
          {#each appState.notebooks as notebook (notebook.id)}
            {@const coverage = notebookContextCoverage(appState, notebook)}
            <section
              class="notebook-option"
              class:selected={coverage === "all"}
              class:partial={coverage === "partial"}
            >
              <button
                class="notebook-toggle"
                type="button"
                aria-pressed={coverage === "all"}
                aria-label={`${coverage === "all" ? "Remove" : "Use"} entire notebook ${notebook.title} for context`}
                onclick={() => toggleNotebookContextNotebook(appState, notebook)}
              >
                <Icon
                  name={coverage === "all"
                    ? "check_box"
                    : coverage === "partial"
                      ? "indeterminate_check_box"
                      : "check_box_outline_blank"}
                  size={19}
                />
                <span>
                  <strong>{notebook.title}</strong>
                  <small>
                    Entire notebook · {notebook.pages.length}
                    {notebook.pages.length === 1 ? "page" : "pages"}
                  </small>
                </span>
              </button>

              {#if notebook.pages.length}
                <div class="page-options">
                  {#each notebook.pages as page (page.id)}
                    {@const pageSelected = pageProvidesNotebookContext(appState, page.id)}
                    <button
                      class="page-toggle"
                      class:selected={pageSelected}
                      type="button"
                      aria-pressed={pageSelected}
                      aria-label={`${pageSelected ? "Remove" : "Use"} page ${page.title} for context`}
                      onclick={() => toggleNotebookContextPage(appState, page.id)}
                    >
                      <Icon
                        name={pageSelected
                          ? "check_box"
                          : "check_box_outline_blank"}
                        size={17}
                      />
                      <span>{page.title}</span>
                    </button>
                  {/each}
                </div>
              {:else}
                <div class="empty-pages">This notebook has no pages.</div>
              {/if}
            </section>
          {/each}
        </div>
      {:else}
        <div class="context-message">No notebooks are available yet.</div>
      {/if}

      {#if error}
        <div class="context-error" role="alert">{error}</div>
      {/if}

      <footer class="context-dialog-footer">
        <span>Changes apply immediately everywhere.</span>
        <button class="btn btn-sm context-dialog-primary" type="button" onclick={onClose}>
          Done
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .context-dialog-backdrop {
    position: absolute;
    z-index: 41;
    inset: 0;
    display: grid;
    overflow: auto;
    padding: 18px;
    background: rgb(2 6 23 / 72%);
    place-items: center;
    backdrop-filter: blur(5px);
  }

  .context-dialog {
    display: grid;
    width: min(660px, 100%);
    max-height: 100%;
    overflow: hidden;
    gap: 12px;
    padding: 16px;
    border: 1px solid color-mix(in oklab, var(--accent) 44%, var(--border));
    border-radius: 16px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    box-shadow: 0 24px 70px rgb(0 0 0 / 48%);
  }

  .context-dialog-header,
  .context-dialog-footer,
  .context-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .context-dialog-header,
  .context-dialog-footer {
    justify-content: space-between;
  }

  .context-dialog-header h3 {
    margin: 2px 0 0;
  }

  .kind {
    color: rgb(148 163 184);
    font-size: 11px;
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

  .context-toolbar {
    justify-content: space-between;
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
    color: var(--muted);
    font-size: 12px;
  }

  .select-all,
  .notebook-toggle,
  .page-toggle {
    display: flex;
    border: 0;
    color: var(--text);
    cursor: pointer;
    align-items: center;
    text-align: left;
  }

  .select-all {
    gap: 6px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    font: inherit;
    font-weight: 700;
  }

  .select-all.selected,
  .select-all:hover {
    border-color: color-mix(in oklab, var(--accent) 58%, var(--border));
    background: color-mix(in oklab, var(--accent) 16%, transparent);
  }

  .context-list {
    display: grid;
    min-height: 0;
    overflow-y: auto;
    gap: 9px;
    padding-right: 3px;
  }

  .notebook-option {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
  }

  .notebook-option.selected,
  .notebook-option.partial {
    border-color: color-mix(in oklab, var(--accent) 55%, var(--border));
    box-shadow: inset 3px 0 0 color-mix(in oklab, var(--accent) 78%, white);
  }

  .notebook-toggle {
    width: 100%;
    gap: 9px;
    padding: 10px 12px;
    background: transparent;
    font: inherit;
  }

  .notebook-option.selected .notebook-toggle {
    background: color-mix(in oklab, var(--accent) 14%, transparent);
  }

  .notebook-toggle span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .notebook-toggle strong,
  .notebook-toggle small,
  .page-toggle span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .notebook-toggle small {
    color: var(--muted);
    font-size: 11px;
  }

  .page-options {
    display: grid;
    gap: 4px;
    padding: 7px 10px 10px 35px;
    border-top: 1px solid color-mix(in oklab, var(--border) 75%, transparent);
  }

  .page-toggle {
    width: 100%;
    gap: 7px;
    padding: 7px 9px;
    border-radius: 8px;
    background: transparent;
    font: inherit;
    font-size: 12px;
  }

  .page-toggle:hover,
  .page-toggle.selected {
    background: color-mix(in oklab, var(--accent) 12%, transparent);
  }

  .page-toggle.selected {
    color: color-mix(in oklab, var(--accent) 65%, var(--text));
    font-weight: 700;
  }

  .empty-pages,
  .context-message,
  .context-error {
    padding: 10px;
    color: var(--muted);
    font-size: 12px;
  }

  .context-error {
    border: 1px solid color-mix(in oklab, #ef4444 50%, var(--border));
    border-radius: 9px;
    color: #fca5a5;
  }

  .context-dialog-footer {
    padding-top: 4px;
    color: var(--muted);
    font-size: 11px;
  }

  .context-dialog-primary {
    border-color: color-mix(in oklab, var(--accent) 60%, var(--border));
    background: color-mix(in oklab, var(--accent) 20%, transparent);
  }

  @media (max-width: 680px) {
    .context-toolbar,
    .context-dialog-footer {
      align-items: stretch;
      flex-direction: column;
    }

    .select-all,
    .context-dialog-primary {
      justify-content: center;
      width: 100%;
    }
  }
</style>
