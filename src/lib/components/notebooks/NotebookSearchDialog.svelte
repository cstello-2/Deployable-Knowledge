<script lang="ts">
  import { tick } from "svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import type { NotebookWithPages } from "$lib/server/database/schema";
  import {
    searchNotebookPages,
    type NotebookSearchResult,
  } from "$lib/utils/notebookSearch";

  type Props = {
    open: boolean;
    notebooks: NotebookWithPages[];
    onClose: () => void;
    onOpenResult: (result: NotebookSearchResult) => Promise<void>;
  };

  let { open, notebooks, onClose, onOpenResult }: Props = $props();

  let query = $state("");
  let openingPageId = $state<string | null>(null);
  let inputElement = $state<HTMLInputElement>();
  let wasOpen = false;
  let results = $derived(searchNotebookPages(notebooks, query));

  $effect(() => {
    if (open && !wasOpen) {
      wasOpen = true;
      query = "";
      openingPageId = null;
      void tick().then(() => inputElement?.focus());
    } else if (!open) {
      wasOpen = false;
    }
  });

  async function openResult(result: NotebookSearchResult) {
    if (openingPageId) return;
    openingPageId = result.pageId;

    try {
      await onOpenResult(result);
    } finally {
      openingPageId = null;
    }
  }
</script>

{#if open}
  <div class="notebook-search-backdrop">
    <div
      class="notebook-search-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Search notebook pages"
    >
      <header>
        <div>
          <span>Notebook Search</span>
          <h3>Find a page</h3>
        </div>
        <button
          class="icon-action"
          type="button"
          aria-label="Close notebook search"
          onclick={onClose}
        >
          <Icon name="close" size={17} />
        </button>
      </header>

      <div class="notebook-search-input-wrap">
        <Icon name="search" size={18} />
        <input
          class="input"
          bind:this={inputElement}
          bind:value={query}
          type="search"
          placeholder="Search page titles and text..."
          aria-label="Search notebook page titles and text"
          onkeydown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter" && results[0]) {
              void openResult(results[0]);
            }
          }}
        />
      </div>

      <div class="notebook-search-summary" role="status">
        {#if query.trim()}
          {results.length} matching {results.length === 1 ? "page" : "pages"}
        {:else}
          Search across {notebooks.length}
          {notebooks.length === 1 ? "notebook" : "notebooks"}
        {/if}
      </div>

      <div class="notebook-search-results">
        {#if !query.trim()}
          <p>Enter one or more keywords. Every keyword must appear in the result.</p>
        {:else if !results.length}
          <p>No notebook pages match every keyword.</p>
        {:else}
          {#each results as result (result.pageId)}
            <button
              class="notebook-search-result"
              type="button"
              disabled={Boolean(openingPageId)}
              onclick={() => openResult(result)}
            >
              <span class="notebook-search-result-path">
                {result.notebookTitle} → {result.pageTitle}
              </span>
              <span class="notebook-search-result-snippet">{result.snippet}</span>
              <span class="notebook-search-result-count">
                {result.matchCount}
                {result.matchCount === 1 ? "text match" : "text matches"}
              </span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .notebook-search-backdrop {
    position: absolute;
    z-index: 46;
    inset: 0;
    display: grid;
    min-height: 0;
    overflow: auto;
    padding: 18px;
    background: rgb(2 6 23 / 72%);
    place-items: center;
    backdrop-filter: blur(5px);
  }

  .notebook-search-dialog {
    display: flex;
    width: min(620px, 100%);
    max-height: 100%;
    min-height: 0;
    padding: 16px;
    border: 1px solid color-mix(in oklab, var(--accent) 44%, var(--border));
    border-radius: 16px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    box-shadow: 0 24px 70px rgb(0 0 0 / 48%);
    flex-direction: column;
    gap: 12px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  header span {
    color: var(--muted);
    font-size: 11px;
  }

  h3 {
    margin: 3px 0 0;
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

  .notebook-search-input-wrap {
    display: grid;
    border: 1px solid var(--border);
    border-radius: 10px;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    padding-left: 10px;
    color: var(--muted);
  }

  .notebook-search-input-wrap:focus-within {
    border-color: var(--accent);
  }

  .notebook-search-input-wrap .input {
    border: 0;
    box-shadow: none;
  }

  .notebook-search-summary {
    color: var(--muted);
    font-size: 11px;
  }

  .notebook-search-results {
    display: flex;
    min-height: 90px;
    overflow-y: auto;
    flex-direction: column;
    gap: 6px;
  }

  .notebook-search-results > p {
    margin: 0;
    padding: 16px 8px;
    color: var(--muted);
    font-size: 12px;
    text-align: center;
  }

  .notebook-search-result {
    display: flex;
    width: 100%;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 2%));
    color: var(--text);
    cursor: pointer;
    flex-direction: column;
    gap: 4px;
    text-align: left;
  }

  .notebook-search-result:hover:not(:disabled) {
    border-color: color-mix(in oklab, var(--accent) 55%, var(--border));
    background: color-mix(in oklab, var(--accent) 10%, transparent);
  }

  .notebook-search-result-path {
    font-size: 12px;
    font-weight: 700;
  }

  .notebook-search-result-snippet,
  .notebook-search-result-count {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.4;
  }

  .notebook-search-result-count {
    color: color-mix(in oklab, var(--accent) 70%, var(--muted));
  }
</style>
