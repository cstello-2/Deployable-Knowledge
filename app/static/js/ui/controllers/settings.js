// ui/controllers/settings.js — settings modal
import { createMiniWindowFromConfig, mountModal, createPopup } from "../../window.js";
import { dkClient as api } from "../sdk/sdk.js";
import { applyThemeSettings } from "../../theme.js";

export async function openSettingsModal() {
  const user = await api.getUser();
  const userId = user?.user || "default";
  const [settings, prompts] = await Promise.all([
    api.getSettings(userId),
    api.listPromptTemplates(),
  ]);

  const promptOptions = [{ value: "", label: "(default)" }];
  for (const t of prompts) {
    promptOptions.push({ value: t.id, label: t.name || t.id });
  }

  const cfg = {
    id: `win_settings_${crypto.randomUUID().slice(0,6)}`,
    window_type: "window_generic",
    title: "THEME",
    modal: true,
    Elements: [
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
      prompt_template_id: win.querySelector("#prompt_template_id")?.value || null,
    };
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
