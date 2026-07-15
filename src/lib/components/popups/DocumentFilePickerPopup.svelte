<script lang="ts">
  import Popup from "$lib/components/popups/Popup.svelte";

  type Props = {
    open: boolean;
    pathLabel: string;
    items: Array<{ name: string; path: string; kind: "folder" | "pdf" }>;
    busy?: boolean;
    canGoBack?: boolean;
    onClose: () => void;
    onBack: () => void;
    onSelectCurrent: () => void;
    onOpenFolder: (path: string) => void;
    onChooseFiles: () => void;
  };

  let {
    open,
    pathLabel,
    items,
    busy = false,
    canGoBack = false,
    onClose,
    onBack,
    onSelectCurrent,
    onOpenFolder,
    onChooseFiles,
  }: Props = $props();
</script>

<Popup
  {open}
  id="document-file-picker"
  title="Add document or folder"
  contentLabel="Document file picker"
  width="720px"
  {onClose}
>
  <div class="file-picker">
    <div class="file-picker-path" title={pathLabel}>{pathLabel}</div>

    <div class="file-picker-toolbar">
      <button class="btn" type="button" disabled={busy || !canGoBack} onclick={onBack}>Back</button>
      <button class="btn" type="button" disabled={busy} onclick={onChooseFiles}>Choose PDFs</button>
      <button class="btn btn-primary" type="button" disabled={busy} onclick={onSelectCurrent}>
        {busy ? "Adding..." : "Select Current Folder"}
      </button>
    </div>

    <div class="file-picker-list">
      {#each items as item}
        {#if item.kind === "folder"}
          <button
            class="file-picker-row"
            type="button"
            title={item.path}
            disabled={busy}
            onclick={() => onOpenFolder(item.path)}
          >
            <span class="file-picker-icon">[dir]</span>
            <span class="file-picker-name">{item.name}</span>
          </button>
        {:else}
          <div class="file-picker-row file-picker-file" title={item.path}>
            <span class="file-picker-icon">[PDF]</span>
            <span class="file-picker-name">{item.name}</span>
          </div>
        {/if}
      {:else}
        <div class="empty-state">No folders or PDFs shown.</div>
      {/each}
    </div>
  </div>
</Popup>

<style>
  .file-picker {
    display: grid;
    min-height: 0;
    gap: 10px;
  }

  .file-picker-toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .file-picker-path {
    overflow: hidden;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--muted);
    font-family: monospace;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-picker-list {
    display: grid;
    max-height: 380px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .file-picker-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
    padding: 9px 10px;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    text-align: left;
  }

  button.file-picker-row {
    cursor: pointer;
  }

  .file-picker-row:last-child {
    border-bottom: 0;
  }

  button.file-picker-row:hover {
    background: var(--hover);
  }

  .file-picker-file {
    color: var(--muted);
  }

  .file-picker-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
