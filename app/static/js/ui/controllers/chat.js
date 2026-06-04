// ui/controllers/chat.js — chat send + stream
import { dkClient as api } from "../sdk/sdk.js";
import { Store } from "../store.js";
import { md, escapeHtml } from "../render.js";
import { qs } from "../../dom.js";
import { showContext, renderChatCitations, runSearch } from "./search.js";
import { isAppBusy } from "../popups.js";
import { getSelectedLLMTarget, getSelectedPromptTemplateId } from "./prompt_editor.js";

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
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };

  /** @returns {{ wrap: HTMLDivElement, mdEl: HTMLDivElement, citeEl: HTMLDivElement, clearPending: () => void }} */
  const pushAssistantBubble = () => {
    const wrap = document.createElement("div");
    wrap.className = "msg assistant";
    const mdEl = document.createElement("div");
    mdEl.className = "msg-md msg-pending";
    mdEl.setAttribute("role", "status");
    mdEl.setAttribute("aria-live", "polite");
    mdEl.innerHTML = `
      <span class="typing-indicator" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
      <span class="typing-text">Generating response...</span>
    `;
    const citeEl = document.createElement("div");
    citeEl.className = "msg-citations";
    citeEl.hidden = true;
    wrap.append(mdEl, citeEl);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return {
      wrap,
      mdEl,
      citeEl,
      clearPending() {
        mdEl.classList.remove("msg-pending");
        mdEl.removeAttribute("role");
        mdEl.removeAttribute("aria-live");
      },
    };
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
    const llmTarget = getSelectedLLMTarget();
    try {
      await api.streamChat(
        {
          message: text,
          session_id: Store.sessionId,
          inactive: Store.inactiveList(),
          persona: Store.persona,
          template_id: getSelectedPromptTemplateId(),
          ...llmTarget,
        },
        {
          signal: aborter.signal,
          onMeta(meta) {
            renderChatCitations(bubble.citeEl, meta.context, { maxItems: 8 });
            runSearch(text);
          },
          onDelta(delta) {
            buf += delta;
            bubble.clearPending();
            bubble.mdEl.innerHTML = md(buf);
            log.scrollTop = log.scrollHeight;
          },
          onDone(data) {
            bubble.clearPending();
            if (!buf) bubble.mdEl.innerHTML = md("(no response)");
            if (data?.sources) {
              showContext(data.sources, text);
              renderChatCitations(bubble.citeEl, data.sources, { maxItems: 8 });
            }
          },
          onError(data) {
            const msg = data?.error || "Stream failed";
            bubble.clearPending();
            bubble.mdEl.innerHTML = `<em>Error:</em> ${escapeHtml(msg)}`;
          },
        }
      );
    } catch (e) {
      if (e.name === "AbortError") {
        bubble.clearPending();
        if (!buf) bubble.wrap.remove();
        return;
      }
      try {
        const res = await api.chat({
          message: text,
          session_id: Store.sessionId,
          inactive: Store.inactiveList(),
          persona: Store.persona,
          template_id: getSelectedPromptTemplateId(),
          ...llmTarget,
        });
        bubble.clearPending();
        bubble.mdEl.innerHTML = md(res.response ?? "(no response)");
        if (res.context) {
          showContext(res.context, text);
          renderChatCitations(bubble.citeEl, res.context, { maxItems: 8 });
        }
      } catch (e2) {
        bubble.clearPending();
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
