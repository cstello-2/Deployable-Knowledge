<script lang="ts">
  import Icon from "$lib/components/utils/Icon.svelte";
  import type {
    NotebookPage,
    NotebookWithPages,
  } from "$lib/server/database/schema";

  type Props = {
    open: boolean;
    page: NotebookPage | null;
    sourceNotebookId: string | null;
    notebooks: NotebookWithPages[];
    onClose: () => void;
    onMove: (destinationNotebookId: string) => Promise<void>;
  };

  let {
    open,
    page,
    sourceNotebookId,
    notebooks,
    onClose,
    onMove,
  }: Props = $props();

  let destinationNotebookId = $state("");
  let moving = $state(false);
  let error = $state("");
  let wasOpen = false;
  let destinations = $derived(
    notebooks.filter((notebook) => notebook.id !== sourceNotebookId),
  );

  $effect(() => {
    if (open && !wasOpen) {
      wasOpen = true;
      destinationNotebookId = destinations[0]?.id ?? "";
      error = "";
    } else if (!open) {
      wasOpen = false;
    }
  });

  async function movePage() {
    if (!destinationNotebookId || moving) return;
    moving = true;
    error = "";

    try {
      await onMove(destinationNotebookId);
    } catch (cause) {
      error =
        cause instanceof Error ? cause.message : "The page could not be moved.";
    } finally {
      moving = false;
    }
  }
</script>

{#if open && page}
  <div class="move-page-backdrop">
    <div
      class="move-page-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={`Move ${page.title}`}
    >
      <header>
        <div>
          <span>Move page</span>
          <h3>{page.title}</h3>
        </div>
        <button
          class="icon-action"
          type="button"
          aria-label="Close move page dialog"
          disabled={moving}
          onclick={onClose}
        >
          <Icon name="close" size={17} />
        </button>
      </header>

      {#if destinations.length}
        <label>
          <span>Destination notebook</span>
          <select
            class="input"
            bind:value={destinationNotebookId}
            disabled={moving}
          >
            {#each destinations as notebook (notebook.id)}
              <option value={notebook.id}>{notebook.title}</option>
            {/each}
          </select>
        </label>
        <p>The page and all of its content will be moved.</p>
      {:else}
        <p>Create another notebook before moving this page.</p>
      {/if}

      {#if error}
        <div class="move-page-error" role="alert">{error}</div>
      {/if}

      <footer>
        <button class="btn btn-sm" type="button" disabled={moving} onclick={onClose}>
          Cancel
        </button>
        <button
          class="btn btn-sm move-page-primary"
          type="button"
          disabled={!destinationNotebookId || moving}
          onclick={movePage}
        >
          {moving ? "Moving..." : "Move page"}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .move-page-backdrop {
    position: absolute;
    z-index: 45;
    inset: 0;
    display: grid;
    overflow: auto;
    padding: 18px;
    background: rgb(2 6 23 / 72%);
    place-items: center;
    backdrop-filter: blur(5px);
  }

  .move-page-dialog {
    display: grid;
    width: min(430px, 100%);
    gap: 14px;
    padding: 16px;
    border: 1px solid color-mix(in oklab, var(--accent) 44%, var(--border));
    border-radius: 16px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    box-shadow: 0 24px 70px rgb(0 0 0 / 48%);
  }

  header,
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  header {
    justify-content: space-between;
  }

  header span {
    color: var(--muted);
    font-size: 11px;
  }

  h3,
  p {
    margin: 3px 0 0;
  }

  label {
    display: grid;
    gap: 6px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }

  p {
    color: var(--muted);
    font-size: 12px;
  }

  footer {
    justify-content: flex-end;
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

  .move-page-primary {
    border-color: color-mix(in oklab, var(--accent) 60%, var(--border));
    background: color-mix(in oklab, var(--accent) 20%, transparent);
  }

  .move-page-error {
    padding: 9px 10px;
    border: 1px solid color-mix(in oklab, #ef4444 50%, var(--border));
    border-radius: 9px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
    color: #fca5a5;
    font-size: 12px;
  }
</style>
