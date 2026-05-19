// ui/controllers/docs.js — document library: upload, tags, activation, bulk actions, fuzzy filter
import { dkClient as api } from "../sdk/sdk.js";
import { bus } from "../../components.js";
import { Store } from "../store.js";
import { qs } from "../../dom.js";
import { el } from "../../ui.js";

/** Search / RAG context: server sends similarity scores (higher = better match). */

function fuzzyDocScore(query, doc) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return 1;
  const title = String(doc.title || doc.id || "").toLowerCase();
  const tagStr = (doc.tags || []).join(" ").toLowerCase();
  const hay = `${title} ${tagStr}`;
  if (hay.includes(q)) {
    const idx = hay.indexOf(q);
    return 2 - idx / Math.max(hay.length, 1);
  }
  let qi = 0;
  for (let i = 0; i < hay.length && qi < q.length; i++) {
    if (hay[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 1.2;
  const qtok = q.split(/\s+/).filter(Boolean);
  if (!qtok.length) return 0;
  const chunks = hay.split(/[\s._\-/]+/).filter(Boolean);
  let hits = 0;
  for (const w of qtok) {
    if (chunks.some((c) => c.includes(w) || w.includes(c))) hits++;
  }
  return 0.3 + (0.6 * hits) / qtok.length;
}

function hide(elm) {
  if (elm) elm.classList.add("hidden");
}
function show(elm) {
  if (elm) elm.classList.remove("hidden");
}

export async function initDocsController(winId = "win_docs") {
  const win = qs(`#${winId}`);
  if (!win) return;

  const state = {
    allDocs: [],
    approvedTags: [],
    listMode: "all",
    selectedIds: new Set(),
    toolbarTagKeys: new Set(),
    syncedFolders: [],
    folderGroups: [],
    pendingFolderPath: "",
  };

  const input = win.querySelector(`#${winId}-upload`);
  const chooseFolder = win.querySelector(`#${winId}-choose-folder-btn`);
  const choose = win.querySelector(`#${winId}-choose-btn`);
  const syncFolderBtn = win.querySelector(`#${winId}-sync-folder-btn`);
  const list = win.querySelector(`#${winId}-upload-list`);
  const btn = win.querySelector(`#${winId}-upload-btn`);
  const uploadCount = win.querySelector(`#${winId}-upload-count`);
  const syncedFolderRegistry = win.querySelector(`#${winId}-sync-folder-registry`);
  const syncFolderStatus = win.querySelector(`#${winId}-sync-folder-status`);
  const filterInput = win.querySelector(`#${winId}-doc-filter`);
  const filterMeta = win.querySelector(`#${winId}-filter-meta`);
  const tagChipsHost = win.querySelector(`#${winId}-tag-filter-chips`);
  const listHost = win.querySelector(`#${winId}-doc_list`);
  const bulkBar = win.querySelector(`#${winId}-bulk-bar`);
  const bulkLabel = win.querySelector(`#${winId}-bulk-label`);
  const ctxMenu = win.querySelector(`#${winId}-ctx-menu`);

  const mockPickerOverlay = document.querySelector(`#${winId}-mock-picker-overlay`);
  const mockPickerPanel = document.querySelector(`#${winId}-mock-picker-panel`);
  const mockPickerClose = document.querySelector(`#${winId}-mock-picker-close`);
  const mockPickerPath = document.querySelector(`#${winId}-mock-picker-path`);
  const mockPickerUp = document.querySelector(`#${winId}-mock-picker-up`);
  const mockPickerSelectFolder = document.querySelector(`#${winId}-mock-picker-select-folder`);
  const mockPickerList = document.querySelector(`#${winId}-mock-picker-list`);
  const mockPickerSelected = document.querySelector(`#${winId}-mock-picker-selected`);
 
  

  function updateUploadCount() {
    const n = input?.files?.length || 0;
    if (uploadCount) {
      uploadCount.textContent = n === 0 ? "0 files selected" : `${n} file${n === 1 ? "" : "s"} selected`;
    }
  }

  function syncStoreInactive() {
    Store.syncInactiveFromDocs(state.allDocs);
  }

  async function loadTags() {
    try {
      const data = await api.getCorpusTags();
      state.approvedTags = data.approved_tags || [];
    } catch {
      state.approvedTags = [];
    }
    renderTagChips();
  }

  function renderTagChips() {
    if (!tagChipsHost) return;
    tagChipsHost.innerHTML = "";
    for (const t of state.approvedTags) {
      const chip = el("button", {
        type: "button",
        class: "tag-chip",
        "data-tag": t,
      }, [`#${t}`]);
      if (state.toolbarTagKeys.has(t)) chip.classList.add("selected");
      chip.addEventListener("click", () => {
        if (state.toolbarTagKeys.has(t)) state.toolbarTagKeys.delete(t);
        else state.toolbarTagKeys.add(t);
        chip.classList.toggle("selected");
        renderDocList();
      });
      tagChipsHost.appendChild(chip);
    }
    if (!state.approvedTags.length) {
      tagChipsHost.appendChild(el("span", { class: "li-subtle" }, ["No approved tags yet — use “Manage approved #tags”."]));
    }
  }

  function filteredDocs() {
    const q = (filterInput?.value || "").trim();
    let docs = [...state.allDocs];

    if (state.listMode === "active") docs = docs.filter((d) => d.active !== false);
    else if (state.listMode === "inactive") docs = docs.filter((d) => d.active === false);

    if (state.toolbarTagKeys.size) {
      docs = docs.filter((d) => {
        const have = new Set(d.tags || []);
        for (const t of state.toolbarTagKeys) {
          if (have.has(t)) return true;
        }
        return false;
      });
    }

    if (q) {
      const scored = docs.map((d) => ({ d, s: fuzzyDocScore(q, d) }));
      scored.sort((a, b) => b.s - a.s);
      docs = scored.filter((x) => x.s > 0.25).map((x) => x.d);
    }

    return docs;
  }

  function createDocRow(doc) {
    const row = el("div", { class: "list-item docs-doc-row", "data-id": doc.id });
    if (state.selectedIds.has(doc.id)) row.classList.add("selected");

    const cb = el("input", { type: "checkbox", class: "docs-row-cb" });
    cb.checked = state.selectedIds.has(doc.id);
    cb.addEventListener("click", (ev) => ev.stopPropagation());
    cb.addEventListener("change", () => {
      if (cb.checked) state.selectedIds.add(doc.id);
      else state.selectedIds.delete(doc.id);
      updateBulkBar();
      row.classList.toggle("selected", cb.checked);
    });

    const mid = el("div", { class: "docs-doc-main" });
    const title = el("div", { class: "li-title" }, [doc.title || doc.id]);
    const meta = el("div", { class: "li-meta" }, [`${doc.segments} segments`, doc.active === false ? " • inactive" : ""]);
    const tagRow = el("div", { class: "docs-doc-tags" });
    for (const t of doc.tags || []) {
      tagRow.appendChild(el("span", { class: "tag-badge" }, [`#${t}`]));
    }
    mid.append(title, tagRow, meta);

    const actions = el("div", { class: "li-actions" });
    const tagsBtn = el("button", { class: "btn", type: "button", title: "Set tags from approved list" }, ["Tags…"]);
    tagsBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!state.approvedTags.length) {
        alert("Define approved tags first (Manage approved #tags).");
        return;
      }
      const hint = `Comma-separated tags (approved: ${state.approvedTags.map((t) => "#" + t).join(", ")})\nCurrent: ${(doc.tags || []).map((t) => "#" + t).join(", ") || "(none)"}`;
      const raw = prompt(hint, (doc.tags || []).join(", "));
      if (raw == null) return;
      const want = raw.split(/[,;\n]+/).map((s) => s.trim().replace(/^#/, "").toLowerCase()).filter(Boolean);
      const approved = new Set(state.approvedTags);
      const bad = want.filter((t) => !approved.has(t));
      if (bad.length) {
        alert("Unknown or unapproved tags: " + bad.join(", "));
        return;
      }
      try {
        await api.patchCorpusDocument({ source: doc.id, tags: want });
        await refresh();
      } catch (e) {
        alert(e.message || String(e));
      }
    });
    const toggleLabel = doc.active === false ? "Activate" : "Deactivate";
    const toggleBtn = el("button", { class: "btn", type: "button" }, [toggleLabel]);
    toggleBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      try {
        await api.patchCorpusDocument({ source: doc.id, active: doc.active === false });
        await refresh();
      } catch (e) {
        alert(e.message || String(e));
      }
    });
    const remBtn = el("button", { class: "btn btn-danger", type: "button" }, ["Remove"]);
    remBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!confirm(`Remove "${doc.id}" from the library and vector store?`)) return;
      try {
        await api.removeDocument(doc.id);
        await loadFolders();
        await refresh();
      } catch (e) {
        alert(e.message || String(e));
      }
    });
    actions.append(tagsBtn, toggleBtn, remBtn);

    const left = el("div", { class: "docs-doc-left" });
    left.append(cb, mid);
    row.append(left, actions);

    row.addEventListener("click", (ev) => {
      if (ev.target === cb || ev.target.closest("button")) return;
      bus.dispatchEvent(new CustomEvent("docs:select", { detail: { id: doc.id } }));
      listHost.querySelectorAll(".list-item").forEach((r) => r.classList.remove("focus-row"));
      row.classList.add("focus-row");
    });

    row.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      if (ev.ctrlKey || ev.metaKey) {
        if (state.selectedIds.has(doc.id)) state.selectedIds.delete(doc.id);
        else state.selectedIds.add(doc.id);
      } else {
        state.selectedIds.clear();
        state.selectedIds.add(doc.id);
      }
      updateBulkBar();
      renderDocList();
      setTimeout(() => openCtxMenu(ev.clientX, ev.clientY), 0);
    });

    return row;
  }

  function shortFolderName(path) {
    return fileLabel(path) || path;
  }

  async function removeSyncedFolder(path) {
    if (!confirm(`Remove this synchronized folder and its synced documents from the library?\n${path}`)) return;
    try {
      await api.removeFolder(path, true);
      if (syncFolderStatus) syncFolderStatus.textContent = "Folder and synced documents removed.";
      await loadFolders();
      await refresh();
    } catch (e) {
      alert("Folder removal failed: " + (e.message || String(e)));
    }
  }

  async function syncSingleFolder(path) {
    try {
      const data = await api.syncFolder(path);
      const sync = data?.sync || data || {};
      if (syncFolderStatus) {
        const added = sync?.added?.length || 0;
        const removed = sync?.removed?.length || 0;
        const skipped = sync?.skipped?.length || 0;
        syncFolderStatus.textContent = `Synced folder: ${added} added, ${removed} removed, ${skipped} skipped`;
      }
      await loadFolders();
      await loadTags();
      await refresh();
    } catch (e) {
      alert("Folder synchronization failed: " + (e.message || String(e)));
    }
  }

  function createFolderGroup(group, docsById, visibleIds, groupedIds) {
    const groupDocIds = (group.documents || []).map((doc) => doc.source_name).filter((id) => docsById.has(id));
    const visibleDocIds = groupDocIds.filter((id) => visibleIds.has(id));

    for (const id of groupDocIds) groupedIds.add(id);

    const section = el("div", { class: "docs-folder-group" });
    const header = el("div", { class: "docs-folder-header" });
    const cb = el("input", { type: "checkbox", class: "docs-row-cb" });
    cb.checked = visibleDocIds.every((id) => state.selectedIds.has(id));
    cb.indeterminate = !cb.checked && visibleDocIds.some((id) => state.selectedIds.has(id));
    cb.addEventListener("change", () => {
      for (const id of visibleDocIds) {
        if (cb.checked) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
      }
      updateBulkBar();
      renderDocList();
    });

    const title = el("div", { class: "docs-folder-title" });
    title.append(
      el("div", { class: "li-title", title: group.path }, [shortFolderName(group.path)]),
      el("div", { class: "li-subtle", title: group.path }, [`${visibleDocIds.length} document${visibleDocIds.length === 1 ? "" : "s"} shown • ${group.path}`])
    );

    const actions = el("div", { class: "docs-folder-actions" });
    const syncBtn = el("button", { class: "btn", type: "button" }, ["Sync"]);
    syncBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      syncBtn.disabled = true;
      syncBtn.textContent = "Syncing...";
      await syncSingleFolder(group.path);
      syncBtn.disabled = false;
      syncBtn.textContent = "Sync";
    });

    const removeBtn = el("button", { class: "btn btn-danger", type: "button" }, ["Remove"]);
    removeBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      removeSyncedFolder(group.path);
    });
    actions.append(syncBtn, removeBtn);

    header.append(cb, title, actions);
    section.appendChild(header);

    const childList = el("div", { class: "docs-folder-docs" });
    if (visibleDocIds.length) {
      for (const id of visibleDocIds) {
        childList.appendChild(createDocRow(docsById.get(id)));
      }
    } else {
      childList.appendChild(el("div", { class: "docs-folder-empty li-subtle" }, ["No synced documents shown."]));
    }
    section.appendChild(childList);
    return section;
  }

  function renderDocList() {
    if (!listHost) return;
    const docs = filteredDocs();
    if (filterMeta) {
      filterMeta.textContent = `${docs.length} shown / ${state.allDocs.length} total`;
    }

    listHost.innerHTML = "";

    const docsById = new Map(state.allDocs.map((doc) => [doc.id, doc]));
    const visibleIds = new Set(docs.map((doc) => doc.id));
    const groupedIds = new Set();

    for (const group of state.folderGroups) {
      const groupEl = createFolderGroup(group, docsById, visibleIds, groupedIds);
      if (groupEl) listHost.appendChild(groupEl);
    }

    for (const doc of docs) {
      if (groupedIds.has(doc.id)) continue;
      listHost.appendChild(createDocRow(doc));
    }
  }

  function updateBulkBar() {
    const n = state.selectedIds.size;
    if (bulkLabel) bulkLabel.textContent = `${n} selected`;
    if (n > 0) show(bulkBar);
    else hide(bulkBar);
  }

  function openCtxMenu(x, y) {
    if (!ctxMenu) return;
    show(ctxMenu);
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
  }

  function closeCtxMenu() {
    hide(ctxMenu);
  }

  async function refresh() {
    const docs = await api.listDocuments();
    state.allDocs = Array.isArray(docs) ? docs : [];
    syncStoreInactive();
    renderDocList();
  }

  function fileLabel(name) {
    const rel = String(name || "");
    const parts = rel.split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 1] || rel;
  }

  function renderFolderRegistry() {
    if (!syncedFolderRegistry) return;

    const registered = new Set(state.syncedFolders);
    const pending = state.pendingFolderPath && !registered.has(state.pendingFolderPath)
      ? state.pendingFolderPath
      : "";
    syncedFolderRegistry.innerHTML = "";

    if (!state.syncedFolders.length && !pending) {
      syncedFolderRegistry.appendChild(el("span", { class: "li-subtle" }, ["No folders registered."]));
    }

    for (const path of state.syncedFolders) {
      const row = el("div", { class: "folder-sync-folder-row" });
      const name = el("div", { class: "li-title", title: path }, [path]);
      row.append(name);
      syncedFolderRegistry.appendChild(row);
    }

    if (pending) {
      const row = el("div", { class: "folder-sync-folder-row pending" });
      const name = el("div", { class: "li-title", title: pending }, [pending]);
      const removeBtn = el("button", { class: "btn", type: "button" }, ["Clear"]);
      removeBtn.addEventListener("click", () => {
        state.pendingFolderPath = "";
        renderFolderRegistry();
      });
      row.append(name, removeBtn);
      syncedFolderRegistry.appendChild(row);
    }
  }

  async function loadFolders() {
    try {
      const data = await api.listFolders();
      state.syncedFolders = Array.isArray(data?.folders) ? data.folders : [];
      state.folderGroups = Array.isArray(data?.groups) ? data.groups : [];
    } catch {
      state.syncedFolders = [];
      state.folderGroups = [];
    }
    renderFolderRegistry();
  }

  function renderSyncResult(data) {
    const sync = data?.sync || data || {};
    const added = Array.isArray(sync.added) ? sync.added : [];
    const updated = Array.isArray(sync.updated) ? sync.updated : [];
    const removed = Array.isArray(sync.removed) ? sync.removed : [];
    const syncSkipped = Array.isArray(sync.skipped) ? sync.skipped : [];
    const addSkipped = data?.sync && Array.isArray(data.skipped) ? data.skipped : [];
    const skipped = [...syncSkipped, ...addSkipped];
    const changed = [...added, ...updated, ...removed];
    const total = changed.length;

    if (!total && !skipped.length && (sync.message || data?.message)) {
      if (syncFolderStatus) syncFolderStatus.textContent = sync.message || data.message;
      return;
    }
    if (syncFolderStatus) {
      syncFolderStatus.textContent = `Synced: ${added.length} added, ${updated.length} updated, ${removed.length} removed, ${skipped.length} skipped`;
    }
  }

  async function syncRegisteredFolders() {
    try {
      return await api.syncFolders();
    } catch {
      return api.synchronizeFolder();
    }
  }

  choose?.addEventListener("click", () => input?.click());
  chooseFolder?.addEventListener("click", () => openFolderPicker());
  syncFolderBtn?.addEventListener("click", async () => {
    syncFolderBtn.disabled = true;
    syncFolderBtn.textContent = "Synchronizing...";
    try {
      const path = state.pendingFolderPath;
      const data = path ? await api.addFolder(path) : await syncRegisteredFolders();
      state.pendingFolderPath = "";
      await loadFolders();
      await loadTags();
      await refresh();
      renderSyncResult(data);
    } catch (e) {
      if (syncFolderStatus) syncFolderStatus.textContent = "Folder synchronization failed.";
      alert("Folder synchronization failed: " + (e.message || String(e)));
    } finally {
      syncFolderBtn.disabled = false;
      syncFolderBtn.textContent = "Synchronize";
    }
  });

  input?.addEventListener("change", () => {
    if (!list) return;
    list.innerHTML = "";
    for (const f of input.files) {
      list.appendChild(el("li", {}, [f.name]));
    }
    updateUploadCount();
  });

  // Custom file picker backed by the filesystem directory API.
  const mockPickerState = {
    currentPath: "",
    currentAbsolutePath: "",
    parentPath: null,
    history: [],
  };

  function setMockPickerMessage(message) {
    if (mockPickerSelected) {
      mockPickerSelected.textContent = message;
    }
  }

  function renderMockPickerItems(items) {
    if (!mockPickerList) return;

    mockPickerList.innerHTML = "";

    if (!items.length) {
      mockPickerList.appendChild(
        el("div", { class: "mock-picker-empty" }, ["This folder is empty."])
      );
      return;
    }

    for (const item of items) {
      const icon = item.kind === "folder" ? "📁" : "📄";

      const row = el("button", {
        class: "mock-picker-row",
        type: "button",
        title: item.path,
      });

      row.append(
        el("span", { class: "mock-picker-icon" }, [icon]),
        el("span", { class: "mock-picker-name" }, [item.name]),
        el("span", { class: "mock-picker-kind" }, [item.kind])
      );

      row.addEventListener("click", async () => {
        if (item.kind === "folder") {
          await openMockPickerFolder(item.path);
        } else {
          setMockPickerMessage("Select a folder for synchronization.");
        }
      });

      mockPickerList.appendChild(row);
    }
  }

  async function openMockPickerFolder(path, addToHistory = true) {
    const overlay = document.getElementById(`${winId}-mock-picker-overlay`);

    if (!overlay) {
      console.error(`Could not find overlay with id: ${winId}-mock-picker-overlay`);
      return;
    }

    overlay.classList.remove("hidden");

    if (addToHistory) {
      mockPickerState.history.push({
        path: mockPickerState.currentPath,
      });
    }

    try {
      const data = await api.listDirectory(path);

      mockPickerState.currentPath = data.path || "";
      mockPickerState.currentAbsolutePath = data.absolute_path || "";
      mockPickerState.parentPath = data.parent;

      if (mockPickerPath) {
        mockPickerPath.textContent = `DeployableKnowledge${data.path ? `/${data.path}` : ""}`;
      }

      if (mockPickerUp) {
        mockPickerUp.disabled = mockPickerState.history.length === 0 && !mockPickerState.currentPath;
      }

      if (mockPickerSelectFolder) {
        mockPickerSelectFolder.disabled = false;
      }

      renderMockPickerItems(data.items || []);
      setMockPickerMessage("Open a folder, then select the current folder for synchronization.");
    } catch (e) {
      setMockPickerMessage(e.message || String(e));
    }
  }

  function selectMockPickerFolder() {
    const selectedPath = mockPickerState.currentAbsolutePath;
    if (!selectedPath) {
      setMockPickerMessage("No folder selected.");
      return;
    }

    const registered = new Set(state.syncedFolders);
    state.pendingFolderPath = registered.has(selectedPath) ? "" : selectedPath;
    renderFolderRegistry();

    if (!state.pendingFolderPath && syncFolderStatus) {
      syncFolderStatus.textContent = "Folder is already registered.";
    } else if (syncFolderStatus) {
      syncFolderStatus.textContent = "Folder ready to synchronize.";
    }

    setMockPickerMessage(`Selected folder: ${selectedPath}`);
    mockPickerOverlay?.classList.add("hidden");
  }

  async function openFolderPicker() {
    mockPickerState.history = [];
    await openMockPickerFolder("", false);
  }

  mockPickerClose?.addEventListener("click", () => {
    mockPickerOverlay?.classList.add("hidden");
  });

  mockPickerOverlay?.addEventListener("click", (e) => {
    if (e.target === mockPickerOverlay) {
      mockPickerOverlay.classList.add("hidden");
    }
  });

  mockPickerUp?.addEventListener("click", async () => {
    const previous = mockPickerState.history.pop();

    if (!previous) {
      await openMockPickerFolder("", false);
      return;
    }

    await openMockPickerFolder(previous.path || "", false);
  });

  mockPickerSelectFolder?.addEventListener("click", async () => {
    selectMockPickerFolder();
  });

  btn?.addEventListener("click", async () => {
    if (!input?.files?.length) return;
    btn.disabled = true;
    btn.textContent = "Uploading…";
    try {
      await api.uploadDocuments(input.files);
      input.value = "";
      if (list) list.innerHTML = "";
      updateUploadCount();
      await loadTags();
      await refresh();
    } catch (e) {
      alert("Upload failed: " + (e.message || String(e)));
    } finally {
      btn.disabled = false;
      btn.textContent = "Upload";
    }
  });

  filterInput?.addEventListener("input", () => renderDocList());

  function setMode(mode) {
    state.listMode = mode;
    for (const m of ["all", "active", "inactive"]) {
      const b = win.querySelector(`#${winId}-mode-${m}`);
      if (b) b.classList.toggle("btn-primary", state.listMode === m);
    }
    renderDocList();
  }

  win.querySelector(`#${winId}-mode-all`)?.addEventListener("click", () => setMode("all"));
  win.querySelector(`#${winId}-mode-active`)?.addEventListener("click", () => setMode("active"));
  win.querySelector(`#${winId}-mode-inactive`)?.addEventListener("click", () => setMode("inactive"));

  win.querySelector(`#${winId}-activate-by-tags`)?.addEventListener("click", async () => {
    const tags = Array.from(state.toolbarTagKeys);
    if (!tags.length) {
      alert("Select one or more tags in the toolbar (click #chips) before activating by tag.");
      return;
    }
    if (!confirm(`Activate documents that have ALL of: ${tags.map((t) => "#" + t).join(", ")}? Other documents stay as they are (use per-row, bulk, or “Deactivate all” to turn RAG off).`)) return;
    try {
      await api.activateCorpusByTags(tags);
      await refresh();
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  win.querySelector(`#${winId}-deactivate-all`)?.addEventListener("click", async () => {
    if (!confirm("Deactivate every document for RAG? No document chunks will be retrieved until you activate some again.")) return;
    try {
      await api.deactivateAllCorpus();
      await refresh();
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  win.querySelector(`#${winId}-manage-tags`)?.addEventListener("click", async () => {
    const cur = state.approvedTags.join(", ");
    const raw = prompt(
      "Enter approved tags (comma-separated). Example: engines, structures, fuels\nThese define which #tags users may assign to documents.",
      cur
    );
    if (raw == null) return;
    const tags = raw.split(/[,;\n]+/).map((s) => s.trim().replace(/^#/, "")).filter(Boolean);
    try {
      await api.setCorpusTags(tags);
      state.toolbarTagKeys = new Set([...state.toolbarTagKeys].filter((t) => tags.includes(t)));
      await loadTags();
      renderDocList();
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  win.querySelector(`#${winId}-clear-corpus`)?.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to remove ALL documents from the RAG engine?")) return;
    if (!confirm("Are you absolutely sure you want to remove all documents? This deletes vectors and uploaded files.")) return;
    try {
      await api.clearCorpusAll();
      state.selectedIds.clear();
      await loadTags();
      await refresh();
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  async function pickTag(title) {
    if (!state.approvedTags.length) {
      alert("Define approved tags first (Manage approved #tags).");
      return null;
    }
    const s = prompt(`${title}\nAvailable: ${state.approvedTags.map((t) => "#" + t).join(", ")}`);
    if (s == null) return null;
    const t = s.trim().replace(/^#/, "").toLowerCase();
    if (!state.approvedTags.includes(t)) {
      alert("Tag must be in the approved list.");
      return null;
    }
    return t;
  }

  win.querySelector(`#${winId}-bulk-add-tag`)?.addEventListener("click", async () => {
    const tag = await pickTag("Tag to add to selected documents");
    if (!tag) return;
    try {
      await api.corpusBulk({ sources: [...state.selectedIds], add_tags: [tag] });
      await refresh();
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  win.querySelector(`#${winId}-bulk-remove-tag`)?.addEventListener("click", async () => {
    const tag = await pickTag("Tag to remove from selected documents");
    if (!tag) return;
    try {
      await api.corpusBulk({ sources: [...state.selectedIds], remove_tags: [tag] });
      await refresh();
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  win.querySelector(`#${winId}-bulk-activate`)?.addEventListener("click", async () => {
    try {
      await api.corpusBulk({ sources: [...state.selectedIds], active: true });
      await refresh();
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  win.querySelector(`#${winId}-bulk-deactivate`)?.addEventListener("click", async () => {
    try {
      await api.corpusBulk({ sources: [...state.selectedIds], active: false });
      await refresh();
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  ctxMenu?.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-act");
      closeCtxMenu();
      if (act === "add-tag") {
        const tag = await pickTag("Tag to add");
        if (!tag) return;
        try {
          await api.corpusBulk({ sources: [...state.selectedIds], add_tags: [tag] });
          await refresh();
        } catch (e) {
          alert(e.message || String(e));
        }
      } else if (act === "remove-tag") {
        const tag = await pickTag("Tag to remove");
        if (!tag) return;
        try {
          await api.corpusBulk({ sources: [...state.selectedIds], remove_tags: [tag] });
          await refresh();
        } catch (e) {
          alert(e.message || String(e));
        }
      } else if (act === "activate") {
        try {
          await api.corpusBulk({ sources: [...state.selectedIds], active: true });
          await refresh();
        } catch (e) {
          alert(e.message || String(e));
        }
      } else if (act === "deactivate") {
        try {
          await api.corpusBulk({ sources: [...state.selectedIds], active: false });
          await refresh();
        } catch (e) {
          alert(e.message || String(e));
        }
      }
    });
  });

  ctxMenu?.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => closeCtxMenu());

  await loadTags();
  await loadFolders();
  await refresh();
  updateUploadCount();
  setMode("all");
}
