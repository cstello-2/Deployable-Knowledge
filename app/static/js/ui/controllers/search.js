// ui/controllers/search.js — semantic search + passage cards (shared with chat citations)
import { dkClient as api } from "../sdk/sdk.js";
import { escapeHtml } from "../render.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSegmentKey(s) {
  return s && UUID_RE.test(String(s));
}

function docAtHref(segmentId) {
  return "/static/doc_at.html?segment=" + encodeURIComponent(String(segmentId));
}


function sourceKindFromResult(r) {
  const text = String(r.text ?? "").trim();

  if (text.startsWith("[Image:")) return "Image";
  if (text.startsWith("[OCR:")) return "Image";
  if (r.kind) return String(r.kind);

  return "Text";
}

function formatSimilarityPercent(score) {
  const n = Number(score);

  if (!Number.isFinite(n)) return "—";

  const pct = n <= 1 ? n * 100 : n;

  return `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
}

function makeChatSourceRow(r, num) {
  const segmentId = r.segment_id ?? r.id;
  const source = String(r.source ?? r.title ?? r.filepath ?? "source");
  const kind = sourceKindFromResult(r);
  const page = r.page ?? null;
  const similarity = formatSimilarityPercent(r.score);

  const li = document.createElement("li");
  li.className = "chat-source-row";

  const left = document.createElement("div");
  left.className = "chat-source-left";

  const numEl = document.createElement("span");
  numEl.className = "chat-source-num";
  numEl.textContent = `${num}.`;

  const label = document.createElement("span");
  label.className = "chat-source-text";
  label.textContent = `${kind} from ${source}${page && page !== "?" ? `, page ${page}` : ""}`;

  left.append(numEl, label);

  const right = document.createElement("div");
  right.className = "chat-source-actions";

  if (isSegmentKey(segmentId)) {
    const a = document.createElement("a");
    a.className = "btn btn-sm chat-source-btn";
    a.href = docAtHref(segmentId);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = source;
    right.appendChild(a);
  } else if (source) {
    const a = document.createElement("a");
    a.className = "btn btn-sm chat-source-btn";
    a.href = `/documents/${encodeURIComponent(source)}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = source;
    right.appendChild(a);
  }

  const score = document.createElement("span");
  score.className = "chat-source-score";
  score.textContent = similarity;
  right.appendChild(score);

  li.append(left, right);
  return li;
}

/**
 * Append a result card (search window or chat citations).
 * @param {HTMLElement} container
 * @param {Record<string, unknown>} r — retriever row or Source JSON
 * @param {{ compact?: boolean }} opts
 */
export function appendPassageCard(container, r, { compact = false } = {}) {
  const segmentId = r.segment_id ?? r.id;
  const source = String(r.source ?? r.title ?? r.filepath ?? "");
  const page = r.page ?? "?";
  const scoreLabel =
    typeof r.score === "number" && !Number.isNaN(r.score)
      ? r.score.toFixed(3)
      : String(r.score ?? "");

  const card = document.createElement("div");
  card.className = compact ? "result-card result-card--compact" : "result-card";

  const body = document.createElement("div");
  let excerpt = String(r.text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (compact && excerpt.length > 180) excerpt = `${excerpt.slice(0, 177)}…`;
  body.textContent = excerpt;
  if (compact) body.className = "result-card__excerpt";

  const meta = document.createElement("div");
  meta.className = "result-meta";
  const srcSpan = document.createElement("span");
  srcSpan.textContent = source ? `Source: ${source}` : "Source: —";
  const metaSpan = document.createElement("span");
  metaSpan.textContent = `Similarity: ${scoreLabel} • Page: ${page}`;
  meta.append(srcSpan, metaSpan);

  const actions = document.createElement("div");
  actions.className = "result-actions";
  if (isSegmentKey(segmentId)) {
    const a = document.createElement("a");
    a.className = "btn btn-sm";
    a.href = docAtHref(segmentId);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Open in document";
    actions.appendChild(a);
  } else if (source) {
    const a = document.createElement("a");
    a.className = "btn btn-sm";
    a.href = `/documents/${encodeURIComponent(source)}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Open file";
    actions.appendChild(a);
  }

  card.append(body, meta);
  if (actions.childNodes.length) card.appendChild(actions);
  container.appendChild(card);
}

/**
 * Small numbered source list under an assistant message.
 */
export function renderChatCitations(host, sources, { maxItems = 3 } = {}) {
  if (!host) return;

  host.innerHTML = "";
  host.hidden = true;

  const list = (sources || []).slice(0, maxItems);
  if (!list.length) return;

  host.hidden = false;

  const label = document.createElement("div");
  label.className = "msg-citations-label";
  label.textContent = "Sources";
  host.appendChild(label);

  const ol = document.createElement("ol");
  ol.className = "chat-source-list";

  list.forEach((r, index) => {
    ol.appendChild(makeChatSourceRow(r, index + 1));
  });

  host.appendChild(ol);
}

export async function runSearch(query, winId = "win_search") {
  const win = document.getElementById(winId);
  if (!win) return;
  const q = win.querySelector("#search_q");
  const k = win.querySelector("#search_k");
  const results = win.querySelector("#search_results");
  if (query !== undefined) q.value = query;
  const qtext = q.value.trim();
  const topK = Number(k.value || 5);
  if (!qtext) {
    results.innerHTML = "";
    return;
  }

  results.innerHTML = `<div class="li-subtle">Searching…</div>`;

  try {
    const data = await api.search(qtext, topK);
    const arr = (data && data.results) || [];

    results.innerHTML = "";
    if (!arr.length) {
      results.innerHTML = `<div class="li-subtle">No results</div>`;
      return;
    }

    for (const r of arr) appendPassageCard(results, r, { compact: false });
  } catch (e) {
    results.innerHTML = `<div class="li-subtle">Error: ${escapeHtml(
      e?.message || String(e)
    )}</div>`;
  }
}

export function showContext(sources = [], query, winId = "win_search") {
  const win = document.getElementById(winId);
  if (!win) return;
  const q = win.querySelector("#search_q");
  const results = win.querySelector("#search_results");
  if (query !== undefined && q) q.value = query;
  results.innerHTML = "";
  if (!sources || !sources.length) {
    results.innerHTML = `<div class="li-subtle">No context</div>`;
    return;
  }
  for (const r of sources) appendPassageCard(results, r, { compact: false });
}

export function initSearchController(winId = "win_search") {
  const win = document.getElementById(winId);
  if (!win) return;
  const q = win.querySelector("#search_q");
  const go = win.querySelector(".search-bar .btn");
  go.addEventListener("click", () => runSearch(undefined, winId));
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch(undefined, winId);
  });
}
