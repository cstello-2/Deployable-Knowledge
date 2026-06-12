<script lang="ts">
  import Popup from "$lib/components/Popup.svelte";

  type Props = {
    open: boolean;
    title: string;
    tags: string[];
    onSelect: (tag: string) => void;
    onClose: () => void;
  };

  let { open, title, tags, onSelect, onClose }: Props = $props();
</script>

<Popup {open} {title} id="document-tag-picker" contentLabel="Choose tag" {onClose}>
  <div class="tag-picker">
    {#if tags.length}
      <div class="tag-list">
        {#each tags as tag}
          <button class="tag-chip" type="button" onclick={() => onSelect(tag)}>#{tag}</button>
        {/each}
      </div>
    {:else}
      <div class="empty">No tags available.</div>
    {/if}

    <div class="actions">
      <button class="btn" type="button" onclick={onClose}>Cancel</button>
    </div>
  </div>
</Popup>

<style>
  .tag-picker {
    display: grid;
    gap: 12px;
  }

  .tag-list {
    display: flex;
    max-height: 180px;
    flex-wrap: wrap;
    gap: 6px;
    overflow: auto;
  }

  .empty {
    color: var(--muted);
    font-size: 12px;
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    appearance: none;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--muted);
    cursor: pointer;
    font-size: 11px;
  }

  .tag-chip:hover {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
    color: var(--text);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
