<script lang="ts">
  import { onMount } from "svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import DocumentProgressPopup from "$lib/components/popups/DocumentProgressPopup.svelte";
  import {
    keepExistingDocumentSelections,
    selectDocument,
    selectedDocumentIds,
    toggleDocumentSelection,
  } from "$lib/utils/documentSelection";
  import type { WindowInstanceProps } from "./index.ts";

  type DocumentRow = {
    id: string;
    title: string;
    updatedAt: string;
    chunkCount: number;
  };

  type UploadResult = {
    documentId: string;
    title: string;
    chunkCount: number;
    timings?: {
      totalMs?: number;
    };
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
  let progressOpen = $state(false);
  let progress = $state<{ label: string; message: string } | null>(null);
  let selectedCount = $derived($selectedDocumentIds.length);

  onMount(() => {
    refreshDocuments().catch(showError);
  });

  function showError(error: unknown) {
    status = error instanceof Error ? error.message : String(error);
  }

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
    const seconds = Number(result.timings?.totalMs ?? 0) / 1000;
    const timing = seconds > 0 ? ` in ${seconds.toFixed(1)}s` : "";
    return `Stored ${result.chunkCount} chunks from ${result.title}${timing}.`;
  }

  async function refreshDocuments(message = "") {
    const response = await fetch("/documents/list");
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const body = await response.json();
    documents = (body.documents ?? []) as DocumentRow[];
    keepExistingDocumentSelections(new Set(documents.map((document) => document.id)));
    if (message) status = message;
  }

  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    selectedFile = input.files?.[0] ?? null;
    status = "";
  }

  async function handleUpload(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedFile || busy) return;

    busy = true;
    progressOpen = true;
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
    } catch (error) {
      showError(error);
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
        disabled={busy}
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
        disabled={!selectedFile || busy}
      >
        <Icon name="upload_file" size={16} />
        <span>Upload</span>
      </button>
      <button
        class="btn btn-icon"
        type="button"
        title="Refresh documents"
        aria-label="Refresh documents"
        disabled={busy}
        onclick={() => refreshDocuments().catch(showError)}
      >
        <Icon name="refresh" size={16} />
      </button>
    </form>

    {#if status}
      <div class="docs-status li-subtle">{status}</div>
    {/if}

    <div class="docs-selection li-subtle">
      {selectedCount} selected. If none are selected, chat searches all stored documents.
    </div>

    <div class="docs-list" aria-live="polite">
      {#each documents as document (document.id)}
        <article class="docs-row">
          <input
            class="docs-check"
            type="checkbox"
            aria-label={`Use ${document.title} in chat`}
            checked={$selectedDocumentIds.includes(document.id)}
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
  title="Ingesting PDF"
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
    grid-template-rows: auto auto auto minmax(0, 1fr);
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
    overflow-wrap: anywhere;
  }

  .docs-selection {
    min-height: 16px;
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

    .docs-id {
      grid-column: 3;
      justify-self: start;
    }
  }
</style>
