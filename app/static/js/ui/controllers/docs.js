// ui/controllers/docs.js — document library: upload, tags, activation, bulk actions, fuzzy filter
import { dkClient as api } from "../sdk/sdk.js";
import { bus } from "../../components.js";
import { Store } from "../store.js";
import { qs } from "../../dom.js";
import { el } from "../../ui.js";
import {
  updateProgressPopup,
  updateUploadProgressPopup,
  withProgressPopup,
} from "../popups.js";

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
  if (!hits) return 0;
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
    collapsedFolders: new Set(),
    pendingFolderPath: "",
  };

  const input = win.querySelector(`#${winId}-upload`);
  const addSourceBtn = win.querySelector(`#${winId}-choose-folder-btn`);
  const list = win.querySelector(`#${winId}-upload-list`);
  const uploadCount = win.querySelector(`#${winId}-upload-count`);
  const syncFolderStatus = win.querySelector(`#${winId}-sync-folder-status`);
  const filterInput = win.querySelector(`#${winId}-doc-filter`);
  const filterMeta = win.querySelector(`#${winId}-filter-meta`);
  const tagChipsHost = win.querySelector(`#${winId}-tag-filter-chips`);
  const tagMenu = win.querySelector(`#${winId}-tag-menu`);
  const tagMenuList = win.querySelector(`#${winId}-tag-menu-list`);
  const manageTagsBtn = win.querySelector(`#${winId}-manage-tags`);
  const addTagBtn = win.querySelector(`#${winId}-add-tag`);
  const tagDialog = document.querySelector(`#${winId}-tag-dialog`);
  const newTagInput = document.querySelector(`#${winId}-new-tag-input`);
  const newTagCancel = document.querySelector(`#${winId}-new-tag-cancel`);
  const newTagSave = document.querySelector(`#${winId}-new-tag-save`);
  const listHost = win.querySelector(`#${winId}-doc_list`);
  const bulkBar = win.querySelector(`#${winId}-bulk-bar`);
  const bulkLabel = win.querySelector(`#${winId}-bulk-label`);
  const ctxMenu = win.querySelector(`#${winId}-ctx-menu`);

  const mockPickerOverlay = document.querySelector(`#${winId}-mock-picker-overlay`);
  const mockPickerPanel = document.querySelector(`#${winId}-mock-picker-panel`);
  const mockPickerClose = document.querySelector(`#${winId}-mock-picker-close`);
  const mockPickerPath = document.querySelector(`#${winId}-mock-picker-path`);
  const mockPickerChooseFiles = document.querySelector(`#${winId}-mock-picker-choose-files`);
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

  function isPdfFileName(name) {
    return String(name || "").toLowerCase().endsWith(".pdf");
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

  function normalizeTagInput(value) {
    return String(value || "").trim().replace(/^#/, "").toLowerCase();
  }

  function renderTagChips() {
    if (!tagChipsHost) return;
    tagChipsHost.innerHTML = "";
    for (const t of state.toolbarTagKeys) {
      const chip = el("button", {
        type: "button",
        class: "tag-chip selected docs-active-tag",
        "data-tag": t,
        title: "Remove active tag filter",
      }, [
        el("span", {}, [`#${t}`]),
        el("span", { class: "tag-chip-x", "aria-hidden": "true" }, ["x"]),
      ]);
      chip.addEventListener("click", () => {
        state.toolbarTagKeys.delete(t);
        renderTagChips();
        renderDocList();
      });
      tagChipsHost.appendChild(chip);
    }
    if (manageTagsBtn) {
      tagChipsHost.appendChild(manageTagsBtn);
    }
    renderTagMenu();
  }

  function renderTagMenu() {
    if (!tagMenuList) return;
    tagMenuList.innerHTML = "";
    for (const t of state.approvedTags) {
      const row = el("div", { class: "docs-tag-menu-row" });
      const tagBtn = el("button", {
        class: `tag-chip docs-active-tag docs-tag-menu-chip${state.toolbarTagKeys.has(t) ? " selected" : ""}`,
        type: "button",
        title: "Use this tag as an active filter",
      }, [
        el("span", {}, [`#${t}`]),
        el("span", { class: "tag-chip-x", "aria-hidden": "true" }, ["x"]),
      ]);
      tagBtn.addEventListener("click", () => {
        if (state.toolbarTagKeys.has(t)) state.toolbarTagKeys.delete(t);
        else state.toolbarTagKeys.add(t);
        renderTagChips();
        renderDocList();
      });

      tagBtn.querySelector(".tag-chip-x")?.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await deleteApprovedTag(t);
      });
      row.append(tagBtn);
      tagMenuList.appendChild(row);
    }
    if (!state.approvedTags.length) {
      tagMenuList.appendChild(el("div", { class: "li-subtle docs-tag-menu-empty" }, ["No tags yet."]));
    }
  }

  async function deleteApprovedTag(tag) {
    if (!confirm(`Delete #${tag} and remove it from documents?`)) return;
    const nextTags = state.approvedTags.filter((t) => t !== tag);
    const sources = state.allDocs.filter((doc) => (doc.tags || []).includes(tag)).map((doc) => doc.id);
    try {
      if (sources.length) {
        await api.corpusBulk({ sources, remove_tags: [tag] });
      }
      await api.setCorpusTags(nextTags);
      state.toolbarTagKeys.delete(tag);
      await loadTags();
      await refresh();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  function openAddTagDialog() {
    if (!tagDialog || !newTagInput) return;
    newTagInput.value = "";
    show(tagDialog);
    setTimeout(() => newTagInput.focus(), 0);
  }

  function closeAddTagDialog() {
    hide(tagDialog);
  }

  async function saveNewTag() {
    const tag = normalizeTagInput(newTagInput?.value);
    if (!tag) return;
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(tag)) {
      alert("Use letters, numbers, dashes, or underscores. Start with a letter or number.");
      return;
    }
    if (state.approvedTags.includes(tag)) {
      state.toolbarTagKeys.add(tag);
      closeAddTagDialog();
      renderTagChips();
      renderDocList();
      return;
    }
    try {
      await api.setCorpusTags([...state.approvedTags, tag]);
      closeAddTagDialog();
      await loadTags();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  function showTagPicker(title, tags = state.approvedTags) {
    if (!tags.length) {
      alert("No tags available.");
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const overlay = el("div", { class: "docs-tag-dialog", role: "dialog", "aria-modal": "true" });
      const panel = el("div", { class: "docs-tag-dialog-panel" });
      const choices = el("div", { class: "docs-tag-choice-list" });
      const done = (tag) => {
        overlay.remove();
        resolve(tag);
      };
      for (const t of tags) {
        const choice = el("button", { class: "tag-chip", type: "button" }, [`#${t}`]);
        choice.addEventListener("click", () => done(t));
        choices.appendChild(choice);
      }
      panel.append(
        el("div", { class: "docs-tag-dialog-title" }, [title]),
        choices,
        el("div", { class: "docs-tag-dialog-actions" }, [
          el("button", { class: "btn", type: "button", onclick: () => done(null) }, ["Cancel"]),
        ]),
      );
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) done(null);
      });
      overlay.appendChild(panel);
      win.appendChild(overlay);
    });
  }

  function openDocumentTagDropdown(doc, anchor) {
    document.querySelectorAll(".docs-doc-tag-dropdown").forEach((menu) => menu.remove());
    const menu = el("div", { class: "docs-tag-menu docs-doc-tag-dropdown" });
    const list = el("div", { class: "docs-tag-menu-list" });
    const current = new Set(doc.tags || []);

    const close = () => menu.remove();
    const applyTags = async (nextTags) => {
      try {
        await api.patchCorpusDocument({ source: doc.id, tags: [...nextTags].sort() });
        close();
        await refresh();
      } catch (e) {
        alert(e.message || String(e));
      }
    };

    for (const tag of state.approvedTags) {
      const row = el("div", { class: "docs-tag-menu-row" });
      const isSelected = current.has(tag);
      const chip = el("button", {
        class: `tag-chip docs-active-tag docs-tag-menu-chip${isSelected ? " selected" : ""}`,
        type: "button",
        title: isSelected ? "Remove tag from this file" : "Add tag to this file",
      }, [
        el("span", {}, [`#${tag}`]),
        el("span", { class: "tag-chip-x", "aria-hidden": "true" }, ["x"]),
      ]);
      chip.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const next = new Set(current);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        await applyTags(next);
      });
      row.appendChild(chip);
      list.appendChild(row);
    }

    if (!state.approvedTags.length) {
      list.appendChild(el("div", { class: "li-subtle docs-tag-menu-empty" }, ["No tags yet."]));
    }

    menu.append(
      el("div", { class: "docs-tag-menu-title" }, ["Tags"]),
      list,
    );

    const rect = anchor.getBoundingClientRect();
    const width = 180;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - width - 8)}px`;
    menu.style.top = `${rect.bottom + 6}px`;

    menu.addEventListener("click", (ev) => ev.stopPropagation());
    document.body.appendChild(menu);
    setTimeout(() => {
      const closeOnOutsideClick = () => {
        close();
        document.removeEventListener("click", closeOnOutsideClick);
      };
      document.addEventListener("click", closeOnOutsideClick);
    }, 0);
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
      const tagBadge = el("button", {
        class: "tag-chip selected docs-active-tag docs-doc-tag-remove",
        type: "button",
        title: `Remove #${t}`,
      }, [
        el("span", {}, [`#${t}`]),
        el("span", { class: "tag-chip-x docs-doc-tag-x", "aria-hidden": "true" }, ["x"]),
      ]);
      tagBadge.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        try {
          await api.corpusBulk({ sources: [doc.id], remove_tags: [t] });
          await refresh();
        } catch (e) {
          alert(e.message || String(e));
        }
      });
      tagRow.appendChild(tagBadge);
    }
    const addFileTagBtn = el("button", {
      class: "tag-chip selected docs-active-tag docs-file-add-tag",
      type: "button",
      title: "Manage tags on this file",
    }, ["+"]);
    addFileTagBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openDocumentTagDropdown(doc, addFileTagBtn);
    });
    tagRow.appendChild(addFileTagBtn);
    mid.append(title, tagRow, meta);

    const actions = el("div", { class: "li-actions" });
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
    const remBtn = el("button", { class: "btn btn-danger", type: "button" }, ["Remove document"]);
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
    actions.append(toggleBtn, remBtn);

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
    await withProgressPopup("Synchronizing files...", async () => {
      try {
        const started = await api.startFolderSync(path, false);
        const data = await pollProgress(started.job_id);

        const sync = data?.sync || data || {};

        if (syncFolderStatus) {
          const added = sync?.added?.length || 0;
          const updated = sync?.updated?.length || 0;
          const removed = sync?.removed?.length || 0;
          const skipped = sync?.skipped?.length || 0;
          syncFolderStatus.textContent = `Synced folder: ${added} added, ${updated} updated, ${removed} removed, ${skipped} skipped`;
        }

        await loadFolders();
        await loadTags();
        await refresh();
      } catch (e) {
        alert("Folder synchronization failed: " + (e.message || String(e)));
      }
    });
  }


  function createDocGroup({
    key,
    label,
    subtitle,
    docIds,
    docsById,
    visibleIds,
    visibleOrder,
    forceExpanded = false,
    actions = [],
  }) {
    const groupDocIds = docIds.filter((id) => docsById.has(id));
    const visibleDocIds = groupDocIds
      .filter((id) => visibleIds.has(id))
      .sort((a, b) => (visibleOrder.get(a) ?? 0) - (visibleOrder.get(b) ?? 0));
    if (!visibleDocIds.length) return null;

    const section = el("div", { class: "docs-folder-group" });
    const header = el("div", { class: "docs-folder-header" });
    const allSelected = groupDocIds.length > 0 && groupDocIds.every((id) => state.selectedIds.has(id));
    const anySelected = groupDocIds.some((id) => state.selectedIds.has(id));
    const selectBox = el("input", { type: "checkbox", class: "docs-row-cb", title: "Select every document in this group" });
    selectBox.checked = allSelected;
    selectBox.indeterminate = !allSelected && anySelected;
    selectBox.addEventListener("click", (ev) => ev.stopPropagation());
    selectBox.addEventListener("change", () => {
      for (const id of groupDocIds) {
        if (selectBox.checked) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
      }
      updateBulkBar();
      renderDocList();
    });

    const isCollapsed = !forceExpanded && state.collapsedFolders.has(key);
    const collapseBtn = el("button", {
      class: `btn btn-icon docs-folder-toggle${isCollapsed ? "" : " expanded"}`,
      type: "button",
      title: isCollapsed ? "Expand group" : "Collapse group",
      "aria-expanded": String(!isCollapsed),
    }, ["▶"]);
    collapseBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (state.collapsedFolders.has(key)) state.collapsedFolders.delete(key);
      else state.collapsedFolders.add(key);
      renderDocList();
    });

    const title = el("div", { class: "docs-folder-title" });
    title.append(
      el("div", { class: "li-title", title: subtitle }, [label]),
      el("div", { class: "li-subtle", title: subtitle }, [subtitle])
    );

    const actionHost = el("div", { class: "docs-folder-actions" });
    actionHost.append(...actions);

    header.append(selectBox, title, actionHost, collapseBtn);
    section.appendChild(header);

    if (isCollapsed) {
      section.classList.add("collapsed");
      return section;
    }

    const childList = el("div", { class: "docs-folder-docs" });
    for (const id of visibleDocIds) {
      const row = createDocRow(docsById.get(id));
      row.classList.add("docs-folder-file-row");
      childList.appendChild(row);
    }
    section.appendChild(childList);
    return section;
  }

  function createFolderGroup(group, docsById, visibleIds, visibleOrder, forceExpanded, groupedIds) {
    const groupDocIds = (group.documents || []).map((doc) => doc.source_name).filter((id) => docsById.has(id));
    for (const id of groupDocIds) groupedIds.add(id);

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

    return createDocGroup({
      key: `folder:${group.path}`,
      label: shortFolderName(group.path),
      subtitle: `${groupDocIds.length} document${groupDocIds.length === 1 ? "" : "s"} • ${group.path}`,
      docIds: groupDocIds,
      docsById,
      visibleIds,
      visibleOrder,
      forceExpanded,
      actions: [syncBtn, removeBtn],
    });
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
    const visibleOrder = new Map(docs.map((doc, index) => [doc.id, index]));
    const searchActive = Boolean((filterInput?.value || "").trim());
    const groupedIds = new Set();

    for (const group of state.folderGroups) {
      const groupEl = createFolderGroup(group, docsById, visibleIds, visibleOrder, searchActive, groupedIds);
      if (groupEl) listHost.appendChild(groupEl);
    }

    const individualIds = docs.filter((doc) => !groupedIds.has(doc.id)).map((doc) => doc.id);
    const individualEl = createDocGroup({
      key: "individual",
      label: "Individual files",
      subtitle: `${individualIds.length} document${individualIds.length === 1 ? "" : "s"}`,
      docIds: individualIds,
      docsById,
      visibleIds,
      visibleOrder,
      forceExpanded: searchActive,
    });
    if (individualEl) {
      listHost.appendChild(individualEl);
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

  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function pollProgress(jobId, shouldStop = () => false) {
    while (!shouldStop()) {
      const job = await api.getProgress(jobId);
      updateProgressPopup(job);

      if (job.status === "done") {
        updateProgressPopup({
          ...job,
          percent: 100,
          current: job.total,
          message: "Complete",
        });

        await sleep(350);
        return job.result;
      }

      if (job.status === "error") {
        throw new Error(job.error || job.message || "Background job failed");
      }

      await sleep(2000);
    }
    throw new Error("Progress polling stopped because upload failed.");
  }

  function fileLabel(name) {
    const rel = String(name || "");
    const parts = rel.split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 1] || rel;
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

  addSourceBtn?.addEventListener("click", () => openFolderPicker());

  input?.addEventListener("change", async () => {
    if (!list) return;
    list.innerHTML = "";
    for (const f of input.files) {
      list.appendChild(el("li", {}, [f.name]));
    }
    await uploadSelectedFiles();
  });

  // Custom file picker backed by the filesystem directory API.
  const mockPickerState = {
    currentPath: "",
    currentAbsolutePath: "",
    parentPath: null,
    selectedFilePath: "",
    selectedFileName: "",
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
    const visibleItems = items.filter((item) => item.kind === "folder" || isPdfFileName(item.name));

    if (!visibleItems.length) {
      mockPickerList.appendChild(
        el("div", { class: "mock-picker-empty" }, ["No PDF files or folders shown."])
      );
      return;
    }

    for (const item of visibleItems) {
      const icon = item.kind === "folder" ? "📁" : "📄";

      const row = el("button", {
        class: "mock-picker-row",
        type: "button",
        title: item.path,
      });
      if (item.absolute_path === mockPickerState.selectedFilePath) {
        row.classList.add("selected");
      }

      row.append(
        el("span", { class: "mock-picker-icon" }, [icon]),
        el("span", { class: "mock-picker-name" }, [item.name]),
        el("span", { class: "mock-picker-kind" }, [item.kind])
      );

      row.addEventListener("click", async () => {
        if (item.kind === "folder") {
          mockPickerState.selectedFilePath = "";
          mockPickerState.selectedFileName = "";
          await openMockPickerFolder(item.path);
        } else {
          if (!isPdfFileName(item.name)) {
            setMockPickerMessage("Only PDF files can be selected.");
            return;
          }
          mockPickerState.selectedFilePath = item.absolute_path || "";
          mockPickerState.selectedFileName = item.name || "";
          if (mockPickerSelectFolder) {
            mockPickerSelectFolder.textContent = "Embed Selected File";
          }
          setMockPickerMessage(`Selected file: ${item.name}`);
          renderMockPickerItems(items);
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
      mockPickerState.selectedFilePath = "";
      mockPickerState.selectedFileName = "";

      if (mockPickerPath) {
        mockPickerPath.textContent = `DeployableKnowledge${data.path ? `/${data.path}` : ""}`;
      }

      if (mockPickerUp) {
        mockPickerUp.disabled = mockPickerState.history.length === 0 && !mockPickerState.currentPath;
      }

      if (mockPickerSelectFolder) {
        mockPickerSelectFolder.disabled = false;
        mockPickerSelectFolder.textContent = "Select Current Folder";
      }

      renderMockPickerItems(data.items || []);
      setMockPickerMessage("Choose files or select the current folder.");
    } catch (e) {
      setMockPickerMessage(e.message || String(e));
    }
  }

  async function synchronizePickedFolder(selectedPath) {
    const registered = new Set(state.syncedFolders);
    const registerFolder = !registered.has(selectedPath);

    const started = await api.startFolderSync(selectedPath, registerFolder);
    const data = await pollProgress(started.job_id);

    state.pendingFolderPath = "";
    await loadFolders();
    await loadTags();
    await refresh();
    renderSyncResult(data);
  }

  async function selectMockPickerFolder() {
    if (mockPickerState.selectedFilePath) {
      await embedSelectedPickerFile();
      return;
    }

    const selectedPath = mockPickerState.currentAbsolutePath;
    if (!selectedPath) {
      setMockPickerMessage("No folder selected.");
      return;
    }

    if (syncFolderStatus) {
      syncFolderStatus.textContent = "Synchronizing folder...";
    }
    setMockPickerMessage(`Synchronizing folder: ${selectedPath}`);

    if (mockPickerSelectFolder) {
      mockPickerSelectFolder.disabled = true;
      mockPickerSelectFolder.textContent = "Synchronizing...";
    }

    try {
      await withProgressPopup("Synchronizing and embedding files...", async() => {
        await synchronizePickedFolder(selectedPath);
      });

      setMockPickerMessage(`Synchronized folder: ${selectedPath}`);
      mockPickerOverlay?.classList.add("hidden");
    } catch (e) {
      if (syncFolderStatus) syncFolderStatus.textContent = "Folder synchronization failed.";
      setMockPickerMessage(e.message || String(e));
      alert("Folder synchronization failed: " + (e.message || String(e)));
    } finally {
      if (mockPickerSelectFolder) {
        mockPickerSelectFolder.disabled = false;
        mockPickerSelectFolder.textContent = "Select Current Folder";
      }
    }
  }

  async function openFolderPicker() {
    mockPickerState.history = [];
    mockPickerState.selectedFilePath = "";
    mockPickerState.selectedFileName = "";
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
    mockPickerState.selectedFilePath = "";
    mockPickerState.selectedFileName = "";

    if (!previous) {
      await openMockPickerFolder("", false);
      return;
    }

    await openMockPickerFolder(previous.path || "", false);
  });

  mockPickerSelectFolder?.addEventListener("click", async () => {
    await selectMockPickerFolder();
  });

  mockPickerChooseFiles?.addEventListener("click", () => input?.click());

  async function embedSelectedPickerFile() {
    const selectedPath = mockPickerState.selectedFilePath;
    if (!selectedPath) return;

    if (syncFolderStatus) {
      syncFolderStatus.textContent = "Embedding selected file...";
    }
    setMockPickerMessage(`Embedding file: ${mockPickerState.selectedFileName || selectedPath}`);

    if (mockPickerSelectFolder) {
      mockPickerSelectFolder.disabled = true;
      mockPickerSelectFolder.textContent = "Embedding...";
    }

    try {
      await withProgressPopup("Embedding selected file...", async () => {
        const started = await api.startLocalFileUpload(selectedPath);
        const data = await pollProgress(started.job_id);
        const failed = data?.uploads?.filter((item) => item.status === "error") || [];
        if (failed.length) {
          const details = failed
            .map((item) => `${item.filename}: ${item.message || "Unknown error"}`)
            .join("\n");
          throw new Error(details);
        }
        await loadTags();
        await refresh();
      });
      if (syncFolderStatus) syncFolderStatus.textContent = "Selected file embedded.";
      mockPickerOverlay?.classList.add("hidden");
    } catch (e) {
      if (syncFolderStatus) syncFolderStatus.textContent = "Selected file embedding failed.";
      setMockPickerMessage(e.message || String(e));
      alert("File embedding failed: " + (e.message || String(e)));
    } finally {
      mockPickerState.selectedFilePath = "";
      mockPickerState.selectedFileName = "";
      if (mockPickerSelectFolder) {
        mockPickerSelectFolder.disabled = false;
        mockPickerSelectFolder.textContent = "Select Current Folder";
      }
    }
  }

  async function uploadSelectedFiles() {
    if (!input?.files?.length) return;

    const selectedFiles = Array.from(input.files);
    const nonPdfFiles = selectedFiles.filter((file) => !isPdfFileName(file.name));
    if (nonPdfFiles.length) {
      alert("Only PDF files can be added from the document library picker.");
      input.value = "";
      if (list) list.innerHTML = "";
      return;
    }

    if (mockPickerChooseFiles) {
      mockPickerChooseFiles.disabled = true;
      mockPickerChooseFiles.textContent = "Embedding...";
    }

    try {
      await withProgressPopup("Uploading and embedding files...", async () => {
        const started = await api.startUploadJob();
        const jobId = started.job_id;

        await api.uploadDocumentsWithProgress(selectedFiles, jobId, {
          onUploadProgress({ current, total }) {
            updateUploadProgressPopup({
              label: "Uploading",
              current,
              total,
              message: "Uploading selected files",
            });
          },
        });

        const data = await pollProgress(jobId);

        const failed = data?.uploads?.filter((item) => item.status === "error") || [];

        if (failed.length) {
          const details = failed
            .map((item) => `${item.filename}: ${item.message || "Unknown error"}`)
            .join("\n");

          throw new Error(details);
        }

        input.value = "";

        if (list) {
          list.innerHTML = "";
        }

        updateUploadCount();
        await loadTags();
        await refresh();
        mockPickerOverlay?.classList.add("hidden");

        return data;
      });
    } catch (e) {
      alert("Upload failed: " + (e.message || String(e)));
    } finally {
      if (mockPickerChooseFiles) {
        mockPickerChooseFiles.disabled = false;
        mockPickerChooseFiles.textContent = "Choose Files";
      }
    }
  }

  filterInput?.addEventListener("input", () => renderDocList());

  manageTagsBtn?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const wasHidden = tagMenu?.classList.contains("hidden");
    if (wasHidden) show(tagMenu);
    else hide(tagMenu);
    manageTagsBtn.setAttribute("aria-expanded", String(Boolean(wasHidden)));
  });

  tagMenu?.addEventListener("click", (ev) => ev.stopPropagation());
  document.addEventListener("click", () => {
    hide(tagMenu);
    manageTagsBtn?.setAttribute("aria-expanded", "false");
  });
  addTagBtn?.addEventListener("click", openAddTagDialog);
  newTagCancel?.addEventListener("click", closeAddTagDialog);
  newTagSave?.addEventListener("click", saveNewTag);
  newTagInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") saveNewTag();
    if (ev.key === "Escape") closeAddTagDialog();
  });
  tagDialog?.addEventListener("click", (ev) => {
    if (ev.target === tagDialog) closeAddTagDialog();
  });

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

  win.querySelector(`#${winId}-deactivate-all`)?.addEventListener("click", async () => {
    if (!confirm("Deactivate every document for RAG? No document chunks will be retrieved until you activate some again.")) return;
    try {
      await api.deactivateAllCorpus();
      await refresh();
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
    return showTagPicker(title);
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
