import { el } from "../ui.js";

export function render(config, winId) {
  const layout = el("div", { class: "form docs-window" });
  const id = config.id || winId;

  const upWrap = el("div", { class: "row" });
  const upInput = el("input", { type: "file", multiple: true, id: `${id}-upload`, style: { display: "none" } });
  const chooseFolderBtn = el("button", { class: "btn", type: "button", id: `${id}-choose-folder-btn` }, ["Choose Folder"]);
  const syncInfoBtn = el("button", { class: "btn btn-icon", type: "button", id: `${id}-sync-info-btn`, title: "Folder synchronization info" }, ["?"]);
  const syncFolderStatus = el("div", { class: "folder-sync-status", id: `${id}-sync-folder-status` });
  const syncSection = el("div", { class: "folder-sync-section" });
  const syncLabel = el("div", { class: "folder-sync-label" });
  syncLabel.append(el("label", {}, ["Synchronize Folder"]), syncInfoBtn);
  const syncControls = el("div", { class: "docs-sync-row" });
  syncControls.append(chooseFolderBtn);
  syncSection.append(syncLabel, syncControls, syncFolderStatus);

  const chooseBtn = el("button", { class: "btn", type: "button", id: `${id}-choose-btn` }, ["Choose Files"]);
  const upBtn = el("button", { class: "btn", type: "button", id: `${id}-upload-btn` }, ["Upload"]);
  const uploadCount = el("span", { class: "li-subtle", id: `${id}-upload-count` }, ["0 files selected"]);
  const uploadControls = el("div", { class: "docs-upload-controls" });
  uploadControls.append(chooseBtn, upBtn, uploadCount);
  upWrap.append(syncSection, el("label", {}, ["Upload Documents"]), uploadControls, upInput);
  const fileList = el("ul", { class: "upload-list", id: `${id}-upload-list` });
  layout.append(upWrap, fileList);
  const pickerPanel = el("div", {
    class: "mock-picker",
    id: `${id}-mock-picker-panel`,
  });

  const pickerTop = el("div", { class: "mock-picker-top" });

  const pickerPath = el("div", {
    class: "mock-picker-path",
    id: `${id}-mock-picker-path`,
  }, ["No folder open"]);

  const pickerClose = el("button", {
    class: "btn",
    type: "button",
    id: `${id}-mock-picker-close`,
  }, ["Close"]);

  pickerTop.append(pickerPath, pickerClose);

  const pickerActions = el("div", { class: "mock-picker-actions" });

  const pickerUp = el("button", {
    class: "btn",
    type: "button",
    id: `${id}-mock-picker-up`,
  }, ["Back"]);

  const pickerSelectFolder = el("button", {
    class: "btn",
    type: "button",
    id: `${id}-mock-picker-select-folder`,
  }, ["Select Current Folder"]);

  pickerActions.append(pickerUp, pickerSelectFolder);

  const pickerList = el("div", {
    class: "mock-picker-list",
    id: `${id}-mock-picker-list`,
  });

  const pickerSelected = el("div", {
    class: "mock-picker-selected",
    id: `${id}-mock-picker-selected`,
  }, ["Selected path will appear here."]);

  pickerPanel.append(pickerTop, pickerActions, pickerList, pickerSelected);

  const pickerOverlay = el("div", {
    class: "mock-picker-overlay hidden",
    id: `${id}-mock-picker-overlay`,
  });

  const pickerModal = el("div", {
    class: "mock-picker-modal",
  });

  pickerModal.append(pickerPanel);
  pickerOverlay.append(pickerModal);

  document.body.appendChild(pickerOverlay);

  const toolbar = el("div", { class: "docs-toolbar" });
  const filterRow = el("div", { class: "docs-toolbar-row" });
  const filterInput = el("input", {
    type: "text",
    class: "input",
    id: `${id}-doc-filter`,
    placeholder: "Filter library (fuzzy match on name & tags)…",
  });
  const filterMeta = el("span", { class: "li-subtle", id: `${id}-filter-meta` });
  filterRow.append(el("label", {}, ["Document filter"]), filterInput, filterMeta);

  const tagFilterLabel = el("label", {}, ["Filter by approved tags"]);
  const tagChips = el("div", { class: "docs-tag-chips", id: `${id}-tag-filter-chips` });
  const modeRow = el("div", { class: "docs-toolbar-row docs-mode-row" });
  const btnAll = el("button", { class: "btn", type: "button", id: `${id}-mode-all` }, ["All"]);
  const btnAct = el("button", { class: "btn", type: "button", id: `${id}-mode-active` }, ["Active in RAG"]);
  const btnInact = el("button", { class: "btn", type: "button", id: `${id}-mode-inactive` }, ["Inactive in RAG"]);
  modeRow.append(el("span", { class: "li-subtle" }, ["Show:"]), btnAll, btnAct, btnInact);

  const actRow = el("div", { class: "docs-toolbar-row" });
  const btnActivateTags = el("button", { class: "btn", type: "button", id: `${id}-activate-by-tags`, title: "Turn on RAG for every document that has all tags selected above (does not deactivate others)" }, ["Activate by selected tags"]);
  const btnDeactivateAll = el("button", { class: "btn", type: "button", id: `${id}-deactivate-all` }, ["Deactivate all"]);
  const btnManageTags = el("button", { class: "btn", type: "button", id: `${id}-manage-tags` }, ["Manage approved #tags"]);
  const btnClearCorpus = el("button", { class: "btn btn-danger", type: "button", id: `${id}-clear-corpus` }, ["Remove all documents…"]);
  actRow.append(btnActivateTags, btnDeactivateAll, btnManageTags, btnClearCorpus);

  toolbar.append(filterRow, tagFilterLabel, tagChips, modeRow, actRow);
  layout.appendChild(toolbar);

  const bulkBar = el("div", { class: "docs-bulk-bar hidden", id: `${id}-bulk-bar` });
  bulkBar.append(
    el("span", { class: "li-subtle", id: `${id}-bulk-label` }, ["0 selected"]),
    el("button", { class: "btn", type: "button", id: `${id}-bulk-add-tag` }, ["Add tag…"]),
    el("button", { class: "btn", type: "button", id: `${id}-bulk-remove-tag` }, ["Remove tag…"]),
    el("button", { class: "btn", type: "button", id: `${id}-bulk-activate` }, ["Activate"]),
    el("button", { class: "btn", type: "button", id: `${id}-bulk-deactivate` }, ["Deactivate"]),
  );
  layout.appendChild(bulkBar);

  const listHost = el("div", { class: "list docs-doc-list", id: `${id}-doc_list` });
  layout.appendChild(listHost);

  const ctxMenu = el("div", { class: "context-menu hidden", id: `${id}-ctx-menu`, role: "menu" });
  ctxMenu.append(
    el("button", { class: "ctx-item", type: "button", "data-act": "add-tag" }, ["Add tag…"]),
    el("button", { class: "ctx-item", type: "button", "data-act": "remove-tag" }, ["Remove tag…"]),
    el("button", { class: "ctx-item", type: "button", "data-act": "activate" }, ["Activate"]),
    el("button", { class: "ctx-item", type: "button", "data-act": "deactivate" }, ["Deactivate"]),
  );
  layout.appendChild(ctxMenu);

  return layout;
}
