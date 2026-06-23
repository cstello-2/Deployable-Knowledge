import { el } from "../ui.js";
import { createItemList } from "../components.js";

export function render(config, winId) {
  const layout = el("div", { class: "form" });
  const listEl = createItemList(config.id || winId, {
    id: "session_list",
    item_template: {
      elements: [
        { type: "text", bind: "title", class: "li-title" },
        { type: "text", bind: "created_at", class: "li-right" },
        { type: "button", label: "Rename", action: "rename" },
        { type: "button", label: "Delete", action: "delete", variant: "danger" }
      ]
    }
  });
  layout.append(listEl);
  return layout;
}
