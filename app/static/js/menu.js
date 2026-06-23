// menu.js — simple dropdown menu
/**
 * @param {function(string): void} onAction
 * @param {string} [triggerId]
 * @param {string} [dropdownId]
 * @param {{ peerClosers?: Array<() => void> }} [options] — menus that share this array close each other when one opens (only one open at a time).
 */
export function initMenu(onAction, triggerId = "menu-trigger", dropdownId = "menu-dropdown", options = {}) {
  const trigger = document.getElementById(triggerId);
  const dropdown = document.getElementById(dropdownId);
  if (!trigger || !dropdown) return;

  const peerClosers = options.peerClosers;

  function close() {
    dropdown.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    dropdown.setAttribute("aria-hidden", "true");
  }

  if (Array.isArray(peerClosers)) {
    peerClosers.push(close);
  }

  function open() {
    if (Array.isArray(peerClosers)) {
      for (const fn of peerClosers) {
        if (fn !== close) fn();
      }
    }
    dropdown.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    dropdown.setAttribute("aria-hidden", "false");
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dropdown.classList.contains("open")) close(); else open();
  });

  document.addEventListener("click", (e) => {
    if (
    !dropdown.contains(e.target) &&
      e.target !== trigger &&
      !e.target.closest(".modal-wrap")   // ← NEW: ignore clicks inside modals
    ) {
      close();
    }

  });

  dropdown.addEventListener("click", (e) => {
    const item = e.target.closest(".menu-item");
    if (!item) return;
    const action = item.getAttribute("data-action");
    close();
    if (action && onAction) onAction(action);
  });
}
