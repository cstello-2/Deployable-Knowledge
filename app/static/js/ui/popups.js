// ui/popups.js — shared popup / overlay manager

let busyCount = 0;

function ensurePopupRoot() {
  let root = document.getElementById("dk-popup-root");

  if (!root) {
    root = document.createElement("div");
    root.id = "dk-popup-root";
    document.body.appendChild(root);
  }

  return root;
}

function ensureLoadingOverlay() {
  const root = ensurePopupRoot();

  let overlay = document.getElementById("dk-loading-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "dk-loading-overlay";
    overlay.className = "dk-popup-overlay hidden";
    overlay.setAttribute("aria-live", "polite");
    overlay.setAttribute("aria-busy", "true");

    overlay.innerHTML = `
      <div class="dk-loading-modal" role="dialog" aria-modal="true">
        <div class="dk-spinner" aria-hidden="true"></div>
        <div class="dk-loading-title" id="dk-loading-title">Working…</div>
        <div class="dk-loading-message" id="dk-loading-message">Please wait.</div>
      </div>
    `;

    root.appendChild(overlay);
  }

  return overlay;
}

export function showLoadingPopup(message = "Working…") {
  busyCount += 1;

  const overlay = ensureLoadingOverlay();
  const messageEl = document.getElementById("dk-loading-message");

  if (messageEl) {
    messageEl.textContent = message;
  }

  overlay.classList.remove("hidden");
  document.body.classList.add("dk-app-busy");

  window.dispatchEvent(new CustomEvent("dk:busy-change", {
    detail: { busy: true, message },
  }));
}

export function hideLoadingPopup() {
  busyCount = Math.max(0, busyCount - 1);

  if (busyCount > 0) return;

  const overlay = ensureLoadingOverlay();
  overlay.classList.add("hidden");
  document.body.classList.remove("dk-app-busy");

  window.dispatchEvent(new CustomEvent("dk:busy-change", {
    detail: { busy: false },
  }));
}

export function isAppBusy() {
  return busyCount > 0;
}

export async function withLoadingPopup(message, work) {
  showLoadingPopup(message);

  try {
    return await work();
  } finally {
    hideLoadingPopup();
  }
}