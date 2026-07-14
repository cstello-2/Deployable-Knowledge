<script lang="ts">
  import { onMount } from "svelte";
  import type {
    DocumentTagAssignmentRequest,
    DocumentTagRequest,
  } from "$lib/requestTypes";
  import TagMenu from "$lib/components/menus/TagMenu.svelte";
  import DocumentProgressPopup from "$lib/components/popups/DocumentProgressPopup.svelte";
  import DocumentTagPickerPopup from "$lib/components/popups/DocumentTagPickerPopup.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import type { Document } from "$lib/server/database/schema";
  import {
    keepExistingDocumentSelections,
    selectDocument,
    selectedDocumentIds,
    toggleDocumentSelection,
  } from "$lib/utils/documentSelection";
  import type { WindowInstanceProps } from "./index";

  type DocumentRow = Pick<Document, "id" | "title" | "updatedAt"> & {
    chunkCount: number;
    tags: string[];
  };

  type UploadResult = {
    documentId: string;
    title: string;
    chunkCount: number;
  };

  type TagPickerMode = "add" | "remove";

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
  let availableTags = $state<string[]>([]);
  let tagFilters = $state<string[]>([]);
  let query = $state("");
  let addTagOpen = $state(false);
  let newTag = $state("");
  let tagPickerOpen = $state(false);
  let tagPickerMode = $state<TagPickerMode>("add");
  let status = $state("");
  let busy = $state(false);
  let progressOpen = $state(false);
  let progress = $state<{ label: string; message: string } | null>(null);
  let selectedCount = $derived($selectedDocumentIds.length);

  onMount(() => {
    refreshDocuments().catch(() => showToast("Documents failed to load"));
  });

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

  function visibleDocuments() {
    const normalizedQuery = query.trim().toLowerCase();

    return documents.filter((document) => {
      if (
        tagFilters.length > 0 &&
        !tagFilters.some((tag) => document.tags.includes(tag))
      ) {
        return false;
      }

      if (!normalizedQuery) return true;

      return `${document.title} ${document.id} ${document.tags.join(" ")}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }

  function toggleInList(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  }

  function toggleTagFilter(tag: string) {
    tagFilters = toggleInList(tagFilters, tag);
  }

  function handleDocumentClick(event: MouseEvent, documentId: string) {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input")) return;
    toggleDocumentSelection(documentId);
  }

  function handleDocumentKeydown(event: KeyboardEvent, documentId: string) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleDocumentSelection(documentId);
  }

  async function refreshDocuments(message = "") {
    const response = await fetch("/documents/list");
    if (!response.ok) throw new Error(await response.text());

    const body = (await response.json()) as {
      documents: DocumentRow[];
      tags: string[];
    };
    documents = body.documents;
    availableTags = body.tags;
    tagFilters = tagFilters.filter((tag) => availableTags.includes(tag));
    keepExistingDocumentSelections(
      new Set(documents.map((document) => document.id)),
    );
    if (message) status = message;
  }

  async function saveNewTag() {
    const tag = newTag.trim().replace(/^#/, "").toLowerCase();
    if (!tag) return;

    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(tag)) {
      showToast("Use letters, numbers, dashes, or underscores for tags");
      return;
    }

    const response = await fetch("/documents/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag } satisfies DocumentTagRequest),
    });

    if (!response.ok) {
      showToast("Failed to create tag");
      return;
    }

    newTag = "";
    addTagOpen = false;
    await refreshDocuments();
  }

  async function deleteTag(tag: string) {
    if (!window.confirm(`Delete #${tag} and remove it from all documents?`)) {
      return;
    }

    const response = await fetch("/documents/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag } satisfies DocumentTagRequest),
    });

    if (!response.ok) {
      showToast("Failed to delete tag");
      return;
    }

    tagFilters = tagFilters.filter((item) => item !== tag);
    await refreshDocuments();
  }

  async function setTagAssignment(
    documentIds: string[],
    tag: string,
    assigned: boolean,
  ) {
    const response = await fetch("/documents/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentIds,
        tag,
        assigned,
      } satisfies DocumentTagAssignmentRequest),
    });

    if (!response.ok) {
      showToast(assigned ? "Failed to apply tag" : "Failed to remove tag");
      return false;
    }

    await refreshDocuments();
    return true;
  }

  async function toggleDocumentTag(document: DocumentRow, tag: string) {
    const assigned = !document.tags.includes(tag);
    await setTagAssignment([document.id], tag, assigned);
  }

  async function removeDocumentTag(document: DocumentRow, tag: string) {
    await setTagAssignment([document.id], tag, false);
  }

  function openBulkTagPicker(mode: TagPickerMode) {
    if (availableTags.length === 0) {
      showToast("Create a tag first");
      return;
    }

    tagPickerMode = mode;
    tagPickerOpen = true;
  }

  async function applyBulkTag(tag: string) {
    tagPickerOpen = false;
    await setTagAssignment(
      $selectedDocumentIds,
      tag,
      tagPickerMode === "add",
    );
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

      if (!response.ok) throw new Error(await response.text());

      const result = (await response.json()) as UploadResult;
      selectedFile = null;
      if (fileInput) fileInput.value = "";
      if (typeof result.documentId === "string") selectDocument(result.documentId);
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
        onclick={() =>
          refreshDocuments().catch(() =>
            showToast("Documents failed to load"),
          )}
      >
        <Icon name="refresh" size={16} />
      </button>
    </form>

    <div class="docs-filter-row">
      <input
        class="input"
        type="search"
        placeholder="Filter documents by name or tags…"
        aria-label="Filter documents"
        bind:value={query}
      />
      <span class="li-subtle">
        {visibleDocuments().length} / {documents.length}
      </span>
    </div>

    <div class="tag-row docs-tag-filters">
      {#each tagFilters as tag}
        <button
          class="tag-chip selected"
          type="button"
          onclick={() => toggleTagFilter(tag)}
        >
          <span>#{tag}</span>
          <span class="tag-chip-x" aria-hidden="true">
            <Icon name="close" size={12} />
          </span>
        </button>
      {/each}

      <TagMenu
        id="document_tag_filters"
        tags={availableTags}
        selected={tagFilters}
        onToggle={toggleTagFilter}
        onRemove={deleteTag}
        onAdd={() => (addTagOpen = true)}
      >
        {#snippet trigger({ open, toggle, menuId })}
          <button
            class="tag-chip"
            type="button"
            title="Filter and manage tags"
            aria-label="Filter and manage tags"
            aria-haspopup="menu"
            aria-controls={menuId}
            aria-expanded={open}
            onclick={toggle}
          >
            <Icon name="add" size={14} />
          </button>
        {/snippet}
      </TagMenu>
    </div>

    {#if status}
      <div class="docs-status li-subtle">{status}</div>
    {/if}

    <div class="docs-selection li-subtle">
      {selectedCount} selected. If none are selected, chat searches all stored documents.
    </div>

    {#if selectedCount > 0}
      <div class="bulk-bar docs-bulk-bar">
        <span class="li-subtle">{selectedCount} selected</span>
        <button class="btn btn-sm" type="button" onclick={() => openBulkTagPicker("add")}>
          Apply tag
        </button>
        <button class="btn btn-sm" type="button" onclick={() => openBulkTagPicker("remove")}>
          Remove tag
        </button>
      </div>
    {/if}

    <div class="docs-list" aria-live="polite">
      {#each visibleDocuments() as document (document.id)}
        <div
          class="docs-row"
          class:selected={$selectedDocumentIds.includes(document.id)}
          role="button"
          tabindex="0"
          aria-pressed={$selectedDocumentIds.includes(document.id)}
          aria-label={`Use ${document.title} in chat`}
          onclick={(event) => handleDocumentClick(event, document.id)}
          onkeydown={(event) => handleDocumentKeydown(event, document.id)}
        >
          <div class="entity-navigation-icon" aria-hidden="true">
            <Icon name="description" size={20} />
          </div>
          <div class="docs-main">
            <div class="docs-title" title={document.title}>
              {document.title}
            </div>
            <div class="tag-row docs-tags">
              {#each document.tags as tag}
                <button
                  class="tag-chip selected"
                  type="button"
                  title={`Remove #${tag}`}
                  onclick={() => removeDocumentTag(document, tag)}
                >
                  <span>#{tag}</span>
                  <span class="tag-chip-x" aria-hidden="true">
                    <Icon name="close" size={12} />
                  </span>
                </button>
              {/each}

              <TagMenu
                id={`document_tags_${document.id}`}
                tags={availableTags}
                selected={document.tags}
                closeOnToggle
                onToggle={(tag) => toggleDocumentTag(document, tag)}
                onAdd={() => (addTagOpen = true)}
              >
                {#snippet trigger({ open, toggle, menuId })}
                  <button
                    class="tag-chip"
                    type="button"
                    title={`Edit tags for ${document.title}`}
                    aria-label={`Edit tags for ${document.title}`}
                    aria-haspopup="menu"
                    aria-controls={menuId}
                    aria-expanded={open}
                    onclick={toggle}
                  >
                    <Icon name="add" size={14} />
                  </button>
                {/snippet}
              </TagMenu>
            </div>
            <div class="docs-meta li-meta">
              {formatDate(document.updatedAt)}
            </div>
            <div class="docs-chunks li-meta">{document.chunkCount} chunks</div>
          </div>
        </div>
      {:else}
        <div class="empty-state">No documents match the current filters.</div>
      {/each}
    </div>
  </div>
</BaseWindow>

{#if addTagOpen}
  <div class="docs-tag-dialog" role="dialog" aria-modal="true" aria-label="Add tag">
    <div class="docs-tag-dialog-panel">
      <div class="docs-tag-dialog-title">Add Tag</div>
      <input
        class="input"
        type="text"
        placeholder="tag name"
        bind:value={newTag}
        onkeydown={(event) => {
          if (event.key === "Enter") void saveNewTag();
          if (event.key === "Escape") addTagOpen = false;
        }}
      />
      <div class="li-actions">
        <button class="btn" type="button" onclick={() => (addTagOpen = false)}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" onclick={saveNewTag}>
          Add
        </button>
      </div>
    </div>
  </div>
{/if}

<DocumentTagPickerPopup
  open={tagPickerOpen}
  title={tagPickerMode === "add" ? "Tag to apply" : "Tag to remove"}
  tags={availableTags}
  onSelect={(tag) => void applyBulkTag(tag)}
  onClose={() => (tagPickerOpen = false)}
/>

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
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
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

  .docs-filter-row {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .docs-tag-filters {
    min-height: 26px;
  }

  .docs-status {
    overflow-wrap: anywhere;
  }

  .docs-selection {
    min-height: 16px;
  }

  .docs-bulk-bar {
    margin: 0;
  }

  .docs-list {
    display: grid;
    min-height: 0;
    padding-right: 2px;
    overflow: auto;
    flex: 1 1 auto;
    align-content: start;
    gap: 8px;
  }

  .docs-row {
    display: grid;
    min-width: 0;
    padding: 7px 9px;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 1%));
    color: var(--text);
    cursor: pointer;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: center;
    gap: 9px;
  }

  .docs-row:hover {
    border-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 8%));
    background: hsl(var(--h) var(--sat) calc(var(--l-panel) + 3%));
  }

  .docs-row.selected {
    border-color: color-mix(in oklab, var(--accent) 52%, var(--border));
    background: color-mix(in oklab, var(--accent) 10%, transparent);
  }

  .docs-row:focus-visible {
    border-color: var(--accent);
    outline: none;
    box-shadow: inset 0 0 0 1px
      color-mix(in oklab, var(--accent) 45%, transparent);
  }

  .docs-main {
    display: grid;
    min-width: 0;
    grid-template-areas:
      "title meta"
      "tags chunks";
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px 12px;
  }

  .docs-title {
    grid-area: title;
    overflow: hidden;
    font-size: 13px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .docs-tags {
    grid-area: tags;
    min-height: 0;
  }

  .docs-meta {
    grid-area: meta;
    white-space: nowrap;
  }

  .docs-chunks {
    grid-area: chunks;
    justify-self: end;
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
      grid-template-columns: 36px minmax(0, 1fr);
    }

    .docs-main {
      gap: 2px 8px;
    }
  }
</style>
