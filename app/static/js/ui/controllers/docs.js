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
  };

  const input = win.querySelector(`#${winId}-upload`);
  const choose = win.querySelector(`#${winId}-choose-btn`);
  const list = win.querySelector(`#${winId}-upload-list`);
  const btn = win.querySelector(`#${winId}-upload-btn`);
  const uploadCount = win.querySelector(`#${winId}-upload-count`);
  const filterInput = win.querySelector(`#${winId}-doc-filter`);
  const filterMeta = win.querySelector(`#${winId}-filter-meta`);
  const tagChipsHost = win.querySelector(`#${winId}-tag-filter-chips`);
  const listHost = win.querySelector(`#${winId}-doc_list`);
  const bulkBar = win.querySelector(`#${winId}-bulk-bar`);
  const bulkLabel = win.querySelector(`#${winId}-bulk-label`);
  const ctxMenu = win.querySelector(`#${winId}-ctx-menu`);

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

  function renderDocList() {
    if (!listHost) return;
    const docs = filteredDocs();
    if (filterMeta) {
      filterMeta.textContent = `${docs.length} shown / ${state.allDocs.length} total`;
    }

    listHost.innerHTML = "";
    for (const doc of docs) {
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

      listHost.appendChild(row);
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

  choose?.addEventListener("click", () => input?.click());

  input?.addEventListener("change", () => {
    if (!list) return;
    list.innerHTML = "";
    for (const f of input.files) {
      list.appendChild(el("li", {}, [f.name]));
    }
    updateUploadCount();
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
  await refresh();
  updateUploadCount();
  setMode("all");
}
