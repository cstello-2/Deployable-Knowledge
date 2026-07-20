<script lang="ts">
  import { onMount } from "svelte";
  import type {
    DocumentIngestEvent,
    DocumentIngestProgress,
    DocumentIngestResult,
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
    | ({ type: "file"; sourcePath: string; status: string } & Partial<DocumentIngestProgress>)
    | { type: "done"; result?: SyncResult }
    | { type: "error"; message: string };

  type SyncedFolderRow = {
    id: string;
    path: string;
    lastError: string | null;
    watching: boolean;
  };

  type DirectoryItem = { name: string; path: string; kind: "folder" | "pdf" | "docx" };
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
  let progress = $state<DocumentIngestProgress | null>(null);
  let progressFiles = $state<ProgressFile[]>([]);
  let pickerOpen = $state(false);
  let pickerPath = $state("");
  let pickerParentPath = $state<string | null>(null);
  let pickerItems = $state<DirectoryItem[]>([]);
  let pickerSelectedPaths = $state<string[]>([]);
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

  function handleDocumentClick(event: MouseEvent, documentId: string) {
    if ((event.target as HTMLElement).closest("button, a, input")) return;
    toggleDocumentSelection(documentId);
  }

  function handleDocumentKeydown(event: KeyboardEvent, documentId: string) {
    if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    toggleDocumentSelection(documentId);
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
    progress = { percent: 0, label, message };
    progressFiles = files;
    progressOpen = true;
  }

  function hideProgress() {
    progressOpen = false;
    progress = null;
    progressFiles = [];
  }

  function updateProgressFile(path: string, status: string, message?: string) {
    const existing = progressFiles.some((file) => file.path === path);
    const file = { path, name: shortFolderName(path), status, message };
    progressFiles = existing
      ? progressFiles.map((current) => (current.path === path ? file : current))
      : [...progressFiles, file];
  }

  async function readStream(response: Response, handleLine: (line: string) => void) {
    if (!response.ok || !response.body) throw new Error(await response.text());
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handleLine);
      if (done) break;
    }

    handleLine(buffer);
  }

  async function readFolderSync(response: Response) {
    let created = true;
    let result: SyncResult | undefined;
    let streamError = "";

    await readStream(response, (line) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as FolderSyncEvent;

      if (event.type === "folder") {
        created = event.created;
      } else if (event.type === "file") {
        updateProgressFile(event.sourcePath, event.status, event.status === "failed" ? event.message : undefined);
        if (event.status === "ingesting") {
          progress = {
            percent: event.percent ?? 0,
            label: event.label ?? "Ingesting PDF",
            message: event.message ?? `Ingesting ${shortFolderName(event.sourcePath)}`,
          };
        }
      } else if (event.type === "done") {
        result = event.result;
      } else {
        streamError = event.message;
      }
    });

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
    } catch (folderError) {
      const message = folderError instanceof Error ? folderError.message : String(folderError);
      showToast(message);
    } finally {
      working = null;
      hideProgress();
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

  function togglePickerPdf(path: string) {
    pickerSelectedPaths = pickerSelectedPaths.includes(path)
      ? pickerSelectedPaths.filter((selectedPath) => selectedPath !== path)
      : [...pickerSelectedPaths, path];
  }

  async function readUpload(response: Response, path: string): Promise<UploadResult> {
    let result: DocumentIngestResult | null = null;
    let streamError = "";

    await readStream(response, (line) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as DocumentIngestEvent;

      if (event.status === "progress") {
        progress = event;
      } else if (event.status === "complete") {
        result = event.result;
      } else {
        streamError = event.message;
      }
    });

    if (streamError) throw new Error(streamError);
    if (!result) throw new Error("Document ingestion ended before completion.");
    return { status: "success", filename: shortFolderName(path), ...(result as DocumentIngestResult) };
  }

  async function addSelectedPdfs() {
    if (pickerSelectedPaths.length === 0 || working) return;

    const paths = [...pickerSelectedPaths];
    pickerOpen = false;
    working = "upload";
    openProgress(
      `Ingesting ${paths.length} document${paths.length === 1 ? "" : "s"}`,
      `Ingesting ${shortFolderName(paths[0])}`,
      paths.map((path) => ({ path, name: shortFolderName(path), status: "queued" })),
    );

    try {
      const uploads: UploadResult[] = [];

      for (const path of paths) {
        updateProgressFile(path, "ingesting");
        progress = {
          percent: 0,
          label: `Ingesting ${paths.length} PDF${paths.length === 1 ? "" : "s"}`,
          message: `Ingesting ${shortFolderName(path)}`,
        };

        try {
          const response = await fetch("/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths: [path] }),
          });
          const result = await readUpload(response, path);
          uploads.push(result);
          updateProgressFile(path, "success");
        } catch (fileError) {
          const message = fileError instanceof Error ? fileError.message : String(fileError);
          uploads.push({ status: "error", filename: shortFolderName(path), message });
          updateProgressFile(path, "error", message);
        }
      }

      const succeeded = uploads.filter((upload) => upload.status === "success");
      const failed = uploads.filter((upload) => upload.status === "error");
      for (const upload of succeeded) {
        if (upload.documentId && !$selectedDocumentIds.includes(upload.documentId)) {
          $selectedDocumentIds = [...$selectedDocumentIds, upload.documentId];
        }
      }

      pickerSelectedPaths = [];
      await refreshAll(
        `Uploaded ${succeeded.length} PDF${succeeded.length === 1 ? "" : "s"}${failed.length ? `; ${failed.length} failed` : ""}.`,
      );
      if (failed.length) showToast(`${failed.length} PDF upload${failed.length === 1 ? "" : "s"} failed`);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : String(uploadError);
      showToast(message);
    } finally {
      working = null;
      hideProgress();
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
    <div class="docs-toolbar">
      <button class="btn btn-primary" type="button" disabled={Boolean(working)} onclick={() => openDirectory()}>
        <Icon name="create_new_folder" size={16} />
        <span>Add document or folder</span>
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
    </div>

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
                <div
                  class:selected={$selectedDocumentIds.includes(document.id)}
                  class="docs-row"
                  role="button"
                  tabindex="0"
                  aria-pressed={$selectedDocumentIds.includes(document.id)}
                  aria-label={`Use ${document.title} in chat`}
                  onclick={(event) => handleDocumentClick(event, document.id)}
                  onkeydown={(event) => handleDocumentKeydown(event, document.id)}
                >
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
                </div>
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
  selectedPdfPaths={pickerSelectedPaths}
  onClose={() => {
    pickerOpen = false;
    pickerSelectedPaths = [];
  }}
  onBack={() => pickerParentPath && openDirectory(pickerParentPath)}
  onSubmit={() => pickerSelectedPaths.length ? addSelectedPdfs() : addFolder(pickerPath)}
  onOpenFolder={openDirectory}
  onTogglePdf={togglePickerPdf}
/>

<DocumentProgressPopup
  open={progressOpen}
  title="Ingesting documents"
  {progress}
  files={progressFiles}
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
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .docs-toolbar .btn-icon { margin-left: auto; }

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
    scrollbar-color: hsl(var(--h) var(--sat) calc(var(--l-border) + 6%))
      hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
    scrollbar-width: thin;
  }

  .docs-group {
    min-width: 0;
  }

  .docs-list::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }

  .docs-list::-webkit-scrollbar-track {
    border-left: 1px solid var(--border);
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
  }

  .docs-list::-webkit-scrollbar-thumb {
    border: 3px solid hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) calc(var(--l-border) + 2%));
  }

  .docs-list::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--h) var(--sat) calc(var(--l-border) + 6%));
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
    gap: 3px;
  }

  .docs-row {
    display: grid;
    min-width: 0;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 9px;
    align-items: center;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
  }

  .docs-row:hover {
    background: var(--hover);
  }

  .docs-row.selected {
    border-color: color-mix(in oklab, var(--accent) 52%, var(--border));
    background: color-mix(in oklab, var(--accent) 10%, transparent);
  }

  .docs-row:focus-visible {
    border-color: var(--accent);
    outline: none;
  }

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
    .docs-toolbar { flex-wrap: wrap; }
    .docs-group-header { grid-template-columns: 1fr auto; }
    .docs-group-main { grid-column: 1 / -1; }
    .docs-group-actions { grid-column: 1 / -1; justify-content: flex-end; }
    .docs-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  }
</style>
