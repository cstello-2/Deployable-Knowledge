// splitter.js — resizable columns
export function initSplitter() {
  const columns = document.getElementById("columns");
  const splitter = document.getElementById("splitter");
  const left = document.getElementById("col-left");
  const right = document.getElementById("col-right");
  const KEY = "layout:leftWidth";

  let dragging = false, startX = 0, leftStartWidth = 0;

  const applyLeftWidth = (px) => {
    const total = columns.clientWidth - splitter.clientWidth;
    const minLeft = Math.max(300, total * 0.28);
    const maxLeft = total - 320;
    const clamped = Math.min(maxLeft, Math.max(minLeft, px));
    left.style.flex = `0 0 ${clamped}px`;
    right.style.flex = `1 1 auto`;
  };

  const onDown = (e) => {
    dragging = true;
    splitter.classList.add("dragging");
    startX = e.clientX;
    leftStartWidth = left.getBoundingClientRect().width;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  };

  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    applyLeftWidth(leftStartWidth + dx);
  };

  const onUp = () => {
    dragging = false;
    splitter.classList.remove("dragging");
    const cur = Math.round(left.getBoundingClientRect().width);
    localStorage.setItem(KEY, String(cur));
    document.removeEventListener("pointermove", onMove);
  };

  splitter.addEventListener("pointerdown", onDown);

  const saved = Number(localStorage.getItem(KEY));
  if (Number.isFinite(saved) && saved > 0) {
    applyLeftWidth(saved);
  } else {
    applyLeftWidth(Math.round(window.innerWidth * 0.42));
  }

  window.addEventListener("resize", () => {
    const cur = Math.round(left.getBoundingClientRect().width);
    applyLeftWidth(cur);
  });
}
