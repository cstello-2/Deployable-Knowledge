// ui/controllers/prompt_editor.js — prompt selection + assistant runtime settings
import { dkClient as api } from "../sdk/sdk.js";
import { createMiniWindowFromConfig } from "../../window.js";
import { Store } from "../store.js";

const NONE_VALUE = "__none__";
const CREATE_NEW_VALUE = "__create_your_own__";
const PERSONAS_STORAGE_KEY = "dk_saved_personas";
const PROFILES_STORAGE_KEY = "dk_saved_profiles";

let selectedPromptTemplateId = "rag_chat";
let currentUserId = "default";

export function getSelectedPromptTemplateId() {
  return selectedPromptTemplateId || "rag_chat";
}

export function getSelectedLLMTarget() {
  const providerSelect = document.querySelector("#assistant_llm_provider");
  const modelSelect = document.querySelector("#assistant_llm_model");
  return {
    provider_id: providerSelect?.value || "ollama",
    model_id: modelSelect?.value || "",
  };
}

function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => t.remove(), 2000);
}

function slugifyName(name) {
  return (
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "custom_prompt"
  );
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function uniqueIdFromName(name, existingIds) {
  const base = slugifyName(name);
  let id = base;
  let i = 2;

  while (existingIds.has(id)) {
    id = `${base}_${i}`;
    i += 1;
  }

  return id;
}

function loadSavedProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSavedProfiles(profiles) {
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

function slugifyProfileName(name) {
  return (
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "profile"
  );
}

function uniqueProfileId(name, profiles) {
  const base = slugifyProfileName(name);
  const existingIds = new Set(profiles.map((p) => p.id));

  let id = base;
  let i = 2;

  while (existingIds.has(id)) {
    id = `${base}_${i}`;
    i += 1;
  }

  return id;
}

function loadSavedPersonas() {
  try {
    const raw = localStorage.getItem(PERSONAS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSavedPersonas(personas) {
  localStorage.setItem(PERSONAS_STORAGE_KEY, JSON.stringify(personas));
}

function slugifyPersonaName(name) {
  return (
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "persona"
  );
}

function uniquePersonaId(name, personas) {
  const base = slugifyPersonaName(name);
  const existingIds = new Set(personas.map((p) => p.id));

  let id = base;
  let i = 2;

  while (existingIds.has(id)) {
    id = `${base}_${i}`;
    i += 1;
  }

  return id;
}

export async function initPromptEditor(winId = "win_prompt_editor") {
  const node = document.getElementById(winId);
  if (!node) return;

  const sel = node.querySelector("#tmpl_select");
  const deleteTemplateBtn = node.querySelector("#tmpl_delete");
  const details = node.querySelector("#tmpl_details");
  const nameInput = node.querySelector("#tmpl_name");
  const descInput = node.querySelector("#tmpl_description");
  const systemInput = node.querySelector("#tmpl_system");
  const tempInput = node.querySelector("#assistant_temperature");
  const ragToggle = node.querySelector("#assistant_rag_toggle");
  const maxTokensInput = node.querySelector("#assistant_max_tokens");
  const topKInput = node.querySelector("#assistant_top_k");
  const manageMcpsBtn = node.querySelector("#manage_mcps");
  const manageApiKeysBtn = node.querySelector("#manage_api_keys");
  const providerSelect = node.querySelector("#assistant_llm_provider");
  const modelSelect = node.querySelector("#assistant_llm_model");

  const profileAction = node.querySelector("#profile_action");
  const profileCreateBtn = node.querySelector("#profile_create_btn");
  const profileLoadBtn = node.querySelector("#profile_load_btn");
  const profileDeleteBtn = node.querySelector("#profile_delete_btn");
  const profileCreateRow = node.querySelector("#profile_create_row");
  const profileNameInput = node.querySelector("#profile_name");
  const profileSelectRow = node.querySelector("#profile_select_row");
  const profileSelect = node.querySelector("#profile_select");
  const profileActions = node.querySelector("#profile_actions");
  const profileConfirmBtn = node.querySelector("#profile_confirm");
  const profileSaveBtn = node.querySelector("#profile_save");
  const profileSaveEditsBtn = node.querySelector("#profile_save_edits");

  const personaAction = node.querySelector("#persona_action");
  const personaCreateBtn = node.querySelector("#persona_create_btn");
  const personaLoadBtn = node.querySelector("#persona_load_btn");
  const personaDeleteBtn = node.querySelector("#persona_delete_btn");
  const personaSelectRow = node.querySelector("#persona_select_row");
  const personaSelect = node.querySelector("#persona_select");
  const personaEditor = node.querySelector("#persona_editor");
  const personaNameInput = node.querySelector("#persona_name");
  const personaInput = node.querySelector("#assistant_persona");
  const personaSaveBtn = node.querySelector("#persona_save");
  const personaConfirmRow = node.querySelector("#persona_confirm_row");
  const personaConfirmBtn = node.querySelector("#persona_confirm");

  const saveBtn = node.querySelector("#tmpl_save");
  let providerChangeBound = node.dataset.providerChangeBound === "1";
  let runtimeProviders = [];

  if (
    !sel ||
    !deleteTemplateBtn ||
    !details ||
    !nameInput ||
    !descInput ||
    !systemInput ||
    !tempInput ||
    !maxTokensInput ||
    !topKInput ||
    !manageMcpsBtn ||
    !manageApiKeysBtn ||
    !providerSelect ||
    !modelSelect ||
    !profileAction ||
    !profileCreateRow ||
    !profileNameInput ||
    !profileSelectRow ||
    !profileSelect ||
    !profileActions ||
    !profileConfirmBtn ||
    !profileSaveBtn ||
    !profileSaveEditsBtn ||
    !personaAction ||
    !personaSelectRow ||
    !personaSelect ||
    !personaConfirmRow ||
    !personaConfirmBtn ||
    !personaEditor ||
    !personaNameInput ||
    !personaInput ||
    !personaSaveBtn ||
    !saveBtn
  ) {
    console.warn("Prompt editor failed to initialize because a required element is missing.", {
      sel,
      deleteTemplateBtn,
      details,
      nameInput,
      descInput,
      systemInput,
      tempInput,
      maxTokensInput,
      topKInput,
      manageMcpsBtn,
      manageApiKeysBtn,
      providerSelect,
      modelSelect,
      profileAction,
      profileCreateRow,
      profileNameInput,
      profileSelectRow,
      profileSelect,
      profileActions,
      profileConfirmBtn,
      profileSaveBtn,
      profileSaveEditsBtn,
      personaAction,
      personaSelectRow,
      personaSelect,
      personaConfirmRow,
      personaConfirmBtn,
      personaEditor,
      personaNameInput,
      personaInput,
      personaSaveBtn,
      saveBtn,
    });
    return;
  }

  if (node.dataset.promptEditorInitialized === "true") return;
  node.dataset.promptEditorInitialized = "true";
  if (ragToggle) {
    ragToggle.checked = Store.ragEnabled;
    ragToggle.addEventListener("change", () => {
      Store.ragEnabled = ragToggle.checked;
    });
  }

  let templates = [];
  let currentTemplate = null;
  let loadedProfileId = null;
  let loadedPersonaId = null;
  let providers = [];

  const profileButtons = [profileCreateBtn, profileLoadBtn, profileDeleteBtn].filter(Boolean);
  const personaButtons = [personaCreateBtn, personaLoadBtn, personaDeleteBtn].filter(Boolean);

  function setActiveButton(buttons, activeAction, attrName) {
    for (const btn of buttons) {
      const isActive = btn.dataset[attrName] === activeAction;
      btn.classList.toggle("active", isActive);
    }
  }

  function resetProfileAction() {
    profileAction.value = "";
    setActiveButton(profileButtons, "", "profileAction");
  }

  function resetPersonaAction() {
    personaAction.value = "";
    setActiveButton(personaButtons, "", "personaAction");
  }

  function isProtectedTemplateId(id) {
    return [
      NONE_VALUE,
      CREATE_NEW_VALUE,
      "default",
      "rag_chat",
      "tech_helper",
      "title_summarizer",
    ].includes(id);
  }

  function updateDeleteTemplateButton() {
    const id = sel.value;
    const canDelete = id && !isProtectedTemplateId(id);
    deleteTemplateBtn.style.display = canDelete ? "" : "none";
  }

  function populateModelsForProvider(providerId, selectedModel = null) {
    const provider = providers.find((p) => p.id === providerId);
    const models = provider?.models || [];

    modelSelect.innerHTML = "";
    modelSelect.disabled = false;

    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.id || m;
      opt.textContent = m.label || m.id || m;
      modelSelect.appendChild(opt);
    }

    if (
      selectedModel &&
      !Array.from(modelSelect.options).some((opt) => opt.value === selectedModel)
    ) {
      const opt = document.createElement("option");
      opt.value = selectedModel;
      opt.textContent = `${selectedModel} (current)`;
      modelSelect.appendChild(opt);
    }

    if (!modelSelect.options.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No models available";
      modelSelect.appendChild(opt);
      modelSelect.disabled = true;
    }

    modelSelect.value = selectedModel || modelSelect.options[0]?.value || "";
  }

  function refreshPersonaSelect() {
    const personas = loadSavedPersonas();
    personaSelect.innerHTML = "";

    if (!personas.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No saved personas";
      personaSelect.appendChild(opt);
      personaSelect.disabled = true;
      return;
    }

    personaSelect.disabled = false;

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a persona";
    personaSelect.appendChild(placeholder);

    for (const p of personas) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || p.id;
      personaSelect.appendChild(opt);
    }
  }

  function hidePersonaTools() {
    personaSelectRow.style.display = "none";
    personaEditor.style.display = "none";
    personaConfirmRow.style.display = "none";
    personaNameInput.value = "";
    personaInput.value = "";
    personaSelect.value = "";
  }

  function showCreatePersona() {
    loadedPersonaId = null;
    personaSelectRow.style.display = "none";
    personaConfirmRow.style.display = "none";
    personaEditor.style.display = "";
    personaNameInput.disabled = false;
    personaInput.disabled = false;
    personaNameInput.value = "";
    personaInput.value = "";
    personaSaveBtn.style.display = "";
    personaSaveBtn.textContent = "Save Persona";
  }

  function showLoadPersona() {
    refreshPersonaSelect();
    personaSelectRow.style.display = "";
    personaConfirmRow.style.display = "";
    personaEditor.style.display = "none";
  }

  function showDeletePersona() {
    refreshPersonaSelect();
    personaSelectRow.style.display = "";
    personaConfirmRow.style.display = "";
    personaEditor.style.display = "none";
  }

  function refreshProfileSelect() {
    const profiles = loadSavedProfiles();
    profileSelect.innerHTML = "";

    if (!profiles.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No saved profiles";
      profileSelect.appendChild(opt);
      profileSelect.disabled = true;
      return;
    }

    profileSelect.disabled = false;

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a profile";
    profileSelect.appendChild(placeholder);

    for (const p of profiles) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || p.id;
      profileSelect.appendChild(opt);
    }
  }

  function hideProfileTools() {
    profileCreateRow.style.display = "none";
    profileSelectRow.style.display = "none";
    profileActions.style.display = "none";
    profileConfirmBtn.style.display = "none";
    profileSaveBtn.style.display = "none";
    profileSaveEditsBtn.style.display = "none";
    profileNameInput.value = "";
    profileSelect.value = "";
  }

  function showCreateProfile() {
    profileCreateRow.style.display = "";
    profileSelectRow.style.display = "none";
    profileActions.style.display = "";
    profileConfirmBtn.style.display = "none";
    profileSaveBtn.style.display = "";
    profileSaveEditsBtn.style.display = "none";
    profileNameInput.value = "";

    sel.value = CREATE_NEW_VALUE;
    loadTemplate(CREATE_NEW_VALUE);
    tempInput.value = "0.2";
    maxTokensInput.value = "512";
    topKInput.value = "8";

    resetPersonaAction();
    hidePersonaTools();
    Store.persona = "";
  }

  function showLoadProfile() {
    refreshProfileSelect();
    profileCreateRow.style.display = "none";
    profileSelectRow.style.display = "";
    profileActions.style.display = "";
    profileConfirmBtn.style.display = "";
    profileSaveBtn.style.display = "none";
    profileSaveEditsBtn.style.display = "none";
  }

  function showDeleteProfile() {
    refreshProfileSelect();
    profileCreateRow.style.display = "none";
    profileSelectRow.style.display = "";
    profileActions.style.display = "";
    profileConfirmBtn.style.display = "";
    profileSaveBtn.style.display = "none";
    profileSaveEditsBtn.style.display = "none";
  }

  async function saveRuntimeSettings() {
    const temperature = toNumberOrNull(tempInput.value);
    const maxTokens = toIntOrNull(maxTokensInput.value);
    const topK = toIntOrNull(topKInput.value);

    const payload = {
      llm_provider: providerSelect.value || "ollama",
      llm_model: modelSelect.value || null,
    };

    if (temperature !== null) payload.temperature = temperature;
    if (maxTokens !== null) payload.max_tokens = maxTokens;
    if (topK !== null) payload.top_k = topK;

    try {
      await api.patchSettings(currentUserId, payload);
      showToast("Assistant settings updated");
    } catch (e) {
      alert("Settings save failed: " + e.message);
    }
  }

  async function loadRuntimeSettings() {
    const user = await api.getUser();
    currentUserId = user?.user || "default";

    const [settings, providerData] = await Promise.all([
      api.getSettings(currentUserId),
      api.listModelProviders(true),
    ]);

    tempInput.value = settings?.temperature ?? 0.2;
    maxTokensInput.value = settings?.max_tokens ?? 512;
    topKInput.value = settings?.top_k ?? 8;

    providers = providerData?.chat_providers || [];
    providerSelect.innerHTML = "";

    for (const provider of providers) {
      const opt = document.createElement("option");
      opt.value = provider.id;
      opt.textContent = provider.label || provider.id;
      providerSelect.appendChild(opt);
    }

    if (!providerSelect.options.length) {
      const opt = document.createElement("option");
      opt.value = "ollama";
      opt.textContent = "Ollama";
      providerSelect.appendChild(opt);
      providers = [{ id: "ollama", label: "Ollama", models: [] }];
    }

    providerSelect.value = settings?.llm_provider || providerSelect.options[0]?.value || "ollama";
    populateModelsForProvider(providerSelect.value, settings?.llm_model || null);
  }

  function setPromptDetailMode(mode) {
    const isNone = mode === "none";
    const isCreate = mode === "create";
    const isPreset = mode === "preset";
    const canEditPrompt = isCreate || (isPreset && loadedProfileId);

    details.style.display = isNone ? "none" : "";
    saveBtn.style.display = canEditPrompt ? "" : "none";
    saveBtn.textContent = isCreate ? "Save Template" : "Save Prompt Edits";

    nameInput.disabled = !canEditPrompt;
    descInput.disabled = !canEditPrompt;
    systemInput.disabled = !canEditPrompt;
    nameInput.readOnly = !canEditPrompt;
    descInput.readOnly = !canEditPrompt;
    systemInput.readOnly = !canEditPrompt;
  }

  function fillBlankForm() {
    currentTemplate = null;
    setPromptDetailMode("create");
    nameInput.value = "";
    descInput.value = "";
    systemInput.value = "";
  }

  function fillNoneForm() {
    currentTemplate = null;
    setPromptDetailMode("none");
    nameInput.value = "";
    descInput.value = "";
    systemInput.value = "";
  }

  function fillFormFromTemplate(t) {
    currentTemplate = t;
    setPromptDetailMode("preset");
    nameInput.value = t?.name || "";
    descInput.value = t?.description || "";
    systemInput.value = t?.system || "";
    if (t?.temperature !== undefined && t?.temperature !== null) tempInput.value = t.temperature;
    if (t?.max_tokens !== undefined && t?.max_tokens !== null) maxTokensInput.value = t.max_tokens;
    if (t?.top_k !== undefined && t?.top_k !== null) topKInput.value = t.top_k;
  }

  async function loadTemplate(id) {
    updateDeleteTemplateButton();

    if (id === NONE_VALUE) {
      selectedPromptTemplateId = "rag_chat";
      fillNoneForm();
      return;
    }

    if (id === CREATE_NEW_VALUE) {
      fillBlankForm();
      return;
    }

    selectedPromptTemplateId = id;
    const data = await api.getPromptTemplate(id);
    fillFormFromTemplate(data);
  }

  async function loadList(selectedId = NONE_VALUE) {
    templates = await api.listPromptTemplates();
    sel.innerHTML = "";

    const noneOpt = document.createElement("option");
    noneOpt.value = NONE_VALUE;
    noneOpt.textContent = "None";
    sel.appendChild(noneOpt);

    for (const t of templates) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name || t.id;
      sel.appendChild(opt);
    }

    const createOpt = document.createElement("option");
    createOpt.value = CREATE_NEW_VALUE;
    createOpt.textContent = "Create Your Own";
    sel.appendChild(createOpt);

    const exists = Array.from(sel.options).some((opt) => opt.value === selectedId);
    sel.value = exists ? selectedId : NONE_VALUE;
    await loadTemplate(sel.value);
    updateDeleteTemplateButton();
  }

  async function saveCurrentProfile() {
    const profileName = profileNameInput.value.trim();

    if (!profileName) {
      alert("Profile name is required.");
      return;
    }

    let promptTemplateId = sel.value;

    if (sel.value === CREATE_NEW_VALUE) {
      const templateName = nameInput.value.trim();
      const description = descInput.value.trim();
      const system = systemInput.value.trim();

      if (!templateName) {
        alert("Prompt template name is required.");
        return;
      }

      if (!system) {
        alert("Prompt template system instructions are required.");
        return;
      }

      const existingTemplateIds = new Set(templates.map((t) => t.id));
      const newTemplateId = uniqueIdFromName(templateName, existingTemplateIds);

      const templatePayload = {
        id: newTemplateId,
        name: templateName,
        description,
        system,
        user_format: "{user}",
        context_item_format: "- {chunk} (source: {source|unknown})",
        context_header: "Relevant context:",
        context_join: "\n",
        persona_format: "Persona: {persona}",
        history_separator: "\n",
        include_history: true,
        temperature: toNumberOrNull(tempInput.value) ?? 0.2,
        max_tokens: toIntOrNull(maxTokensInput.value) ?? 512,
        top_k: toIntOrNull(topKInput.value) ?? 8,
      };

      await api.savePromptTemplate(templatePayload.id, templatePayload);
      await loadList(templatePayload.id);

      promptTemplateId = templatePayload.id;
      selectedPromptTemplateId = templatePayload.id;
    }

    const profiles = loadSavedProfiles();
    const id = uniqueProfileId(profileName, profiles);
    let activePersonaText = Store.persona || "";
    let selectedPersonaId = personaSelect.value || loadedPersonaId || "";

    const personaEditorVisible = personaEditor.style.display !== "none";
    const personaName = personaNameInput.value.trim();
    const personaText = personaInput.value.trim();

    if (personaEditorVisible && personaText) {
      const personas = loadSavedPersonas();
      let personaId = selectedPersonaId || loadedPersonaId;

      if (!personaId || !personas.some((p) => p.id === personaId)) {
        personaId = uniquePersonaId(personaName || profileName, personas);
        personas.push({
          id: personaId,
          name: personaName || `${profileName} Persona`,
          text: personaText,
          created_at: new Date().toISOString(),
        });
        saveSavedPersonas(personas);
        refreshPersonaSelect();
      }

      activePersonaText = personaText;
      selectedPersonaId = personaId;
      loadedPersonaId = personaId;
      Store.persona = personaText;
    }

    const profile = {
      id,
      name: profileName,
      prompt_template_id: promptTemplateId,
      temperature: toNumberOrNull(tempInput.value) ?? 0.2,
      max_tokens: toIntOrNull(maxTokensInput.value) ?? 512,
      top_k: toIntOrNull(topKInput.value) ?? 8,
      model_id: modelSelect.value || "",
      provider_id: providerSelect.value || "ollama",
      persona_id: selectedPersonaId,
      persona_text: activePersonaText,
      created_at: new Date().toISOString(),
    };

    profiles.push(profile);
    saveSavedProfiles(profiles);
    await saveRuntimeSettings();
    refreshProfileSelect();
    resetProfileAction();
    hideProfileTools();
    showToast("Profile saved");
  }

  async function saveLoadedProfileEdits() {
    if (!loadedProfileId) {
      alert("No loaded profile to edit.");
      return;
    }

    const profiles = loadSavedProfiles();
    const index = profiles.findIndex((p) => p.id === loadedProfileId);

    if (index === -1) {
      alert("Loaded profile was not found.");
      loadedProfileId = null;
      refreshProfileSelect();
      hideProfileTools();
      return;
    }

    let promptTemplateId = sel.value;

    if (sel.value === CREATE_NEW_VALUE) {
      const templateName = nameInput.value.trim();
      const description = descInput.value.trim();
      const system = systemInput.value.trim();

      if (!templateName) {
        alert("Prompt template name is required.");
        return;
      }

      if (!system) {
        alert("Prompt template system instructions are required.");
        return;
      }

      const existingTemplateIds = new Set(templates.map((t) => t.id));
      const newTemplateId = uniqueIdFromName(templateName, existingTemplateIds);

      const templatePayload = {
        id: newTemplateId,
        name: templateName,
        description,
        system,
        user_format: "{user}",
        context_item_format: "- {chunk} (source: {source|unknown})",
        context_header: "Relevant context:",
        context_join: "\n",
        persona_format: "Persona: {persona}",
        history_separator: "\n",
        include_history: true,
        temperature: toNumberOrNull(tempInput.value) ?? 0.2,
        max_tokens: toIntOrNull(maxTokensInput.value) ?? 512,
        top_k: toIntOrNull(topKInput.value) ?? 8,
      };

      await api.savePromptTemplate(templatePayload.id, templatePayload);
      await loadList(templatePayload.id);

      promptTemplateId = templatePayload.id;
      selectedPromptTemplateId = templatePayload.id;
    }

    let activePersonaText = Store.persona || "";
    let selectedPersonaId = personaSelect.value || loadedPersonaId || "";
    const personaEditorVisible = personaEditor.style.display !== "none";
    const personaName = personaNameInput.value.trim();
    const personaText = personaInput.value.trim();

    if (personaEditorVisible && personaText) {
      const personas = loadSavedPersonas();
      let personaId = selectedPersonaId || loadedPersonaId;

      if (!personaId || !personas.some((p) => p.id === personaId)) {
        personaId = uniquePersonaId(personaName || profiles[index].name, personas);
        personas.push({
          id: personaId,
          name: personaName || `${profiles[index].name} Persona`,
          text: personaText,
          created_at: new Date().toISOString(),
        });
        saveSavedPersonas(personas);
        refreshPersonaSelect();
      }

      activePersonaText = personaText;
      selectedPersonaId = personaId;
      loadedPersonaId = personaId;
      Store.persona = personaText;
    }

    profiles[index] = {
      ...profiles[index],
      prompt_template_id: promptTemplateId,
      temperature: toNumberOrNull(tempInput.value) ?? 0.2,
      max_tokens: toIntOrNull(maxTokensInput.value) ?? 512,
      top_k: toIntOrNull(topKInput.value) ?? 8,
      model_id: modelSelect.value || "",
      provider_id: providerSelect.value || "ollama",
      persona_id: selectedPersonaId,
      persona_text: activePersonaText,
      updated_at: new Date().toISOString(),
    };

    saveSavedProfiles(profiles);
    await saveRuntimeSettings();
    refreshProfileSelect();
    showToast("Profile edits saved");
  }
  
  function setPromptDetailMode(mode) {
    const isNone = mode === "none";
    const isCreate = mode === "create";
    const isPreset = mode === "preset";

    const canEditPrompt =
      isCreate ||
      (isPreset && loadedProfileId);

    details.style.display = isNone ? "none" : "";
    saveBtn.style.display = canEditPrompt ? "" : "none";

    saveBtn.textContent = isCreate ? "Save Template" : "Save Prompt Edits";

    nameInput.disabled = !canEditPrompt;
    descInput.disabled = !canEditPrompt;
    systemInput.disabled = !canEditPrompt;

    nameInput.readOnly = !canEditPrompt;
    descInput.readOnly = !canEditPrompt;
    systemInput.readOnly = !canEditPrompt;
  }


  function fillBlankForm() {
    currentTemplate = null;
    setPromptDetailMode("create");

    nameInput.value = "";
    descInput.value = "";
    systemInput.value = "";
  }

  function fillNoneForm() {
    currentTemplate = null;
    setPromptDetailMode("none");

    nameInput.value = "";
    descInput.value = "";
    systemInput.value = "";
  }

  function fillFormFromTemplate(t) {
    currentTemplate = t;
    setPromptDetailMode("preset");

    nameInput.value = t?.name || "";
    descInput.value = t?.description || "";
    systemInput.value = t?.system || "";

    if (t?.temperature !== undefined && t?.temperature !== null) {
      tempInput.value = t.temperature;
    }

    if (t?.max_tokens !== undefined && t?.max_tokens !== null) {
      maxTokensInput.value = t.max_tokens;
    }

    if (t?.top_k !== undefined && t?.top_k !== null) {
      topKInput.value = t.top_k;
    }
  }

  async function saveRuntimeSettings() {
    const temperature = toNumberOrNull(tempInput.value);
    const maxTokens = toIntOrNull(maxTokensInput.value);
    const topK = toIntOrNull(topKInput.value);

    const payload = {};
    payload.provider_id = providerSelect.value || "ollama";
    payload.model_id = modelSelect.value || "";

    if (temperature !== null) {
      payload.temperature = temperature;
    }

    if (maxTokens !== null) {
      payload.max_tokens = maxTokens;
    }

    if (topK !== null) {
      payload.top_k = topK;
    }

    try {
      await api.patchSettings(currentUserId, payload);
      showToast("Assistant settings updated");
    } catch (e) {
      alert("Settings save failed: " + e.message);
    }
  }

  function populateModelsForProvider(providerId, selectedModel = null) {
    const provider = runtimeProviders.find((p) => p.id === providerId);
    const models = provider?.models || [];

    modelSelect.innerHTML = "";
    modelSelect.disabled = false;

    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.id || m;
      opt.textContent = m.label || m.id || m;
      modelSelect.appendChild(opt);
    }

    if (selectedModel && !Array.from(modelSelect.options).some((opt) => opt.value === selectedModel)) {
      const opt = document.createElement("option");
      opt.value = selectedModel;
      opt.textContent = `${selectedModel} (current)`;
      modelSelect.appendChild(opt);
    }

    if (!modelSelect.options.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No models available";
      modelSelect.appendChild(opt);
      modelSelect.disabled = true;
    }

    modelSelect.value = selectedModel || modelSelect.options[0]?.value || "";
  }

  async function loadRuntimeSettings() {
    const user = await api.getUser();
    currentUserId = user?.user || "default";

    const [settings, providerData] = await Promise.all([
      api.getSettings(currentUserId),
      api.listProviders({ refresh: true }),
    ]);

    tempInput.value = settings?.temperature ?? 0.2;
    maxTokensInput.value = settings?.max_tokens ?? 512;
    topKInput.value = settings?.top_k ?? 8;

    runtimeProviders = providerData?.providers || [];
    providerSelect.innerHTML = "";

    for (const provider of runtimeProviders) {
      const opt = document.createElement("option");
      opt.value = provider.id;
      opt.textContent = provider.label || provider.id;
      providerSelect.appendChild(opt);
    }

    if (!providerSelect.options.length) {
      const opt = document.createElement("option");
      opt.value = "ollama";
      opt.textContent = "Ollama";
      providerSelect.appendChild(opt);
    }

    const savedProviderId = settings?.provider_id || providerSelect.value;
    providerSelect.value = runtimeProviders.some((provider) => provider.id === savedProviderId)
      ? savedProviderId
      : providerSelect.options[0]?.value || "ollama";

    populateModelsForProvider(providerSelect.value, settings?.model_id || null);

    if (!providerChangeBound) {
      providerSelect.addEventListener("change", () => {
        populateModelsForProvider(providerSelect.value, null);
        saveRuntimeSettings();
      });
      providerChangeBound = true;
      node.dataset.providerChangeBound = "1";
    }
  }

  async function openApiKeyManager() {
    const root = document.createElement("div");
    root.className = "api-key-manager-overlay";
    root.innerHTML = `
      <div class="api-key-manager" role="dialog" aria-modal="true" aria-labelledby="api-key-manager-title">
        <div class="api-key-manager-head">
          <h2 id="api-key-manager-title">API Keys</h2>
          <button type="button" class="btn api-key-manager-close" aria-label="Close">Close</button>
        </div>
        <div class="api-key-provider-list"></div>
      </div>
    `;
    document.body.appendChild(root);

    const listEl = root.querySelector(".api-key-provider-list");
    const close = () => root.remove();
    root.querySelector(".api-key-manager-close")?.addEventListener("click", close);
    root.addEventListener("click", (ev) => {
      if (ev.target === root) close();
    });

    async function render() {
      listEl.innerHTML = `<div class="api-key-manager-empty">Loading providers...</div>`;
      const data = await api.listProviders({ includeUnavailable: true, refresh: true });
      const providers = data?.providers || [];

      listEl.innerHTML = "";
      if (!providers.length) {
        listEl.innerHTML = `<div class="api-key-manager-empty">No providers found.</div>`;
        return;
      }

      for (const provider of providers) {
        const row = document.createElement("div");
        row.className = "api-key-provider-row";
        const status = provider.available ? "Connected" : "Not connected";

        row.innerHTML = `
          <div class="api-key-provider-main">
            <div>
              <div class="api-key-provider-name">${provider.label || provider.id}</div>
              <div class="api-key-provider-status ${provider.available ? "connected" : ""}">${status}</div>
            </div>
          </div>
          <div class="api-key-provider-controls">
            <input class="input api-key-input" type="password" autocomplete="off"
              placeholder="${provider.has_api_key ? "Saved API key" : "API key"}"
              ${provider.api_key_required ? "" : "disabled"}>
            <div class="api-key-provider-actions">
              <button type="button" class="btn api-key-save">Save</button>
              <button type="button" class="btn api-key-clear" ${provider.api_key_required ? "" : "disabled"}>Clear</button>
            </div>
          </div>
        `;

        const keyInput = row.querySelector(".api-key-input");
        const saveButton = row.querySelector(".api-key-save");
        const clearButton = row.querySelector(".api-key-clear");

        saveButton.addEventListener("click", async () => {
          const payload = {};
          if (provider.api_key_required && keyInput.value.trim()) {
            payload.api_key = keyInput.value.trim();
          }

          if (!Object.keys(payload).length) {
            showToast("Enter an API key to save");
            return;
          }

          try {
            await api.patchProvider(provider.id, payload);
            await loadRuntimeSettings();
            await render();
            showToast("Provider saved");
          } catch (e) {
            alert("Provider save failed: " + e.message);
          }
        });

        clearButton.addEventListener("click", async () => {
          try {
            await api.clearProviderApiKey(provider.id);
            await loadRuntimeSettings();
            await render();
            showToast("API key cleared");
          } catch (e) {
            alert("API key clear failed: " + e.message);
          }
        });

        listEl.appendChild(row);
      }
    }

    try {
      await render();
    } catch (e) {
      listEl.innerHTML = `<div class="api-key-manager-empty">Provider load failed: ${e.message}</div>`;
    }
  }

  async function loadTemplate(id) {
    updateDeleteTemplateButton();
    if (id === NONE_VALUE) {
      selectedPromptTemplateId = "rag_chat";
      fillNoneForm();
      return;
    }

    if (id === CREATE_NEW_VALUE) {
      fillBlankForm();
      return;
    }

    selectedPromptTemplateId = id;
    const data = await api.getPromptTemplate(id);
    fillFormFromTemplate(data);
  }

  async function loadList(selectedId = NONE_VALUE) {
    templates = await api.listPromptTemplates();

    sel.innerHTML = "";

    const noneOpt = document.createElement("option");
    noneOpt.value = NONE_VALUE;
    noneOpt.textContent = "None";
    sel.appendChild(noneOpt);

    for (const t of templates) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name || t.id;
      sel.appendChild(opt);
    }

    const createOpt = document.createElement("option");
    createOpt.value = CREATE_NEW_VALUE;
    createOpt.textContent = "Create Your Own";
    sel.appendChild(createOpt);

    sel.value = selectedId;
    await loadTemplate(sel.value);
  }

  sel.addEventListener("change", () => loadTemplate(sel.value));

  deleteTemplateBtn.addEventListener("click", async () => {
    const id = sel.value;

    if (!id || isProtectedTemplateId(id)) {
      return;
    }

    const selectedOption = sel.options[sel.selectedIndex];
    const label = selectedOption?.textContent || id;

    const ok = confirm(
      `Delete prompt template "${label}"?\n\nThis will remove prompts/${id}.json. Profiles and personas will NOT be deleted.`
    );

    if (!ok) return;

    try {
      await api.deletePromptTemplate(id);

      if (selectedPromptTemplateId === id) {
        selectedPromptTemplateId = "rag_chat";
      }

      currentTemplate = null;

      await loadList(NONE_VALUE);
      fillNoneForm();
      updateDeleteTemplateButton();

      showToast("Prompt template deleted");
    } catch (e) {
      alert("Prompt template delete failed: " + e.message);
    }
  });

  function handleProfileAction(action) {
    if (action !== "load") {
      loadedProfileId = null;
      profileSaveEditsBtn.style.display = "none";

      if (sel.value === CREATE_NEW_VALUE) {
        setPromptDetailMode("create");
      } else if (sel.value === NONE_VALUE) {
        setPromptDetailMode("none");
      } else {
        setPromptDetailMode("preset");
      }
    }

    if (action === "create") {
      showCreateProfile();
      return;
    }

    if (action === "load") {
      showLoadProfile();
      return;
    }

    if (action === "delete") {
      showDeleteProfile();
      return;
    }

    hideProfileTools();
  }

  function handlePersonaAction(action) {
    if (action === "create") {
      showCreatePersona();
      return;
    }

    if (action === "load") {
      showLoadPersona();
      return;
    }

    if (action === "delete") {
      showDeletePersona();
      return;
    }

    hidePersonaTools();
  }

  sel.addEventListener("change", () => loadTemplate(sel.value));

  deleteTemplateBtn.addEventListener("click", async () => {
    const id = sel.value;
    if (!id || isProtectedTemplateId(id)) return;

    const selectedOption = sel.options[sel.selectedIndex];
    const label = selectedOption?.textContent || id;

    const ok = confirm(
      `Delete prompt template "${label}"?\n\nThis will remove prompts/${id}.json. Profiles and personas will NOT be deleted.`
    );
    if (!ok) return;

    try {
      await api.deletePromptTemplate(id);
      if (selectedPromptTemplateId === id) selectedPromptTemplateId = "rag_chat";
      currentTemplate = null;
      await loadList(NONE_VALUE);
      fillNoneForm();
      updateDeleteTemplateButton();
      showToast("Prompt template deleted");
    } catch (e) {
      alert("Prompt template delete failed: " + e.message);
    }
  });

  if (profileButtons.length) {
    for (const btn of profileButtons) {
      btn.addEventListener("click", () => {
        const action = btn.dataset.profileAction;

        if (profileAction.value === action) {
          resetProfileAction();
          handleProfileAction("");
          return;
        }

        profileAction.value = action;
        setActiveButton(profileButtons, action, "profileAction");
        handleProfileAction(action);
      });
    }
  } else {
    profileAction.addEventListener("change", () => handleProfileAction(profileAction.value));
  }

  profileSaveBtn.addEventListener("click", async () => {
    try {
      await saveCurrentProfile();
    } catch (e) {
      alert("Profile save failed: " + e.message);
    }
  });

  profileSaveEditsBtn.addEventListener("click", async () => {
    try {
      await saveLoadedProfileEdits();
    } catch (e) {
      alert("Profile edit save failed: " + e.message);
    }
  });

  profileConfirmBtn.addEventListener("click", async () => {
    const profileId = profileSelect.value;

    if (!profileId) {
      alert("Select a profile first.");
      return;
    }

    const profiles = loadSavedProfiles();
    const profile = profiles.find((p) => p.id === profileId);

    if (!profile) {
      alert("Profile not found.");
      refreshProfileSelect();
      return;
    }

    if (profileAction.value === "delete") {
      const ok = confirm(`Delete profile "${profile.name || profile.id}"?`);
      if (!ok) return;

      const updated = profiles.filter((p) => p.id !== profileId);
      saveSavedProfiles(updated);

      if (loadedProfileId === profileId) loadedProfileId = null;

      refreshProfileSelect();
      resetProfileAction();
      hideProfileTools();
      showToast("Profile deleted");
      return;
    }

    if (profileAction.value === "load") {
      loadedProfileId = profile.id;
      const templateId = profile.prompt_template_id || NONE_VALUE;
      const templateExists = Array.from(sel.options).some((opt) => opt.value === templateId);

      if (templateExists) {
        sel.value = templateId;
        await loadTemplate(templateId);
      } else {
        sel.value = NONE_VALUE;
        selectedPromptTemplateId = "rag_chat";
        fillNoneForm();
        showToast("Profile prompt template was missing, using None");
      }

      tempInput.value = profile.temperature ?? 0.2;
      maxTokensInput.value = profile.max_tokens ?? 512;
      topKInput.value = profile.top_k ?? 8;
      providerSelect.value = profile.provider_id || "ollama";
      populateModelsForProvider(providerSelect.value, profile.model_id || null);

      if (profile.model_id) {
        let exists = false;

        for (const opt of modelSelect.options) {
          if (opt.value === profile.model_id) {
            exists = true;
            break;
          }
        }

        if (!exists) {
          const opt = document.createElement("option");
          opt.value = profile.model_id;
          opt.textContent = `${profile.model_id} (profile)`;
          modelSelect.appendChild(opt);
        }

        modelSelect.value = profile.model_id;
      }

      Store.persona = profile.persona_text || "";
      loadedPersonaId = profile.persona_id || null;
      resetPersonaAction();
      hidePersonaTools();

      if (profile.persona_text) {
        personaEditor.style.display = "";
        personaNameInput.disabled = false;
        personaInput.disabled = false;
        personaSaveBtn.style.display = "";
        personaSaveBtn.textContent = loadedPersonaId ? "Save Persona Edits" : "Save Persona";

        const personas = loadSavedPersonas();
        const p = personas.find((x) => x.id === loadedPersonaId);
        personaNameInput.value = p?.name || "Profile Persona";
        personaInput.value = profile.persona_text;
      }

      await saveRuntimeSettings();

      profileCreateRow.style.display = "none";
      profileSelectRow.style.display = "none";
      profileActions.style.display = "";
      profileConfirmBtn.style.display = "none";
      profileSaveBtn.style.display = "none";
      profileSaveEditsBtn.style.display = "";

      resetProfileAction();
      showToast(`Loaded profile: ${profile.name || profile.id}`);
    }
  });

  tempInput.addEventListener("change", saveRuntimeSettings);
  maxTokensInput.addEventListener("change", saveRuntimeSettings);
  topKInput.addEventListener("change", saveRuntimeSettings);
  modelSelect.addEventListener("change", saveRuntimeSettings);

  providerSelect.addEventListener("change", () => {
    populateModelsForProvider(providerSelect.value, null);
    saveRuntimeSettings();
  });

  manageApiKeysBtn.addEventListener("click", () => {
    openApiKeyManager();
  });
  manageMcpsBtn.addEventListener("click", () => showToast("MCP manager coming soon"));
  

  personaSaveBtn.addEventListener("click", () => {
    const name = personaNameInput.value.trim();
    const text = personaInput.value.trim();

    if (!name) {
      alert("Persona name is required.");
      return;
    }

    if (!text) {
      alert("Persona text is required.");
      return;
    }

    const personas = loadSavedPersonas();

    if (loadedPersonaId) {
      const index = personas.findIndex((p) => p.id === loadedPersonaId);

      if (index !== -1) {
        personas[index] = {
          ...personas[index],
          name,
          text,
          updated_at: new Date().toISOString(),
        };
        saveSavedPersonas(personas);
        Store.persona = text;
        refreshPersonaSelect();
        showToast("Persona edits saved");
        return;
      }
    }

    const id = uniquePersonaId(name, personas);
    personas.push({
      id,
      name,
      text,
      created_at: new Date().toISOString(),
    });

    saveSavedPersonas(personas);
    loadedPersonaId = id;
    Store.persona = text;
    refreshPersonaSelect();
    personaSaveBtn.textContent = "Save Persona Edits";
    showToast("Persona saved and applied");
  });

  if (personaButtons.length) {
    for (const btn of personaButtons) {
      btn.addEventListener("click", () => {
        const action = btn.dataset.personaAction;

        if (personaAction.value === action) {
          resetPersonaAction();
          handlePersonaAction("");
          return;
        }

        personaAction.value = action;
        setActiveButton(personaButtons, action, "personaAction");
        handlePersonaAction(action);
      });
    }
  } else {
    personaAction.addEventListener("change", () => handlePersonaAction(personaAction.value));
  }

  personaConfirmBtn.addEventListener("click", () => {
    const personaId = personaSelect.value;

    if (!personaId) {
      alert("Select a persona first.");
      return;
    }

    const personas = loadSavedPersonas();
    const persona = personas.find((p) => p.id === personaId);

    if (!persona) {
      alert("Persona not found.");
      refreshPersonaSelect();
      return;
    }

    if (personaAction.value === "load") {
      loadedPersonaId = persona.id;
      personaNameInput.value = persona.name || "";
      personaInput.value = persona.text || "";
      personaEditor.style.display = "";
      personaNameInput.disabled = false;
      personaInput.disabled = false;
      personaSaveBtn.style.display = "";
      personaSaveBtn.textContent = "Save Persona Edits";
      Store.persona = persona.text || "";
      showToast(`Loaded persona: ${persona.name || persona.id}`);
      return;
    }

    if (personaAction.value === "delete") {
      const ok = confirm(`Delete persona "${persona.name || persona.id}"?`);
      if (!ok) return;

      const updated = personas.filter((p) => p.id !== personaId);
      saveSavedPersonas(updated);

      if ((Store.persona || "") === (persona.text || "")) Store.persona = "";
      if (loadedPersonaId === personaId) loadedPersonaId = null;

      refreshPersonaSelect();
      personaEditor.style.display = "none";
      personaConfirmRow.style.display = "none";
      showToast("Persona deleted");
    }
  });

  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const description = descInput.value.trim();
    const system = systemInput.value.trim();

    if (!name) {
      alert("Name is required.");
      return;
    }

    if (!system) {
      alert("System is required.");
      return;
    }

    if (sel.value === CREATE_NEW_VALUE) {
      const existingIds = new Set(templates.map((t) => t.id));
      const id = uniqueIdFromName(name, existingIds);

      const payload = {
        id,
        name,
        description,
        system,
        user_format: "{user}",
        context_item_format: "- {chunk} (source: {source|unknown})",
        context_header: "Relevant context:",
        context_join: "\n",
        persona_format: "Persona: {persona}",
        history_separator: "\n",
        include_history: true,
        top_k: toIntOrNull(topKInput.value) ?? 8,
        temperature: toNumberOrNull(tempInput.value) ?? 0.2,
        max_tokens: toIntOrNull(maxTokensInput.value) ?? 512,
      };

      try {
        await api.savePromptTemplate(payload.id, payload);
        showToast("Created prompt template");
        selectedPromptTemplateId = payload.id;
        await loadList(payload.id);
      } catch (e) {
        alert("Save failed: " + e.message);
      }

      return;
    }

    if (loadedProfileId && currentTemplate?.id && sel.value !== NONE_VALUE) {
      const payload = {
        ...(currentTemplate || {}),
        id: currentTemplate.id,
        name,
        description,
        system,
        user_format: currentTemplate?.user_format || "{user}",
        context_item_format:
          currentTemplate?.context_item_format || "- {chunk} (source: {source|unknown})",
        context_header: currentTemplate?.context_header || "Relevant context:",
        context_join: currentTemplate?.context_join || "\n",
        persona_format: currentTemplate?.persona_format || "Persona: {persona}",
        history_separator: currentTemplate?.history_separator || "\n",
        include_history:
          typeof currentTemplate?.include_history === "boolean"
            ? currentTemplate.include_history
            : true,
        temperature: toNumberOrNull(tempInput.value) ?? currentTemplate?.temperature ?? 0.2,
        max_tokens: toIntOrNull(maxTokensInput.value) ?? currentTemplate?.max_tokens ?? 512,
        top_k: toIntOrNull(topKInput.value) ?? currentTemplate?.top_k ?? 8,
      };

      try {
        await api.savePromptTemplate(payload.id, payload);
        currentTemplate = payload;
        showToast("Prompt template edits saved");
        await loadList(payload.id);
      } catch (e) {
        alert("Prompt template edit save failed: " + e.message);
      }
    }
  });

  hidePersonaTools();
  refreshPersonaSelect();

  hideProfileTools();
  refreshProfileSelect();

  await loadRuntimeSettings();
  await loadList(NONE_VALUE);
}

export async function openPromptEditor() {
  let node = document.getElementById("win_prompt_editor");

  if (!node) {
    const cfg = {
      id: "win_prompt_editor",
      window_type: "window_prompt_editor",
      title: "Prompt Selection",
      col: "right",
      unique: true,
    };

    node = createMiniWindowFromConfig(cfg);
    node.style.minWidth = "480px";
    document.getElementById("col-right").appendChild(node);
  }

  await initPromptEditor("win_prompt_editor");
}