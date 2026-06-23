// ui/controllers/sessions.js — sessions list + load history
import { dkClient as api } from "../sdk/sdk.js";
import { renderChatLog } from "../render.js";
import { getComponent, bus } from "../../components.js";
import { Store } from "../store.js";
import { qs } from "../../dom.js";

let selectedSessionId = null;
const refreshByWin = new Map();
const boundWins = new Set();
let busBound = false;

export async function initSessionsController(winId="win_sessions") {
  const comp = getComponent(winId, "session_list");
  const refresh = async () => {
    const rows = await api.listSessions();
    if (comp) comp.render(rows);
    selectedSessionId = null;
  };
  await refresh();
  refreshByWin.set(winId, refresh);

  const win = qs(`#${winId}`);
  if (!win) return;
  if (boundWins.has(winId)) return;
  boundWins.add(winId);

  window.addEventListener("sessions:refresh", () => {
    const fn = refreshByWin.get(winId);
    if (fn) fn();
  });

  if (!busBound) {
    busBound = true;
    bus.addEventListener("ui:list-select", async (ev) => {
    const { winId: srcWin, elementId, item, index } = ev.detail || {};
    if (elementId !== "session_list" || srcWin !== winId) return;

    // toggle selected
    const list = qs(`#${winId} #session_list`);
    if (list) {
      list.querySelectorAll(".list-item.selected").forEach(el => el.classList.remove("selected"));
      const row = list.querySelector(`.list-item[data-index="${index}"]`);
      row?.classList.add("selected");
      selectedSessionId = item.session_id;
    }

    // load history
    Store.sessionId = item.session_id;
    const data = await api.getSession(Store.sessionId);
    const log = qs("#win_chat #chat_log");
    if (log) renderChatLog(data.history || [], log);
    });
  }

  bus.addEventListener("ui:list-action", async (ev) => {
    const { winId: sourceWin, elementId, action, item } = ev.detail || {};
    if (elementId !== "session_list" || sourceWin !== winId) return;
    selectedSessionId = item?.session_id || selectedSessionId;
    if (!selectedSessionId) return;
    if (action === "rename") {
      const title = prompt("Rename chat title:", item?.title || "");
      if (title == null) return;
      await api.renameSession(selectedSessionId, title);
      await refresh();
    }
    if (action === "delete") {
      if (!confirm("Delete this chat history?")) return;
      await api.deleteSession(selectedSessionId);
      if (Store.sessionId === selectedSessionId) {
        Store.sessionId = await api.startNewSession();
        const log = qs("#win_chat #chat_log");
        if (log) log.innerHTML = "";
      }
      await refresh();
    }
  });
}
