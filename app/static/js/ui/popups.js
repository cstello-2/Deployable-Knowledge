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
        <div class="dk-spinner" id="dk-loading-spinner" aria-hidden="true"></div>

        <div class="dk-progress-wrap hidden" id="dk-progress-wrap" aria-hidden="true">
          <div class="dk-progress-track">
            <div class="dk-progress-fill" id="dk-progress-fill"></div>
          </div>
        </div>

        <div class="dk-loading-title" id="dk-loading-title">Working…</div>
        <div class="dk-loading-message" id="dk-loading-message">Please wait.</div>
      </div>
    `;

    root.appendChild(overlay);
  }

  return overlay;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);

  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  const decimals = size >= 10 || index === 0 ? 0 : 1;
  return `${size.toFixed(decimals)} ${units[index]}`;
}

function setProgressMode(enabled) {
  ensureLoadingOverlay();

  const spinner = document.getElementById("dk-loading-spinner");
  const progressWrap = document.getElementById("dk-progress-wrap");
  const fillEl = document.getElementById("dk-progress-fill");

  if (spinner) {
    spinner.classList.toggle("hidden", enabled);
  }

  if (progressWrap) {
    progressWrap.classList.toggle("hidden", !enabled);
    progressWrap.setAttribute("aria-hidden", enabled ? "false" : "true");
  }

  if (!enabled && fillEl) {
    fillEl.classList.remove("dk-progress-fill-indeterminate");
  }
}

export function showLoadingPopup(message = "Working…") {
  busyCount += 1;

  const overlay = ensureLoadingOverlay();
  const messageEl = document.getElementById("dk-loading-message");
  const titleEl = document.getElementById("dk-loading-title");
  const fillEl = document.getElementById("dk-progress-fill");

  setProgressMode(false);

  if (titleEl) {
    titleEl.textContent = "Working…";
  }

  if (messageEl) {
    messageEl.textContent = message;
  }

  if (fillEl) {
    fillEl.classList.remove("dk-progress-fill-indeterminate");
    fillEl.style.width = "0%";
  }

  overlay.classList.remove("hidden");
  document.body.classList.add("dk-app-busy");

  window.dispatchEvent(new CustomEvent("dk:busy-change", {
    detail: { busy: true, message },
  }));
}

export function showProgressPopup(message = "Starting…") {
  busyCount += 1;

  const overlay = ensureLoadingOverlay();
  const titleEl = document.getElementById("dk-loading-title");
  const messageEl = document.getElementById("dk-loading-message");
  const fillEl = document.getElementById("dk-progress-fill");

  setProgressMode(true);

  if (titleEl) {
    titleEl.textContent = "Starting…";
  }

  if (messageEl) {
    messageEl.textContent = message;
  }

  if (fillEl) {
    fillEl.classList.remove("dk-progress-fill-indeterminate");
    fillEl.style.width = "0%";
  }

  overlay.classList.remove("hidden");
  document.body.classList.add("dk-app-busy");

  window.dispatchEvent(new CustomEvent("dk:busy-change", {
    detail: { busy: true, message },
  }));
}

export function updateProgressPopup(job) {
  ensureLoadingOverlay();
  setProgressMode(true);

  const titleEl = document.getElementById("dk-loading-title");
  const messageEl = document.getElementById("dk-loading-message");
  const fillEl = document.getElementById("dk-progress-fill");

  const percent = Number(job?.percent || 0);
  const safePercent = Math.max(0, Math.min(100, percent));
  const label = job?.label || "Working";
  const message = job?.message || "";
  const current = Number(job?.current || 0);
  const total = Number(job?.total || 0);
  const hasTotal = total > 0;

  if (fillEl) {
    fillEl.classList.toggle("dk-progress-fill-indeterminate", !hasTotal);
    fillEl.style.width = hasTotal ? `${safePercent}%` : "";
  }

  if (titleEl) {
    titleEl.textContent = hasTotal ? `${label}: ${safePercent.toFixed(1)}%` : label;
  }

  if (messageEl) {
    messageEl.textContent = hasTotal
      ? `${message} — ${formatBytes(current)} / ${formatBytes(total)}`
      : message;
  }
}

export function updateUploadProgressPopup({
  label = "Uploading",
  current = 0,
  total = 0,
  message = "",
}) {
  const percent = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  updateProgressPopup({
    label,
    current,
    total,
    message,
    percent,
  });
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

export async function withProgressPopup(message, work) {
  showProgressPopup(message);

  try {
    return await work();
  } finally {
    hideLoadingPopup();
  }
}
