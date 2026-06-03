// ui/controllers/settings.js — settings modal
import { createMiniWindowFromConfig, mountModal, createPopup } from "../../window.js";
import { dkClient as api } from "../sdk/sdk.js";
import { applyThemeSettings } from "../../theme.js";

export async function openSettingsModal() {
  const user = await api.getUser();
  const userId = user?.user || "default";
  const [settings, prompts, providersData] = await Promise.all([
    api.getSettings(userId),
    api.listPromptTemplates(),
    api.listModelProviders({ refresh: true }),
  ]);

  const promptOptions = [{ value: "", label: "(default)" }];
  for (const t of prompts) {
    promptOptions.push({ value: t.id, label: t.name || t.id });
  }

  const providers = providersData?.chat_providers || [];
  const providerOptions = providers.map((p) => ({ value: p.id, label: p.label || p.id }));
  if (!providerOptions.length) {
    providerOptions.push({ value: "", label: "No connected chat providers" });
  }

  const savedProvider = settings.llm_provider || "ollama";
  const selectedProvider = providers.some((p) => p.id === savedProvider)
    ? savedProvider
    : providers[0]?.id || "";

  function modelOptionsFor(providerId) {
    const provider = providers.find((p) => p.id === providerId);
    const models = provider?.models || [];
    const opts = models.map((m) => {
      if (typeof m === "string") return { value: m, label: m };
      return { value: m.id, label: m.label || m.id };
    });
    const modelIds = opts.map((opt) => opt.value);
    if (providerId === savedProvider && settings.llm_model && !modelIds.includes(settings.llm_model)) {
      opts.unshift({ value: settings.llm_model, label: `${settings.llm_model} (current)` });
    }
    if (!opts.length) opts.push({ value: "", label: "No models available" });
    return opts;
  }

  const initialModelOptions = modelOptionsFor(selectedProvider);
  const selectedModel = selectedProvider === savedProvider && settings.llm_model
    ? settings.llm_model
    : initialModelOptions[0]?.value || "";
  const embeddingText = [
    providersData?.embedding_model_id,
    providersData?.embedding_model_path,
  ].filter(Boolean).join(" @ ") || "(configured in config.py)";

  const cfg = {
    id: `win_settings_${crypto.randomUUID().slice(0,6)}`,
    window_type: "window_generic",
    title: "THEME",
    modal: true,
    Elements: [
      {
        type: "select",
        label: "Chat Provider",
        id: "llm_provider",
        options: providerOptions,
        value: selectedProvider
      },
      { type: "select", label: "Chat Model", id: "llm_model", options: initialModelOptions, value: selectedModel },
      { type: "text", label: "Embeddings", text: embeddingText },
      { type: "select", label: "Prompt Template", id: "prompt_template_id", options: promptOptions, value: settings.prompt_template_id || "" }
    ]
  };
  const win = createMiniWindowFromConfig(cfg);
  const wrap = mountModal(win);
  const providerSelect = win.querySelector("#llm_provider");
  const modelSelect = win.querySelector("#llm_model");
  if (!providers.length) {
    if (providerSelect) providerSelect.disabled = true;
    if (modelSelect) modelSelect.disabled = true;
  }
  providerSelect?.addEventListener("change", () => {
    const options = modelOptionsFor(providerSelect.value);
    if (!modelSelect) return;
    modelSelect.innerHTML = "";
    for (const opt of options) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label || opt.value;
      modelSelect.appendChild(option);
    }
    modelSelect.value = options[0]?.value || "";
  });

  const save = document.createElement("button");
  save.className = "btn js-settings-save";
  save.type = "button";
  save.textContent = "Save";
  win.querySelector(".form")?.appendChild(save);
  save.addEventListener("click", async () => {
    const payload = {
      prompt_template_id: win.querySelector("#prompt_template_id")?.value || null,
    };
    if (providerSelect?.value) {
      payload.llm_provider = providerSelect.value;
      payload.llm_model = modelSelect?.value || "";
    }
    await api.patchSettings(userId, payload);
    wrap.remove();
  });
  return win;
}

export async function openPopupModal() {
  const user = await api.getUser();
  const userId = user?.user || "default";

  var mode = localStorage.getItem('theme_mode');
  var color = localStorage.getItem('theme_color');

  if (mode == null) {
      mode = "Light"
  }
  if (color == null) {
      color = "Classic"
  }
  
  console.log(localStorage.getItem('theme_color'));
  const cfg = {
    id: `win_settings_${crypto.randomUUID().slice(0,6)}`,
    window_type: "window_generic",
    title: "Theme Settings",
    modal: true,
    Elements: [
      {
        type: "text",
        label: "Current Theme",
        text: mode + " " + color
      },
      {
        type: "select",
        label: "Mode",
        id: "theme_mode",
        options: [
          { value: "Light", label: "Light" },
          { value: "Dark", label: "Dark" }
        ],
        value: mode,
      },
      {
        type: "select",
        label: "Color Option",
        id: "theme_color",
        options: [
          { value: "Classic", label: "Classic" },
          { value: "Purple", label: "Purple" },
          { value: "Blue", label: "Blue" },
          { value: "Yellow", label: "Yellow" },
          { value: "Green", label: "Green" },
          { value: "High Contrast", label: "High Contrast" }
        ],
        value: color,
      }
    ]
  };
  const win = createPopup(cfg);
  const wrap = mountModal(win);
  const save = document.createElement("button");
  save.className = "btn js-settings-save";
  save.type = "button";
  save.textContent = "Save";
  win.querySelector(".form")?.appendChild(save);
  save.addEventListener("click", async () => {
      const mode = win.querySelector("#theme_mode")?.value;
      const color = win.querySelector("#theme_color")?.value;

      localStorage.setItem("theme_mode", mode);
      localStorage.setItem("theme_color", color);

      applyThemeSettings();

      wrap.remove();
  });

  return win;
}