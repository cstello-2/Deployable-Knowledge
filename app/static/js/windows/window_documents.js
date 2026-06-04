import { el } from "../ui.js";

export function render(config, winId) {
  const layout = el("div", { class: "form docs-window" });
  const id = config.id || winId;

  const toolbar = el("div", { class: "docs-toolbar" });
  const searchRow = el("div", { class: "docs-search-row" });
  const filterInput = el("input", {
    type: "text",
    class: "input",
    id: `${id}-doc-filter`,
    placeholder: "Filter library (fuzzy match on name & tags)...",
  });
  const btnManageTags = el("button", { class: "tag-chip docs-tags-button", type: "button", id: `${id}-manage-tags`, "aria-expanded": "false", title: "Manage tags" }, ["+"]);
  searchRow.append(filterInput);

  const activeFilterRow = el("div", { class: "docs-active-filter-row" });
  const activeTags = el("div", { class: "docs-active-tags", id: `${id}-tag-filter-chips` });
  const filterMeta = el("span", { class: "li-subtle", id: `${id}-filter-meta` });
  activeTags.append(btnManageTags);
  activeFilterRow.append(activeTags, filterMeta);

  const tagMenu = el("div", { class: "docs-tag-menu hidden", id: `${id}-tag-menu` });
  tagMenu.append(
    el("div", { class: "docs-tag-menu-title" }, ["Tags"]),
    el("div", { class: "docs-tag-menu-list", id: `${id}-tag-menu-list` }),
    el("button", { class: "btn btn-sm", type: "button", id: `${id}-add-tag` }, ["Add Tag"]),
  );

  const modeRow = el("div", { class: "docs-toolbar-row docs-mode-row" });
  const btnAll = el("button", { class: "btn", type: "button", id: `${id}-mode-all` }, ["All"]);
  const btnAct = el("button", { class: "btn", type: "button", id: `${id}-mode-active` }, ["Active in RAG"]);
  const btnInact = el("button", { class: "btn", type: "button", id: `${id}-mode-inactive` }, ["Inactive"]);
  const btnDeactivateAll = el("button", { class: "btn", type: "button", id: `${id}-deactivate-all` }, ["Deactivate all"]);
  const btnClearCorpus = el("button", { class: "btn btn-danger", type: "button", id: `${id}-clear-corpus` }, ["Remove all"]);
  modeRow.append(btnAll, btnAct, btnInact, btnDeactivateAll, btnClearCorpus);
  toolbar.append(searchRow, activeFilterRow, tagMenu, modeRow);
  layout.appendChild(toolbar);

  const bulkBar = el("div", { class: "docs-bulk-bar hidden", id: `${id}-bulk-bar` });
  bulkBar.append(
    el("span", { class: "li-subtle", id: `${id}-bulk-label` }, ["0 selected"]),
    el("button", { class: "btn", type: "button", id: `${id}-bulk-add-tag` }, ["Apply tag"]),
    el("button", { class: "btn", type: "button", id: `${id}-bulk-remove-tag` }, ["Remove tag"]),
    el("button", { class: "btn", type: "button", id: `${id}-bulk-activate` }, ["Activate"]),
    el("button", { class: "btn", type: "button", id: `${id}-bulk-deactivate` }, ["Deactivate"]),
  );
  layout.appendChild(bulkBar);

  const listHost = el("div", { class: "list docs-doc-list", id: `${id}-doc_list` });
  layout.appendChild(listHost);

  const upWrap = el("div", { class: "docs-add-controls" });
  const upInput = el("input", { type: "file", multiple: true, accept: "application/pdf,.pdf", id: `${id}-upload`, style: { display: "none" } });
  const chooseFolderBtn = el("button", { class: "btn", type: "button", id: `${id}-choose-folder-btn` }, ["Add document or folder"]);
  const syncFolderStatus = el("div", { class: "folder-sync-status", id: `${id}-sync-folder-status` });
  upWrap.append(chooseFolderBtn, syncFolderStatus, upInput);
  const fileList = el("ul", { class: "upload-list", id: `${id}-upload-list` });
  layout.append(fileList, upWrap);
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

  const pickerChooseFiles = el("button", {
    class: "btn",
    type: "button",
    id: `${id}-mock-picker-choose-files`,
  }, ["Choose Files"]);

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

  pickerActions.append(pickerChooseFiles, pickerUp, pickerSelectFolder);

  const pickerList = el("div", {
    class: "mock-picker-list",
    id: `${id}-mock-picker-list`,
  });

  const pickerSelected = el("div", {
    class: "mock-picker-selected",
    id: `${id}-mock-picker-selected`,
  }, ["PDF files only."]);

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

  const ctxMenu = el("div", { class: "context-menu hidden", id: `${id}-ctx-menu`, role: "menu" });
  ctxMenu.append(
    el("button", { class: "ctx-item", type: "button", "data-act": "add-tag" }, ["Apply tag"]),
    el("button", { class: "ctx-item", type: "button", "data-act": "remove-tag" }, ["Remove tag"]),
    el("button", { class: "ctx-item", type: "button", "data-act": "activate" }, ["Activate"]),
    el("button", { class: "ctx-item", type: "button", "data-act": "deactivate" }, ["Deactivate"]),
  );
  layout.appendChild(ctxMenu);

  const tagDialog = el("div", { class: "docs-tag-dialog hidden", id: `${id}-tag-dialog`, role: "dialog", "aria-modal": "true" });
  const tagDialogPanel = el("div", { class: "docs-tag-dialog-panel" });
  tagDialogPanel.append(
    el("div", { class: "docs-tag-dialog-title" }, ["Add Tag"]),
    el("input", { class: "input", type: "text", id: `${id}-new-tag-input`, placeholder: "tag name" }),
    el("div", { class: "docs-tag-dialog-actions" }, [
      el("button", { class: "btn", type: "button", id: `${id}-new-tag-cancel` }, ["Cancel"]),
      el("button", { class: "btn btn-primary", type: "button", id: `${id}-new-tag-save` }, ["Add"]),
    ]),
  );
  tagDialog.appendChild(tagDialogPanel);
  document.body.appendChild(tagDialog);

  return layout;
}
