<script lang="ts">
  import Popup from "$lib/components/popups/Popup.svelte";

  type Props = {
    open: boolean;
    items: DirectoryItem[];
    pathLabel: string;
    selectedFilePath?: string;
    message?: string;
    busy?: boolean;
    canGoBack?: boolean;
    onClose: () => void;
    onBack: () => void;
    onSelectCurrent: () => void;
    onOpenFolder: (path: string) => void;
    onSelectFile: (item: DirectoryItem) => void;
  };

  export type DirectoryItem = {
    path: string,
    kind: string,
    name: string,
    absolute_path: string,
  }

  let {
    open,
    items,
    pathLabel,
    selectedFilePath,
    message = "PDF files only.",
    busy = false,
    canGoBack = false,
    onClose,
    onBack,
    onSelectCurrent,
    onOpenFolder,
    onSelectFile,
  }: Props = $props();

  function isPdf(name: string) {
    return name.toLowerCase().endsWith(".pdf");
  }

  function visibleItems() {
    console.log("From Popup", items);
    return items.filter((item) => item.kind === "folder" || isPdf(item.name));
  }

  function choose(item: DirectoryItem) {
    if (item.kind === "folder") onOpenFolder(item.path);
    else onSelectFile(item);
  }
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
    <div class="file-picker-path">{pathLabel}</div>

    <div class="toolbar">
      <button class="btn" type="button" disabled={busy || !canGoBack} onclick={onBack}>Back</button>
      <button class="btn btn-primary" type="button" disabled={busy} onclick={onSelectCurrent}>
        {selectedFilePath ? "Embed Selected File" : "Select Current Folder"}
      </button>
    </div>

    <div class="file-picker-list">
       {#each visibleItems() as item} 
         <button 
           class:selected={item.absolute_path === selectedFilePath} 
           class="file-picker-row" 
           type="button" 
           title={item.path} 
           onclick={() => choose(item)} 
         > 
           <span class="file-picker-icon">{item.kind === "folder" ? "[dir]" : "[pdf]"}</span> 
           <span class="file-picker-name">{item.name}</span> 
           <span class="file-picker-kind">{item.kind}</span> 
         </button> 
       {:else} 
         <div class="empty-state">No PDF files or folders shown.</div> 
       {/each} 
    </div>

    <div class="status-line">{message}</div>
  </div>
</Popup>
