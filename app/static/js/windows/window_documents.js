import { el } from "../ui.js";

export function render(config, winId) {
  const layout = el("div", { class: "form docs-window" });
  const id = config.id || winId;

  const upWrap = el("div", { class: "row" });
  const upInput = el("input", { type: "file", multiple: true, id: `${id}-upload`, style: { display: "none" } });
  const chooseBtn = el("button", { class: "btn", type: "button", id: `${id}-choose-btn` }, ["Choose Files"]);
  const upBtn = el("button", { class: "btn", type: "button", id: `${id}-upload-btn` }, ["Upload"]);
  const uploadCount = el("span", { class: "li-subtle", id: `${id}-upload-count` }, ["0 files selected"]);
  upWrap.append(el("label", {}, ["Upload Documents"]), chooseBtn, upBtn, uploadCount, upInput);
  const fileList = el("ul", { class: "upload-list", id: `${id}-upload-list` });
  layout.append(upWrap, fileList);

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
