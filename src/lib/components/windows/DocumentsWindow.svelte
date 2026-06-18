<script lang="ts">
  import { onMount } from "svelte";
  import TagMenu from "$lib/components/menus/TagMenu.svelte";
  import BaseWindow from "$lib/components/windows/BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import type { DirectoryItem } from '../../../routes/documents/+server.ts';
  import path from 'node:path';
  import {
    DocumentFilePickerPopup,
    DocumentProgressPopup,
    DocumentTagPickerPopup,
  } from "$lib/components/popups";
  import type { WindowInstanceProps } from "./index.ts";
    import { not } from "drizzle-orm";
    //import { json } from "node:stream/consumers";

  type Mode = "all" | "active" | "inactive";
  type Doc = {
    id: string;
    title: string;
    segments: number;
    tags: string[];
    active: boolean;
  };
  type Group = {
    key: string;
    label: string;
    subtitle: string;
    docs: Doc[];
    folderPath?: string;
  };

  type FolderGroup = {
    path: string;
    documents: { source_name: string }[];
  };

  type BulkAction = "add-tag" | "remove-tag" | "activate" | "deactivate";

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
  let docs = $state<Doc[]>([]);
  let tags = $state<string[]>([]);
  let folders = $state<string[]>([]);
  let selected = $state<string[]>([]);
  let tagFilters = $state<string[]>([]);
  let query = $state("");
  let mode = $state<Mode>("all");
  let loading = $state(false);
  let status = $state("");
  let tagMenuOpen = $state(false);
  let filePickerOpen = $state(false);
  let folderGroups = $state<FolderGroup[]>([]);
  let collector = $state<DirectoryItem[]>([]);

  let docTagMenu = $state<string | null>(null);
  let addTagOpen = $state(false);
  let newTag = $state("");

  let pickerOpen = $state(false);
  let pickerPath = $state("DeployableKnowledge");
  let pickerItems = $state<DirectoryItem[]>([]);
  let pickerRelPath = $state("");
  let pickerAbsPath = $state("");
  let pickerHistory = $state<string[]>([]);
  let pickerFilePath = $state("");
  let pickerFileName = $state("");
  let pickerMessage = $state("PDF files only.");
  let pickerBusy = $state(false);

  let progressOpen = $state(false);
  let progressTitle = $state("Working");

  let tagPickerOpen = $state(false);
  let tagPickerTitle = $state("");
  let tagPickerResolve: ((tag: string | null) => void) | null = null;

  onMount(() => {
    refresh().catch(showError);
  });

  function showError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    status = message;
    alert(message);
  }

  function normalizeDoc(row: Record<string, unknown>): Doc | null {
    const idText = String(row.id ?? row.title ?? row.source ?? "").trim();
    if (!idText) return null;

    return {
      id: idText,
      title: String(row.title || idText),
      segments: Number(row.segments ?? row.segment_count ?? 0),
      tags: (Array.isArray(row.tags) ? row.tags : []).map(String).sort(),
      active: row.active !== false,
    };
  }

  function filename(path: string) {
    return (
      String(path || "")
        .split(/[\\/]+/)
        .filter(Boolean)
        .at(-1) || path
    );
  }

  async function refresh(message = "") {
    loading = true;
    await getFiles();
    loading = false;
    // try {
    //   const [docRows, tagRows, folderRows] = await Promise.all([
    //     dkClient.listDocuments(),
    //     dkClient.getCorpusTags(),
    //     dkClient.listFolders(),
    //   ]);

    //   docs = docRows
    //     .map((row) => normalizeDoc(row as Record<string, unknown>))
    //     .filter((row): row is Doc => Boolean(row));
    //   tags = tagRows.approved_tags || [];
    //   folders = folderRows.folders || [];
    //   folderGroups = folderRows.groups || [];
    //   selected = selected.filter((docId) =>
    //     docs.some((doc) => doc.id === docId),
    //   );
    //   status = message;
    // } finally {
    //   loading = false;
    // }
  }

  function visibleDocs() {
    const q = query.trim().toLowerCase();

    return docs.filter((doc) => {
      if (mode === "active" && !doc.active) return false;
      if (mode === "inactive" && doc.active) return false;
      if (
        tagFilters.length &&
        !tagFilters.some((tag) => doc.tags.includes(tag))
      )
        return false;
      if (!q) return true;

      return `${doc.title} ${doc.id} ${doc.tags.join(" ")}`
        .toLowerCase()
        .includes(q);
    });
  }

function groups(): Group[] {
  const visible = visibleDocs();
  const visibleById = new Map(visible.map((doc) => [doc.id, doc]));
  const grouped = new Set<string>();
  const rows: Group[] = [];

  for (const folder of folderGroups) {
    const folderDocs = (folder.documents || [])
      .map((item) => item.source_name)
      .map((docId) => visibleById.get(docId))
      .filter((doc): doc is Doc => doc !== undefined);

    for (const doc of folderDocs) grouped.add(doc.id);
    if (!folderDocs.length) continue;

    rows.push({
      key: folder.path, 
      label: filename(folder.path), 
      subtitle: `${folderDocs.length} document${folderDocs.length === 1 ? "" : "s"} - ${folder.path}`,
      docs: folderDocs,
      folderPath: folder.path,
    });
  }

  const loose = visible.filter((doc) => !grouped.has(doc.id));
  if (loose.length) {
    rows.push({
      key: "individual",
      label: "Individual files",
      subtitle: `${loose.length} document${loose.length === 1 ? "" : "s"}`,
      docs: loose,
    });
  }
  return rows;
}

  function toggleInList(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  }

  function toggleFilter(tag: string) {
    tagFilters = toggleInList(tagFilters, tag);
  }

  function toggleSelected(docId: string) {
    selected = toggleInList(selected, docId);
  }

  async function saveNewTag() {
    const tag = newTag.trim().replace(/^#/, "").toLowerCase();
    if (!tag) return;

    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(tag)) {
      alert(
        "Use letters, numbers, dashes, or underscores. Start with a letter or number.",
      );
      return;
    }

    // if (!tags.includes(tag)) await dkClient.setCorpusTags([...tags, tag]);
    // newTag = "";
    // addTagOpen = false;
    await refresh();
  }

  async function deleteTag(tag: string) {
    if (!confirm(`Delete #${tag} and remove it from documents?`)) return;

    const sources = docs
      .filter((doc) => doc.tags.includes(tag))
      .map((doc) => doc.id);
    // if (sources.length)
    //   await dkClient.corpusBulk({ sources, remove_tags: [tag] });
    // await dkClient.setCorpusTags(tags.filter((item) => item !== tag));
    tagFilters = tagFilters.filter((item) => item !== tag);
    await refresh();
  }

  async function setDocTag(doc: Doc, tag: string) {
    const next = toggleInList(doc.tags, tag).sort();
    // await dkClient.patchCorpusDocument({ source: doc.id, tags: next });
    docTagMenu = null;
    await refresh();
  }

  async function removeDocTag(doc: Doc, tag: string) {
    // await dkClient.corpusBulk({ sources: [doc.id], remove_tags: [tag] });
    await refresh();
  }

  async function toggleActive(doc: Doc) {
    // await dkClient.patchCorpusDocument({ source: doc.id, active: !doc.active });
    await refresh();
  }

  async function removeDoc(doc: Doc) {
    if (!confirm(`Remove "${doc.id}" from the library and vector store?`))
      return;
    // await dkClient.removeDocument(doc.id);
    await refresh("Document removed.");
  }

  function chooseTag(titleText: string) {
    if (!tags.length) {
      alert("No tags available.");
      return Promise.resolve(null);
    }

    tagPickerTitle = titleText;
    tagPickerOpen = true;
    return new Promise<string | null>((resolve) => {
      tagPickerResolve = resolve;
    });
  }

  function closeTagPicker(tag: string | null) {
    const resolve = tagPickerResolve;
    tagPickerResolve = null;
    tagPickerOpen = false;
    resolve?.(tag);
  }

  async function applyBulk(action: BulkAction) {
    if (!selected.length) return;

    // if (action === "add-tag") {
    //   const tag = await chooseTag("Tag to add");
    //   if (tag)
    //     await dkClient.corpusBulk({ sources: selected, add_tags: [tag] });
    // } else if (action === "remove-tag") {
    //   const tag = await chooseTag("Tag to remove");
    //   if (tag)
    //     await dkClient.corpusBulk({ sources: selected, remove_tags: [tag] });
    // } else {
    //   await dkClient.corpusBulk({
    //     sources: selected,
    //     active: action === "activate",
    //   });
    // }

    await refresh();
  }

  async function clearCorpus() {
    if (!confirm("Remove all documents from the RAG engine?")) return;
    console.log("Not implemented");
    // await dkClient.clearCorpusAll();
    // selected = [];
    // await refresh("Corpus cleared.");
  }

  async function withProgress<T>(titleText: string, work: () => Promise<T>) {
    progressTitle = titleText;
    // progress = {
    //   label: "Starting",
    //   message: titleText,
    //   current: 0,
    //   total: 0,
    //   percent: 0,
    // };
    progressOpen = true;
    try {
      return await work();
    } finally {
      progressOpen = false;
    }
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function poll(jobId: string) {
    // while (true) {
    //   const job = await dkClient.getProgress(jobId);
    //   progress = job;
    //   if (job.status === "done")
    //     return job.result as Record<string, unknown> | undefined;
    //   if (job.status === "error")
    //     throw new Error(job.error || job.message || "Job failed");
    //   await sleep(1800);
    // }
  }

  function failedUploads(data: Record<string, unknown> | undefined) {
    const uploads = Array.isArray(data?.uploads) ? data.uploads : [];
    return uploads.filter(
      (item): item is { filename?: string; message?: string; status: string } =>
        typeof item === "object" &&
        item !== null &&
        "status" in item &&
        item.status === "error",
    );
  }

  async function makeEmbeddingCall(abspath: string) {
    const req = new Request(`/documents?path=${encodeURIComponent(abspath)}`, {
      method: "POST",
    });
    const resp = await fetch(req);
  }

  async function uploadFiles(pickerAbsPath: String, pickerFilePath: string) {
    const files = Array.from(fileInput?.files || []);
    //if (!files.length) return;

    // if (files.some((file) => !file.name.toLowerCase().endsWith(".pdf"))) {
    //   alert("Only PDF files can be added.");
    //   if (fileInput) fileInput.value = "";
    //   return;
    // }

    try {
      await makeEmbeddingCall(pickerFilePath);
      if (fileInput) fileInput.value = "";
      pickerOpen = false;
      await refresh("Files uploaded and embedded.");
    } catch (error) {
      showError(error);
    }
  }

  async function openPicker() {
    pickerHistory = [];
    pickerFilePath = "";
    pickerFileName = "";
    await openDirectory("", false);
  }

  async function openDirectory(path: string, addHistory = true) {
    pickerOpen = true;
    if (addHistory) pickerHistory = [...pickerHistory, pickerRelPath];

    try {
      const data = await getFiles(path);
      pickerRelPath = path;
      pickerAbsPath = path;
      pickerPath = `DeployableKnowledge${path ? `/${path}` : ""}`;
      pickerItems = data;
      pickerFilePath = "";
      pickerFileName = "";
      pickerMessage = "Choose files or select the current folder.";
    } catch (error) {
      pickerMessage = error instanceof Error ? error.message : String(error);
    }
  }

  async function notImplemented() {
    console.log("Not implemented");
  }

  async function getFiles(url: String = `/`) {
    const req = new Request(`/documents` + url, {
      method: "GET",
    });

    const resp = await fetch(req);
    const data = (await resp.json()) as DirectoryItem[];

    return data
  }

  async function selectPickerTarget() {
    if (!pickerAbsPath && !pickerFilePath) return;

    pickerBusy = true;

    try {
      if (pickerFilePath) {
        await withProgress("Embedding selected file...", async () => {
          const job = await uploadFiles(pickerAbsPath, pickerFilePath);
          //const result = await poll(job.job_id);
          //const failed = failedUploads(result);
          // if (failed.length)
          //   throw new Error(
          //     failed.map((item) => item.message || item.filename).join("\n"),
          //   );
        });
        await refresh("Selected file embedded.");
      // } else {
      //   await syncFolder(pickerAbsPath, !folders.includes(pickerAbsPath));
      }
      pickerOpen = false;
    } catch (error) {
      showError(error);
    } finally {
      pickerBusy = false;
    }
  }

    function selectPickerFile(item: DirectoryItem) {
    if (!item.name.toLowerCase().endsWith(".pdf")) {
      pickerMessage = "Only PDF files can be selected.";
      return;
    }
    pickerFilePath = item.absolute_path;
    pickerFileName = item.name;
    pickerMessage = `Selected file: ${item.name}`;
  }

  async function pickerBack() {
    const previous = pickerHistory.at(-1) || "";
    pickerHistory = pickerHistory.slice(0, -1);
    await openDirectory(previous, false);
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
  contentLabel="Document library"
>
  <div class="document-library">
    <div class="panel-toolbar">
      <div class="document-filter-row">
        <input
          class="input"
          type="text"
          placeholder="Filter library by name or tags..."
          bind:value={query}
        />
        <span class="li-subtle">{visibleDocs().length} / {docs.length}</span>
      </div>

      <div class="tag-row">
        {#each tagFilters as tag}
          <button
            class="tag-chip selected"
            type="button"
            onclick={() => toggleFilter(tag)}
          >
            <span>#{tag}</span>
            <span class="tag-chip-x" aria-hidden="true">
              <Icon name="close" size={12} />
            </span>
          </button>
        {/each}

        <div class="document-tag-wrap">
          <button
            class="tag-chip"
            type="button"
            title="Add tag filter"
            aria-label="Add tag filter"
            onclick={() => (tagMenuOpen = !tagMenuOpen)}
          >
            <Icon name="local_offer" size={14} />
          </button>
          {#if tagMenuOpen}
            <TagMenu
              {tags}
              selected={tagFilters}
              onToggle={toggleFilter}
              onRemove={deleteTag}
              onAdd={() => (addTagOpen = true)}
            />
          {/if}
        </div>
      </div>

      <div class="toolbar">
        <button
          class:btn-primary={mode === "all"}
          class="btn"
          type="button"
          onclick={() => (mode = "all")}
        >
          All
        </button>
        <button
          class:btn-primary={mode === "active"}
          class="btn"
          type="button"
          onclick={() => (mode = "active")}
        >
          Active
        </button>
        <button
          class:btn-primary={mode === "inactive"}
          class="btn"
          type="button"
          onclick={() => (mode = "inactive")}
        >
          Inactive
        </button>
        <button
          class="btn"
          type="button"
          onclick={() => notImplemented}
        >
          Deactivate all
        </button>
        <button class="btn btn-danger" type="button" onclick={clearCorpus}
          >Remove all</button
        >
      </div>
    </div>

    {#if selected.length}
      <div class="bulk-bar">
        <span class="li-subtle">{selected.length} selected</span>
        <button class="btn" type="button" onclick={() => applyBulk("add-tag")}
          >Apply tag</button
        >
        <button
          class="btn"
          type="button"
          onclick={() => applyBulk("remove-tag")}>Remove tag</button
        >
        <button class="btn" type="button" onclick={() => applyBulk("activate")}
          >Activate</button
        >
        <button
          class="btn"
          type="button"
          onclick={() => applyBulk("deactivate")}>Deactivate</button
        >
      </div>
    {/if}

    <div class="document-groups">
      {#if loading}
        <div class="list-item empty-state">Loading documents...</div>
      {:else if !groups().length}
        <div class="list-item empty-state">
          No documents match the current filters.
        </div>
      {:else}
        {#each groups() as group}
          <section class="document-group">
            <header class="document-group-head">
              <div>
                <div class="li-title">{group.label}</div>
                <div class="li-subtle">{group.subtitle}</div>
              </div>
              {#if group.folderPath}
                <div class="li-actions">
                  <button
                    class="btn"
                    type="button"
                    onclick={() => notImplemented()}
                  >
                    Sync
                  </button>
                  <button
                    class="btn btn-danger"
                    type="button"
                    onclick={() => notImplemented()}
                  >
                    Remove
                  </button>
                </div>
              {/if}
            </header>

            <div class="list">
              {#each group.docs as doc}
                <div
                  class:selected={selected.includes(doc.id)}
                  class="list-item document-row"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(doc.id)}
                    onchange={() => toggleSelected(doc.id)}
                  />
                  <div class="document-main">
                    <div class="li-title">{doc.title}</div>
                    <div class="tag-row">
                      {#each doc.tags as tag}
                        <button
                          class="tag-chip selected"
                          type="button"
                          onclick={() => removeDocTag(doc, tag)}
                        >
                          <span>#{tag}</span>
                          <span class="tag-chip-x" aria-hidden="true">
                            <Icon name="close" size={12} />
                          </span>
                        </button>
                      {/each}

                      <div class="document-tag-wrap">
                        <button
                          class="tag-chip"
                          type="button"
                          title="Edit document tags"
                          aria-label="Edit document tags"
                          onclick={() =>
                            (docTagMenu =
                              docTagMenu === doc.id ? null : doc.id)}
                        >
                          <Icon name="local_offer" size={14} />
                        </button>
                        {#if docTagMenu === doc.id}
                          <TagMenu
                            {tags}
                            selected={doc.tags}
                            onToggle={(tag) => setDocTag(doc, tag)}
                          />
                        {/if}
                      </div>
                    </div>
                    <div class="li-meta">
                      {doc.segments} segments{doc.active ? "" : " - inactive"}
                    </div>
                  </div>
                  <div class="li-actions">
                    <button
                      class="btn"
                      type="button"
                      onclick={() => toggleActive(doc)}
                    >
                      {doc.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      class="btn btn-danger"
                      type="button"
                      onclick={() => removeDoc(doc)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </section>
        {/each}
      {/if}
    </div>

    <div class="document-add">
      <button class="btn" type="button" onclick={openPicker}
        >Add document or folder</button
      >
      <div class="status-line">{status}</div>
      <input
        bind:this={fileInput}
        type="file"
        multiple
        accept="application/pdf,.pdf"
        onchange={uploadFiles}
      />
    </div>
  </div>
</BaseWindow>

{#if addTagOpen}
  <div class="docs-tag-dialog" role="dialog" aria-modal="true">
    <div class="docs-tag-dialog-panel">
      <div class="tag-menu-title">Add Tag</div>
      <input
        class="input"
        type="text"
        placeholder="tag name"
        bind:value={newTag}
        onkeydown={(event) => {
          if (event.key === "Enter") saveNewTag();
          if (event.key === "Escape") addTagOpen = false;
        }}
      />
      <div class="li-actions">
        <button class="btn" type="button" onclick={() => (addTagOpen = false)}
          >Cancel</button
        >
        <button class="btn btn-primary" type="button" onclick={saveNewTag}
          >Add</button
        >
      </div>
    </div>
  </div>
{/if}

<DocumentFilePickerPopup
  open={pickerOpen}
  items={pickerItems}
  pathLabel={pickerPath}
  selectedFilePath={pickerFilePath}
  message={pickerMessage}
  busy={pickerBusy}
  canGoBack={Boolean(pickerHistory.length || pickerRelPath)}
  onClose={() => (pickerOpen = false, loading = false)}
  onBack={notImplemented}
  onSelectCurrent={selectPickerTarget}
  onOpenFolder={(path) => openDirectory(path)}
  onSelectFile={selectPickerFile}
/>

<DocumentTagPickerPopup
  open={tagPickerOpen}
  title={tagPickerTitle}
  {tags}
  onSelect={(tag) => closeTagPicker(tag)}
  onClose={() => closeTagPicker(null)}
/>

<DocumentProgressPopup open={progressOpen} title={progressTitle} />
