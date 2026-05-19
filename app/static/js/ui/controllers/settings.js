// ui/controllers/settings.js — settings modal
import { createMiniWindowFromConfig, mountModal } from "../../window.js";
import { dkClient as api } from "../sdk/sdk.js";

export async function openSettingsModal() {
  const user = await api.getUser();
  const userId = user?.user || "default";
  const [settings, prompts, ollama] = await Promise.all([
    api.getSettings(userId),
    api.listPromptTemplates(),
    api.listOllamaModels(),
  ]);

  const promptOptions = [{ value: "", label: "(default)" }];
  for (const t of prompts) {
    promptOptions.push({ value: t.id, label: t.name || t.id });
  }

  const modelOptions = [];
  const models = ollama?.models || [];
  for (const m of models) modelOptions.push({ value: m, label: m });
  if (settings.llm_model && !models.includes(settings.llm_model)) {
    modelOptions.unshift({ value: settings.llm_model, label: `${settings.llm_model} (current)` });
  }
  if (!modelOptions.length) modelOptions.push({ value: settings.llm_model || "llama3", label: settings.llm_model || "llama3" });

  const cfg = {
    id: `win_settings_${crypto.randomUUID().slice(0,6)}`,
    window_type: "window_generic",
    title: "Settings",
    modal: true,
    Elements: [
      {
        type: "text",
        label: "LLM Provider",
        text: "Ollama (local only)"
      },
      { type: "select", label: "Ollama Model", id: "llm_model", options: modelOptions, value: settings.llm_model || modelOptions[0]?.value || "llama3" },
      { type: "select", label: "Prompt Template", id: "prompt_template_id", options: promptOptions, value: settings.prompt_template_id || "" }
    ]
  };
  const win = createMiniWindowFromConfig(cfg);
  const wrap = mountModal(win);
  const save = document.createElement("button");
  save.className = "btn js-settings-save";
  save.type = "button";
  save.textContent = "Save";
  win.querySelector(".form")?.appendChild(save);
  save.addEventListener("click", async () => {
    const payload = {
      llm_provider: "ollama",
      llm_model: win.querySelector("#llm_model")?.value,
      prompt_template_id: win.querySelector("#prompt_template_id")?.value || null,
    };
    await api.patchSettings(userId, payload);
    wrap.remove();
  });
  return win;
}
