// ui/controllers/chat.js — chat send + stream
import { dkClient as api } from "../sdk/sdk.js";
import { Store } from "../store.js";
import { md, escapeHtml } from "../render.js";
import { qs } from "../../dom.js";
import { showContext, renderChatCitations } from "./search.js";
import { isAppBusy } from "../popups.js";

export function initChatController() {
  const chatWin = qs("#win_chat");
  if (!chatWin) return;
  const log = qs("#win_chat #chat_log");
  const input = qs("#win_chat #chat_input");
  const sendBtn = qs("#win_chat #win_chat-send");
  const newChatBtn = qs("#win_chat #win_chat-new-chat");
  let handlersBound = chatWin.dataset.handlersBound === "1";
  function setChatBusyState(isBusy) {
    if (input) input.disabled = isBusy;
    if (sendBtn) sendBtn.disabled = isBusy;
  }
  window.addEventListener("dk:busy-change", (ev) => {
    setChatBusyState(Boolean(ev.detail?.busy));
  });
  const pushUser = (text) => {
    const div = document.createElement("div");
    div.className = "msg you";
    div.innerHTML = "You: " + escapeHtml(text);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };

  /** @returns {{ wrap: HTMLDivElement, mdEl: HTMLDivElement, citeEl: HTMLDivElement }} */
  const pushAssistantBubble = () => {
    const wrap = document.createElement("div");
    wrap.className = "msg assistant";
    const mdEl = document.createElement("div");
    mdEl.className = "msg-md";
    mdEl.innerHTML = "…";
    const citeEl = document.createElement("div");
    citeEl.className = "msg-citations";
    citeEl.hidden = true;
    wrap.append(mdEl, citeEl);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return { wrap, mdEl, citeEl };
  };

  let aborter = null;
  const send = async () => {
    if (isAppBusy()) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    Store.lastQuery = text;
    pushUser(text);
    const bubble = pushAssistantBubble();

    aborter?.abort();
    aborter = new AbortController();
    let buf = "";
    try {
      await api.streamChat(
        {
          message: text,
          session_id: Store.sessionId,
          inactive: Store.inactiveList(),
          persona: Store.persona,
        },
        {
          signal: aborter.signal,
          onDelta(delta) {
            buf += delta;
            bubble.mdEl.innerHTML = md(buf);
            log.scrollTop = log.scrollHeight;
          },
          onDone(data) {
            if (data?.sources) {
              showContext(data.sources, text);
              renderChatCitations(bubble.citeEl, data.sources, { maxItems: 3 });
            }
          },
        }
      );
    } catch (e) {
      if (e.name === "AbortError") return;
      try {
        const res = await api.chat({
          message: text,
          session_id: Store.sessionId,
          inactive: Store.inactiveList(),
          persona: Store.persona,
        });
        bubble.mdEl.innerHTML = md(res.response ?? "(no response)");
        if (res.context) {
          showContext(res.context, text);
          renderChatCitations(bubble.citeEl, res.context, { maxItems: 3 });
        }
      } catch (e2) {
        bubble.mdEl.innerHTML = `<em>Error:</em> ${escapeHtml(e2.message)}`;
      }
    }
  };

  const showNewChatStarted = () => {
    const div = document.createElement("div");
    div.className = "msg assistant";
    const mdEl = document.createElement("div");
    mdEl.className = "msg-md";
    mdEl.textContent = "New chat started. How can I help?";
    div.appendChild(mdEl);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };

  if (!handlersBound) {
    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    newChatBtn?.addEventListener("click", async () => {
      Store.sessionId = await api.startNewSession();
      log.innerHTML = "";
      input.value = "";
      showNewChatStarted();
      window.dispatchEvent(new CustomEvent("sessions:refresh"));
    });
    chatWin.dataset.handlersBound = "1";
  }
}
