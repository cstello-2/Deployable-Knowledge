<script lang="ts">
  import { onMount } from "svelte";
  import type {
    DocumentTagAssignmentRequest,
    DocumentTagRequest,
  } from "$lib/requestTypes";
  import TagMenu from "$lib/components/menus/TagMenu.svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import DocumentFilePickerPopup from "$lib/components/popups/DocumentFilePickerPopup.svelte";
  import DocumentProgressPopup from "$lib/components/popups/DocumentProgressPopup.svelte";
  import DocumentTagPickerPopup from "$lib/components/popups/DocumentTagPickerPopup.svelte";
  import { showToast } from "$lib/components/utils/ToastHost.svelte";
  import {
    keepExistingDocumentSelections,
    selectedDocumentIds,
    toggleDocumentSelection,
  } from "$lib/utils/documentSelection";
  import type { Document } from "$lib/server/database/schema";
  import type { WindowInstanceProps } from "./index";

  type DocumentRow = Pick<Document, "id" | "title" | "updatedAt"> & {
    chunkCount: number;
    folderId: string | null;
    tags: string[];
  };

  type UploadResult = {
    status: "success" | "error";
    filename: string;
    documentId?: string;
    title?: string;
    chunkCount?: number;
    message?: string;
  };

  type SyncResult = {
    added: number;
    updated: number;
    removed: number;
    unchanged: number;
    failed: number;
  };

  type ProgressFile = {
    path: string;
    name: string;
    status: string;
    message?: string;
  };

  type FolderSyncEvent =
    | { type: "folder"; folderId: string; created: boolean }
    | { type: "file"; sourcePath: string; status: string; message?: string }
    | { type: "done"; result?: SyncResult }
    | { type: "error"; message: string };

  type SyncedFolderRow = {
    id: string;
    path: string;
    lastError: string | null;
    watching: boolean;
  };

  type DirectoryItem = { name: string; path: string; kind: "folder" | "pdf" };
  type DirectoryResponse = {
    path: string;
    parentPath: string | null;
    items: DirectoryItem[];
  };
  type DocumentGroup = {
    key: string;
    label: string;
    documents: DocumentRow[];
    folder: SyncedFolderRow | null;
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
  let selectedFiles = $state<File[]>([]);
  let documents = $state<DocumentRow[]>([]);
  let folders = $state<SyncedFolderRow[]>([]);
  let collapsedGroups = $state<string[]>([]);
  let working = $state<string | null>(null);
  let availableTags = $state<string[]>([]);
  let tagFilters = $state<string[]>([]);
  let query = $state("");
  let addTagOpen = $state(false);
  let newTag = $state("");
  let tagPickerOpen = $state(false);
  let tagPickerMode = $state<TagPickerMode>("add");
  let status = $state("");
  let progressOpen = $state(false);
  let progress = $state<{ label: string; message: string } | null>(null);
  let progressFiles = $state<ProgressFile[]>([]);
  let progressComplete = $state(false);
  let pickerOpen = $state(false);
  let pickerPath = $state("");
  let pickerParentPath = $state<string | null>(null);
  let pickerItems = $state<DirectoryItem[]>([]);
  let selectedCount = $derived($selectedDocumentIds.length);

  onMount(() => {
    refreshAll().catch(() => showToast("Documents failed to load"));
  });

  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(await responseError(response));
    return response.json() as Promise<T>;
  }

  async function responseError(response: Response): Promise<string> {
    const text = await response.text();

    try {
      const body = JSON.parse(text) as { message?: string };
      return body.message || text || response.statusText;
    } catch {
      return text || response.statusText || `Request failed (${response.status})`;
    }
  }

  function shortFolderName(path: string) {
    return path.split(/[\\/]+/).filter(Boolean).at(-1) || path;
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

  function documentGroups(): DocumentGroup[] {
    const registeredIds = new Set(folders.map((folder) => folder.id));
    const visible = visibleDocuments();
    const groups: DocumentGroup[] = folders.map((folder) => ({
      key: folder.id,
      label: shortFolderName(folder.path),
      documents: visible.filter((document) => document.folderId === folder.id),
      folder,
    }));
    const individual = visible.filter(
      (document) => !document.folderId || !registeredIds.has(document.folderId),
    );

    if (individual.length || groups.length === 0) {
      groups.push({ key: "individual", label: "Individual files", documents: individual, folder: null });
    }
    return groups;
  }

  function visibleDocuments() {
    const normalizedQuery = query.trim().toLowerCase();

    return documents.filter((document) => {
      if (tagFilters.length > 0 && !tagFilters.some((tag) => document.tags.includes(tag))) {
        return false;
      }
      if (!normalizedQuery) return true;
      return `${document.title} ${document.id} ${document.tags.join(" ")}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }

  function toggleTagFilter(tag: string) {
    tagFilters = tagFilters.includes(tag)
      ? tagFilters.filter((item) => item !== tag)
      : [...tagFilters, tag];
  }

  function groupIsSelected(group: DocumentGroup) {
    return (
      group.documents.length > 0 &&
      group.documents.every((document) => $selectedDocumentIds.includes(document.id))
    );
  }

  function groupIsPartlySelected(group: DocumentGroup) {
    const selected = group.documents.filter((document) =>
      $selectedDocumentIds.includes(document.id),
    ).length;
    return selected > 0 && selected < group.documents.length;
  }

  function toggleGroupSelection(group: DocumentGroup) {
    const groupIds = new Set(group.documents.map((document) => document.id));
    if (groupIsSelected(group)) {
      $selectedDocumentIds = $selectedDocumentIds.filter((documentId) => !groupIds.has(documentId));
    } else {
      $selectedDocumentIds = [...new Set([...$selectedDocumentIds, ...groupIds])];
    }
  }

  function toggleGroupCollapsed(groupId: string) {
    collapsedGroups = collapsedGroups.includes(groupId)
      ? collapsedGroups.filter((id) => id !== groupId)
      : [...collapsedGroups, groupId];
  }

  async function refreshAll(message = "") {
    const [documentData, folderData] = await Promise.all([
      request<{ documents?: DocumentRow[]; tags?: string[] }>("/documents/list"),
      request<{ folders?: SyncedFolderRow[] }>("/documents/folders"),
    ]);
    documents = documentData.documents ?? [];
    availableTags = documentData.tags ?? [];
    tagFilters = tagFilters.filter((tag) => availableTags.includes(tag));
    folders = folderData.folders ?? [];
    keepExistingDocumentSelections(new Set(documents.map((document) => document.id)));
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
    await refreshAll();
  }

  async function deleteTag(tag: string) {
    if (!window.confirm(`Delete #${tag} and remove it from all documents?`)) return;
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
    await refreshAll();
  }

  async function setTagAssignment(documentIds: string[], tag: string, assigned: boolean) {
    const response = await fetch("/documents/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentIds, tag, assigned } satisfies DocumentTagAssignmentRequest),
    });
    if (!response.ok) {
      showToast(assigned ? "Failed to apply tag" : "Failed to remove tag");
      return false;
    }

    await refreshAll();
    return true;
  }

  async function toggleDocumentTag(document: DocumentRow, tag: string) {
    await setTagAssignment([document.id], tag, !document.tags.includes(tag));
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
    await setTagAssignment($selectedDocumentIds, tag, tagPickerMode === "add");
  }

  function syncSummary(result: SyncResult | null | undefined) {
    if (!result) return "Folder sync finished.";
    return `Synced: ${result.added} added, ${result.updated} updated, ${result.removed} removed, ${result.unchanged} unchanged, ${result.failed} failed.`;
  }

  function openProgress(label: string, message: string, files: ProgressFile[] = []) {
    progress = { label, message };
    progressFiles = files;
    progressComplete = false;
    progressOpen = true;
  }

  function closeProgress() {
    if (!progressComplete) return;
    progressOpen = false;
    progress = null;
    progressFiles = [];
    progressComplete = false;
  }

  function updateProgressFile(path: string, status: string, message?: string) {
    const existing = progressFiles.some((file) => file.path === path);
    const file = { path, name: shortFolderName(path), status, message };
    progressFiles = existing
      ? progressFiles.map((current) => (current.path === path ? file : current))
      : [...progressFiles, file];
  }

  async function readFolderSync(response: Response) {
    if (!response.body) throw new Error("Folder sync response could not be read.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let created = true;
    let result: SyncResult | undefined;
    let streamError = "";

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as FolderSyncEvent;

      if (event.type === "folder") {
        created = event.created;
      } else if (event.type === "file") {
        updateProgressFile(event.sourcePath, event.status, event.message);
        progress = {
          label: progress?.label ?? "Ingesting folder",
          message:
            event.status === "ingesting"
              ? `Ingesting ${shortFolderName(event.sourcePath)}`
              : `${progressFiles.length} PDF${progressFiles.length === 1 ? "" : "s"} found.`,
        };
      } else if (event.type === "done") {
        result = event.result;
        progress = { label: progress?.label ?? "Ingesting folder", message: syncSummary(result) };
      } else {
        streamError = event.message;
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
      if (done) break;
    }

    handleLine(buffer);
    if (streamError) throw new Error(streamError);
    return { created, result };
  }

  async function addFolder(path: string) {
    if (!path.trim() || working) return;
    working = "folder";
    pickerOpen = false;
    openProgress("Ingesting folder", `Scanning ${shortFolderName(path)} for PDFs.`);

    try {
      const response = await fetch("/documents/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!response.ok) throw new Error(await responseError(response));

      const synced = await readFolderSync(response);
      await refreshAll(synced.created ? "Folder registered and synced." : "Folder synced.");
      progress = {
        label: "Folder sync complete",
        message: syncSummary(synced.result),
      };
    } catch (folderError) {
      const message = folderError instanceof Error ? folderError.message : String(folderError);
      progress = { label: "Folder sync failed", message };
      showToast(message);
    } finally {
      working = null;
      progressComplete = true;
    }
  }

  async function handleSyncFolder(folderId: string) {
    if (working) return;
    working = folderId;

    try {
      const body = await request<{ result?: SyncResult }>(`/documents/folders/${folderId}`, {
        method: "POST",
      });
      await refreshAll(syncSummary(body.result));
    } catch {
      showToast("Folder sync failed");
    } finally {
      working = null;
    }
  }

  async function handleRemoveFolder(folder: SyncedFolderRow, removeDocuments: boolean) {
    if (working) return;
    const message = removeDocuments
      ? `Stop watching ${folder.path} and delete all documents synced from it?`
      : `Stop watching ${folder.path} and keep its stored documents?`;
    if (!confirm(message)) return;

    working = folder.id;
    try {
      await request(
        `/documents/folders/${folder.id}?removeDocuments=${removeDocuments}`,
        { method: "DELETE" },
      );
      await refreshAll(
        removeDocuments
          ? "Folder and its synced documents removed."
          : "Folder unwatched; stored documents were kept.",
      );
    } catch {
      showToast("Folder removal failed");
    } finally {
      working = null;
    }
  }

  async function handleRemoveDocument(document: DocumentRow) {
    if (working) return;
    if (!confirm(`Remove "${document.title}" from the document library?`)) return;

    working = document.id;
    try {
      await request(`/documents/${document.id}`, { method: "DELETE" });
      await refreshAll("Document removed.");
    } catch {
      showToast("Document removal failed");
    } finally {
      working = null;
    }
  }

  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    selectedFiles = Array.from(input.files ?? []);
    status = "";
  }

  async function handleUpload(event: SubmitEvent) {
    event.preventDefault();
    if (selectedFiles.length === 0 || working) return;

    working = "upload";
    openProgress(
      `Ingesting ${selectedFiles.length} PDF${selectedFiles.length === 1 ? "" : "s"}`,
      "Files are processed sequentially through the shared ingestion pipeline.",
      selectedFiles.map((file) => ({ path: file.name, name: file.name, status: "queued" })),
    );

    try {
      const form = new FormData();
      for (const file of selectedFiles) form.append("files", file);

      const body = await request<{ uploads?: UploadResult[] }>("/documents", {
        method: "POST",
        body: form,
      });
      const uploads = body.uploads ?? [];
      const succeeded = uploads.filter((upload) => upload.status === "success");
      const failed = uploads.filter((upload) => upload.status === "error");
      for (const upload of uploads) {
        updateProgressFile(upload.filename, upload.status, upload.message);
      }
      for (const upload of succeeded) {
        if (upload.documentId && !$selectedDocumentIds.includes(upload.documentId)) {
          $selectedDocumentIds = [...$selectedDocumentIds, upload.documentId];
        }
      }

      selectedFiles = [];
      if (fileInput) fileInput.value = "";
      await refreshAll(
        `Uploaded ${succeeded.length} PDF${succeeded.length === 1 ? "" : "s"}${failed.length ? `; ${failed.length} failed` : ""}.`,
      );
      progress = {
        label: "Upload complete",
        message: `${succeeded.length} succeeded${failed.length ? `; ${failed.length} failed` : ""}.`,
      };
      if (failed.length) showToast(`${failed.length} PDF upload${failed.length === 1 ? "" : "s"} failed`);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : String(uploadError);
      progressFiles = progressFiles.map((file) =>
        file.status === "queued" ? { ...file, status: "error", message } : file,
      );
      progress = { label: "Document upload failed", message };
      showToast(message);
    } finally {
      working = null;
      progressComplete = true;
    }
  }

  async function openDirectory(path = "") {
    pickerOpen = true;
    try {
      const query = path ? `?path=${encodeURIComponent(path)}` : "";
      const body = await request<DirectoryResponse>(`/documents/directories${query}`);
      pickerPath = body.path;
      pickerParentPath = body.parentPath;
      pickerItems = body.items;
    } catch {
      pickerOpen = false;
      showToast("Folder browser failed to open");
    }
  }

  function choosePdfFiles() {
    pickerOpen = false;
    fileInput?.click();
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
    <form class="docs-toolbar" onsubmit={handleUpload}>
      <input
        bind:this={fileInput}
        type="file"
        multiple
        accept="application/pdf,.pdf"
        onchange={handleFileChange}
      />
      <button class="btn btn-primary" type="button" disabled={Boolean(working)} onclick={() => openDirectory()}>
        <Icon name="create_new_folder" size={16} />
        <span>Add document or folder</span>
      </button>
      <div class="docs-file-name">
        {selectedFiles.length ? `${selectedFiles.length} PDF${selectedFiles.length === 1 ? "" : "s"} selected` : "No files selected"}
      </div>
      <button class="btn" type="submit" disabled={selectedFiles.length === 0 || Boolean(working)}>
        <Icon name="upload_file" size={16} />
        <span>Upload</span>
      </button>
      <button
        class="btn btn-icon"
        type="button"
        title="Refresh documents"
        aria-label="Refresh documents"
        disabled={Boolean(working)}
        onclick={() => refreshAll().catch(() => showToast("Documents failed to load"))}
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
      <span class="li-subtle">{visibleDocuments().length} / {documents.length}</span>
    </div>

    <div class="tag-row docs-tag-filters">
      {#each tagFilters as tag}
        <button class="tag-chip selected" type="button" onclick={() => toggleTagFilter(tag)}>
          <span>#{tag}</span>
          <span class="tag-chip-x" aria-hidden="true"><Icon name="close" size={12} /></span>
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
          ><Icon name="add" size={14} /></button>
        {/snippet}
      </TagMenu>
    </div>

    {#if status}<div class="docs-status li-subtle">{status}</div>{/if}

    <div class="docs-selection li-subtle">
      {selectedCount} selected. If none are selected, chat searches all stored documents.
    </div>

    {#if selectedCount > 0}
      <div class="bulk-bar docs-bulk-bar">
        <span class="li-subtle">{selectedCount} selected</span>
        <button class="btn btn-sm" type="button" onclick={() => openBulkTagPicker("add")}>Apply tag</button>
        <button class="btn btn-sm" type="button" onclick={() => openBulkTagPicker("remove")}>Remove tag</button>
      </div>
    {/if}

    <div class="docs-list" aria-live="polite">
      {#each documentGroups() as group (group.key)}
        <section class="docs-group">
          <header class="docs-group-header">
            <input
              class="docs-check"
              type="checkbox"
              aria-label={`Select every document in ${group.label}`}
              checked={groupIsSelected(group)}
              indeterminate={groupIsPartlySelected(group)}
              disabled={group.documents.length === 0}
              onchange={() => toggleGroupSelection(group)}
            />
            <button
              class:expanded={!collapsedGroups.includes(group.key)}
              class="btn btn-icon docs-group-toggle"
              type="button"
              aria-label={`Toggle ${group.label}`}
              onclick={() => toggleGroupCollapsed(group.key)}
            >
              <Icon name="expand_more" size={16} />
            </button>
            <div class="docs-group-main">
              <div class="docs-group-title" title={group.folder?.path ?? group.label}>{group.label}</div>
              <div class="li-meta">
                {group.documents.length} document{group.documents.length === 1 ? "" : "s"}
                {#if group.folder}
                  · {group.folder.watching ? "watching" : "stopped"}
                {/if}
              </div>
              {#if group.folder?.lastError}
                <div class="docs-folder-error" title={group.folder.lastError}>{group.folder.lastError}</div>
              {/if}
            </div>
            {#if group.folder}
              <div class="docs-group-actions">
                <button
                  class="btn btn-icon"
                  type="button"
                  title="Sync now"
                  disabled={Boolean(working)}
                  onclick={() => handleSyncFolder(group.folder!.id)}
                ><Icon name="sync" size={16} /></button>
                <button
                  class="btn"
                  type="button"
                  title="Stop watching and keep documents"
                  disabled={Boolean(working)}
                  onclick={() => handleRemoveFolder(group.folder!, false)}
                >Unwatch</button>
                <button
                  class="btn btn-icon"
                  type="button"
                  title="Stop watching and delete synced documents"
                  disabled={Boolean(working)}
                  onclick={() => handleRemoveFolder(group.folder!, true)}
                ><Icon name="delete" size={16} /></button>
              </div>
            {/if}
          </header>

          {#if !collapsedGroups.includes(group.key)}
            <div class="docs-group-documents">
              {#each group.documents as document (document.id)}
                <article class="docs-row">
                  <input
                    class="docs-check"
                    type="checkbox"
                    aria-label={`Use ${document.title} in chat`}
                    checked={$selectedDocumentIds.includes(document.id)}
                    onchange={() => toggleDocumentSelection(document.id)}
                  />
                  <div class="docs-icon" aria-hidden="true"><Icon name="description" size={18} /></div>
                  <div class="docs-main">
                    <div class="docs-title" title={document.title}>{document.title}</div>
                    <div class="tag-row docs-tags">
                      {#each document.tags as tag}
                        <button
                          class="tag-chip selected"
                          type="button"
                          title={`Remove #${tag}`}
                          onclick={() => setTagAssignment([document.id], tag, false)}
                        >
                          <span>#{tag}</span>
                          <span class="tag-chip-x" aria-hidden="true"><Icon name="close" size={12} /></span>
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
                          ><Icon name="add" size={14} /></button>
                        {/snippet}
                      </TagMenu>
                    </div>
                    <div class="li-meta">
                      {document.chunkCount} chunks - updated {formatDate(document.updatedAt)}
                    </div>
                  </div>
                  <button
                    class="btn btn-icon"
                    type="button"
                    title="Remove document"
                    aria-label={`Remove ${document.title}`}
                    disabled={Boolean(working)}
                    onclick={() => handleRemoveDocument(document)}
                  ><Icon name="delete" size={16} /></button>
                </article>
              {/each}
            </div>
          {/if}
        </section>
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
        <button class="btn" type="button" onclick={() => (addTagOpen = false)}>Cancel</button>
        <button class="btn btn-primary" type="button" onclick={saveNewTag}>Add</button>
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

<DocumentFilePickerPopup
  open={pickerOpen}
  pathLabel={pickerPath}
  items={pickerItems}
  busy={Boolean(working)}
  canGoBack={Boolean(pickerParentPath)}
  onClose={() => (pickerOpen = false)}
  onBack={() => pickerParentPath && openDirectory(pickerParentPath)}
  onSelectCurrent={() => addFolder(pickerPath)}
  onOpenFolder={openDirectory}
  onChooseFiles={choosePdfFiles}
/>

<DocumentProgressPopup
  open={progressOpen}
  title="Ingesting PDFs"
  {progress}
  files={progressFiles}
  complete={progressComplete}
  onClose={closeProgress}
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
    gap: 9px;
  }

  .docs-toolbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: 8px;
    align-items: center;
  }

  .docs-toolbar input[type="file"] { display: none; }

  .docs-file-name {
    min-width: 0;
    overflow: hidden;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--muted);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .docs-status { overflow-wrap: anywhere; }
  .docs-selection { min-height: 16px; }

  .docs-filter-row {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .docs-tag-filters { min-height: 26px; }
  .docs-bulk-bar { margin: 0; }

  .docs-list {
    display: grid;
    min-height: 0;
    align-content: start;
    gap: 8px;
    overflow: auto;
    padding-right: 2px;
    flex: 1 1 auto;
  }

  .docs-group {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
  }

  .docs-group-header {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 8px;
  }

  .docs-group-toggle :global(.material-symbols-rounded) { transition: transform 120ms ease; }
  .docs-group-toggle.expanded :global(.material-symbols-rounded) { transform: rotate(180deg); }

  .docs-group-main,
  .docs-main {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .docs-group-title,
  .docs-title,
  .docs-folder-error {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .docs-group-title,
  .docs-title { font-size: 13px; font-weight: 650; }
  .docs-tags { min-height: 0; }
  .docs-folder-error { color: var(--danger, #c44); font-size: 11px; }

  .docs-group-actions {
    display: flex;
    gap: 5px;
    align-items: center;
  }

  .docs-group-documents {
    display: grid;
    border-top: 1px solid var(--border);
  }

  .docs-row {
    display: grid;
    min-width: 0;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    gap: 9px;
    align-items: center;
    padding: 9px 10px 9px 42px;
    border-bottom: 1px solid var(--border);
  }

  .docs-row:last-child { border-bottom: 0; }

  .docs-check {
    width: 16px;
    min-width: 16px;
    height: 16px;
    margin: 0;
  }

  .docs-icon {
    display: grid;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--muted);
    place-items: center;
  }

  @media (max-width: 760px) {
    .docs-toolbar,
    .docs-group-header { grid-template-columns: 1fr auto; }
    .docs-file-name,
    .docs-group-main { grid-column: 1 / -1; }
    .docs-group-actions { grid-column: 1 / -1; justify-content: flex-end; }
    .docs-row { grid-template-columns: auto auto minmax(0, 1fr) auto; padding-left: 10px; }
  }
</style>
