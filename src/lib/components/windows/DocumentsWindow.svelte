<script lang="ts">
  import { onMount } from "svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import DocumentProgressPopup from "$lib/components/popups/DocumentProgressPopup.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import {
    keepExistingDocumentSelections,
    selectDocument,
    selectedDocumentIds,
    toggleDocumentSelection,
  } from "$lib/utils/documentSelection";
  import {
    knowledgeGraphState,
    knowledgeGraphStateMatches,
    refreshKnowledgeGraphStatus,
    type KnowledgeGraphClientState,
  } from "$lib/utils/knowledgeGraphState";
  import type { Document } from "$lib/server/database/schema";
  import type { WindowInstanceProps } from "./index";

  type DocumentRow = Pick<Document, "id" | "title" | "updatedAt"> & {
    chunkCount: number;
  };

  type UploadResult = {
    documentId: string;
    title: string;
    chunkCount: number;
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

  let fileInput = $state<HTMLInputElement | null>(null);
  let selectedFile = $state<File | null>(null);
  let documents = $state<DocumentRow[]>([]);
  let status = $state("");
  let busy = $state(false);
  let documentsLoaded = $state(false);
  let progressOpen = $state(false);
  let progressTitle = $state("Working");
  let progress = $state<{ label: string; message: string } | null>(null);
  let selectedCount = $derived($selectedDocumentIds.length);
  let currentGraphState = $derived(
    knowledgeGraphStateMatches($knowledgeGraphState, $selectedDocumentIds)
      ? $knowledgeGraphState
      : null,
  );
  let graphBuilding = $derived(currentGraphState?.status === "building");
  let operationBusy = $derived(busy || graphBuilding);
  let graphStatusText = $derived(formatGraphStatus(currentGraphState));

  onMount(() => {
    refreshDocuments().catch(() => showToast("Documents failed to load"));
  });

  $effect(() => {
    const documentIds = $selectedDocumentIds;
    const librarySignature = documents
      .map((document) => `${document.id}:${document.updatedAt}:${document.chunkCount}`)
      .join("|");

    if (!documentsLoaded) return;
    void librarySignature;
    void refreshKnowledgeGraphStatus(documentIds);
  });

  function shortId(id: string) {
    return id.length > 12 ? id.slice(0, 12) : id;
  }

  function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatUploadStatus(result: UploadResult) {
    return `Stored ${result.chunkCount} chunks from ${result.title}.`;
  }

  function graphScopeLabel() {
    if (selectedCount === 0) return "All documents (default)";
    if (documentsLoaded && selectedCount === documents.length) return "All documents selected";
    return `${selectedCount} selected ${selectedCount === 1 ? "document" : "documents"}`;
  }

  function formatGraphStatus(state: KnowledgeGraphClientState | null) {
    if (!documentsLoaded) return "Checking build status...";
    if (!documents.length) return "Upload a document to use Knowledge Graph retrieval.";
    if (!state || state.status === "unknown" || state.status === "checking") {
      return "Checking build status...";
    }

    if (state.status === "building") return "Building automatically for the current question...";
    if (state.status === "unavailable") {
      return state.message || "Build status is unavailable.";
    }
    if (state.status === "failed") {
      return state.error
        ? `The previous automatic build failed: ${state.error}`
        : "The previous automatic build failed. Your next graph question will retry it.";
    }
    if (state.status === "not_built") {
      return state.needsRebuild
        ? "Documents changed. The next graph question will rebuild it automatically."
        : "The first graph question will build it automatically.";
    }

    const stats = state.stats;
    return stats
      ? `Ready (${stats.nodes} nodes, ${stats.edges} edges). Each question refreshes the Galaxy view.`
      : "Ready. Each question refreshes the Galaxy view.";
  }

  async function refreshDocuments(message = "") {
    const response = await fetch("/documents/list");
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const body = await response.json();
    documents = (body.documents ?? []) as DocumentRow[];
    keepExistingDocumentSelections(new Set(documents.map((document) => document.id)));
    documentsLoaded = true;
    if (message) status = message;
  }
//TODO: Add configuration pane allowing the user to select local directories or mapped network drives (e.g., OneDrive sync folders) for automated ingestion.
  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    selectedFile = input.files?.[0] ?? null;
    status = "";
  }

  async function handleUpload(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedFile || operationBusy) return;

    busy = true;
    progressOpen = true;
    progressTitle = "Ingesting PDF";
    progress = {
      label: "Ingesting PDF",
      message: "Parsing, chunking, embedding, and storing.",
    };

    try {
      const form = new FormData();
      form.append("file", selectedFile);

      const response = await fetch("/documents", {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = (await response.json()) as UploadResult;
      selectedFile = null;
      if (fileInput) fileInput.value = "";
      if ("documentId" in result && typeof result.documentId === "string") {
        selectDocument(result.documentId);
      }
      await refreshDocuments(formatUploadStatus(result));
    } catch {
      showToast("Document upload failed");
    } finally {
      busy = false;
      progressOpen = false;
      progress = null;
    }
  }

</script>

<BaseWindow
  {id}
  {title}
  {closable}
  {height}
  {collapsed}
  {onToggleCollapse}
  {onClose}
  contentLabel="Documents"
>
  <div class="docs-window">
    <form class="docs-upload" onsubmit={handleUpload}>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        onchange={handleFileChange}
      />
      <button
        class="btn docs-file-button"
        type="button"
        disabled={operationBusy}
        onclick={() => fileInput?.click()}
      >
        <Icon name="attach_file" size={16} />
        <span>Choose PDF</span>
      </button>
      <div class="docs-file-name" title={selectedFile?.name ?? ""}>
        {selectedFile?.name ?? "No file selected"}
      </div>
      <button
        class="btn btn-primary docs-upload-button"
        type="submit"
        disabled={!selectedFile || operationBusy}
      >
        <Icon name="upload_file" size={16} />
        <span>Upload</span>
      </button>
      <button
        class="btn btn-icon"
        type="button"
        title="Refresh documents"
        aria-label="Refresh documents"
        disabled={operationBusy}
        onclick={() => refreshDocuments().catch(() => showToast("Documents failed to load"))}
      >
        <Icon name="refresh" size={16} />
      </button>
    </form>

    <div class="docs-status li-subtle" aria-live="polite">{status}</div>

    <div class="docs-selection li-subtle">
      {#if selectedCount === 0}
        No documents selected. Queries use all available documents by default.
      {:else if selectedCount === documents.length}
        All documents selected. Queries use the full document collection.
      {:else}
        {selectedCount} selected. Queries use only those documents.
      {/if}
    </div>

    <div
      class="docs-graph-controls"
      data-status={currentGraphState?.status ?? "checking"}
      aria-live="polite"
      aria-busy={graphBuilding}
    >
      <div class="docs-graph-status">
        <div class="docs-graph-heading">
          <strong>Knowledge Graph</strong>
          <span class="li-meta">{graphScopeLabel()}</span>
        </div>
        <div class="li-subtle">{graphStatusText}</div>
      </div>
    </div>

    <div class="docs-list" aria-live="polite">
      {#each documents as document (document.id)}
        <article class="docs-row">
          <input
            class="docs-check"
            type="checkbox"
            aria-label={`Use ${document.title} in chat`}
            checked={$selectedDocumentIds.includes(document.id)}
            disabled={operationBusy}
            onchange={() => toggleDocumentSelection(document.id)}
          />
          <div class="docs-icon" aria-hidden="true">
            <Icon name="description" size={18} />
          </div>
          <div class="docs-main">
            <div class="docs-title" title={document.title}>
              {document.title}
            </div>
            <div class="li-meta">
              {document.chunkCount} chunks - updated {formatDate(document.updatedAt)}
            </div>
          </div>
          <code class="docs-id" title={document.id}>{shortId(document.id)}</code>
        </article>
      {:else}
        <div class="empty-state">No documents stored.</div>
      {/each}
    </div>
  </div>
</BaseWindow>

<DocumentProgressPopup
  open={progressOpen}
  title={progressTitle}
  {progress}
/>

<style>
  :global(.miniwin[data-window-id="documents-window"] .content-inner) {
    height: 100%;
    overflow: hidden;
  }

  .docs-window {
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-rows: auto auto auto auto minmax(0, 1fr);
    gap: 10px;
  }

  .docs-upload {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: 8px;
    align-items: center;
  }

  .docs-upload input[type="file"] {
    display: none;
  }

  .docs-file-button,
  .docs-upload-button {
    gap: 6px;
    white-space: nowrap;
  }

  .docs-file-name {
    min-width: 0;
    overflow: hidden;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
    color: var(--muted);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .docs-status {
    min-height: 16px;
    overflow-wrap: anywhere;
  }

  .docs-selection {
    min-height: 16px;
  }

  .docs-graph-controls {
    display: flex;
    min-width: 0;
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .docs-graph-status {
    display: grid;
    min-width: 0;
    gap: 3px;
    overflow-wrap: anywhere;
  }

  .docs-graph-heading {
    display: flex;
    min-width: 0;
    align-items: baseline;
    gap: 8px;
  }


  .docs-list {
    display: grid;
    min-height: 0;
    align-content: start;
    gap: 8px;
    overflow: auto;
    padding-right: 2px;
  }

  .docs-row {
    display: grid;
    min-width: 0;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
  }

  .docs-check {
    width: 16px;
    min-width: 16px;
    height: 16px;
    margin: 0;
  }

  .docs-icon {
    display: grid;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--muted);
    place-items: center;
  }

  .docs-main {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .docs-title {
    overflow: hidden;
    font-size: 13px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .docs-id {
    max-width: 90px;
    overflow: hidden;
    color: var(--muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 680px) {
    .docs-upload {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .docs-file-name {
      grid-column: 1 / -1;
      order: 3;
    }

    .docs-row {
      grid-template-columns: auto auto minmax(0, 1fr);
    }

    .docs-graph-controls {
      align-items: stretch;
      flex-direction: column;
    }

    .docs-id {
      grid-column: 3;
      justify-self: start;
    }
  }
</style>
