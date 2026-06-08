<script lang="ts">
  import { onMount } from "svelte";
  import BaseWindow from "$lib/components/BaseWindow.svelte";
  import { dkClient, type PromptTemplate, type ProviderRecord } from "$lib/sdk";
  import type { WindowInstanceProps } from "./index.ts";

  let {
    id,
    title,
    closable = false,
    collapsed = false,
    onToggleCollapse = () => {},
    onClose = () => {},
  }: WindowInstanceProps = $props();

  const NONE_VALUE = "__none__";
  const CREATE_NEW_VALUE = "__create_your_own__";
  const PERSONAS_STORAGE_KEY = "dk_saved_personas";
  const PROFILES_STORAGE_KEY = "dk_saved_profiles";

  type SavedPersona = {
    id: string;
    name: string;
    text: string;
    created_at?: string;
    updated_at?: string;
  };

  type SavedProfile = {
    id: string;
    name: string;
    prompt_template_id: string;
    temperature: number;
    max_tokens: number;
    top_k: number;
    model_id: string;
    provider_id: string;
    persona_id?: string | null;
    persona_text?: string;
    created_at?: string;
    updated_at?: string;
  };

  type ApiKeyRow = ProviderRecord & {
    available?: boolean;
    api_key_required?: boolean;
    has_api_key?: boolean;
  };

  let currentUserId = $state("default");

  let templates = $state<PromptTemplate[]>([]);
  let currentTemplate = $state<PromptTemplate | null>(null);
  let selectedPromptTemplateId = $state("rag_chat");

  let templateSelect = $state(NONE_VALUE);
  let templateName = $state("");
  let templateDescription = $state("");
  let templateSystem = $state("");

  let temperature = $state("0.2");
  let topK = $state("8");
  let maxTokens = $state("512");

  let providers = $state<ProviderRecord[]>([]);
  let providerId = $state("ollama");
  let modelId = $state("");
  let modelOptions = $state<Array<{ value: string; label: string }>>([]);

  let profileAction = $state("");
  let profileName = $state("");
  let selectedProfileId = $state("");
  let loadedProfileId = $state<string | null>(null);
  let profiles = $state<SavedProfile[]>([]);

  let personaAction = $state("");
  let selectedPersonaId = $state("");
  let loadedPersonaId = $state<string | null>(null);
  let personaName = $state("");
  let personaText = $state("");
  let personas = $state<SavedPersona[]>([]);

  let apiKeyManagerOpen = $state(false);
  let apiKeyProvidersPromise = $state<Promise<ApiKeyRow[]> | null>(null);
  let apiKeyInputs = $state<Record<string, string>>({});

  let toastMessage = $state("");

  const protectedTemplateIds = [
    NONE_VALUE,
    CREATE_NEW_VALUE,
    "default",
    "rag_chat",
    "tech_helper",
    "title_summarizer",
  ];

  const showProfileCreate = $derived(profileAction === "create");
  const showProfileSelect = $derived(profileAction === "load" || profileAction === "delete");
  const showProfileActions = $derived(profileAction === "create" || profileAction === "load" || profileAction === "delete");
  const showProfileConfirm = $derived(profileAction === "load" || profileAction === "delete");
  const showProfileSave = $derived(profileAction === "create");
  const showProfileSaveEdits = $derived(Boolean(loadedProfileId) && profileAction === "");

  const showPersonaSelect = $derived(personaAction === "load" || personaAction === "delete");
  const showPersonaConfirm = $derived(personaAction === "load" || personaAction === "delete");
  const showPersonaEditor = $derived(personaAction === "create" || Boolean(loadedPersonaId && personaText));

  const promptDetailsVisible = $derived(templateSelect !== NONE_VALUE);
  const promptCanEdit = $derived(
    templateSelect === CREATE_NEW_VALUE || (templateSelect !== NONE_VALUE && Boolean(loadedProfileId)),
  );

  const saveTemplateVisible = $derived(promptCanEdit);
  const saveTemplateLabel = $derived(
    templateSelect === CREATE_NEW_VALUE ? "Save Template" : "Save Prompt Edits",
  );

  const deleteTemplateVisible = $derived(
    Boolean(templateSelect) && !protectedTemplateIds.includes(templateSelect),
  );

  function showToast(message: string) {
    toastMessage = message;

    window.setTimeout(() => {
      if (toastMessage === message) {
        toastMessage = "";
      }
    }, 2000);
  }

  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  function slugifyName(name: string, fallback: string) {
    return (
      String(name || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || fallback
    );
  }

  function toNumberOrNull(value: string) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function toIntOrNull(value: string) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return null;
    }

    const number = parseInt(value, 10);
    return Number.isFinite(number) ? number : null;
  }

  function uniqueIdFromName(name: string, existingIds: Set<string>, fallback: string) {
    const base = slugifyName(name, fallback);
    let nextId = base;
    let count = 2;

    while (existingIds.has(nextId)) {
      nextId = `${base}_${count}`;
      count += 1;
    }

    return nextId;
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

  function saveSavedProfiles(nextProfiles: SavedProfile[]) {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(nextProfiles));
    profiles = nextProfiles;
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

  function saveSavedPersonas(nextPersonas: SavedPersona[]) {
    localStorage.setItem(PERSONAS_STORAGE_KEY, JSON.stringify(nextPersonas));
    personas = nextPersonas;
  }

  function saveActivePersona(text: string) {
    localStorage.setItem("persona", text || "");
  }

  function resetProfileAction() {
    profileAction = "";
    profileName = "";
    selectedProfileId = "";
  }

  function resetPersonaAction() {
    personaAction = "";
    selectedPersonaId = "";
  }

  function hidePersonaTools() {
    personaAction = "";
    selectedPersonaId = "";
    personaName = "";
    personaText = "";
  }

  function optionValue(model: unknown) {
    if (typeof model === "string") return model;

    const typed = model as Record<string, unknown>;
    return String(typed.id ?? typed.name ?? typed.label ?? "");
  }

  function optionLabel(model: unknown) {
    if (typeof model === "string") return model;

    const typed = model as Record<string, unknown>;
    return String(typed.label ?? typed.id ?? typed.name ?? "");
  }

  function populateModelsForProvider(nextProviderId: string, selectedModel: string | null = null) {
    const provider = providers.find((item) => item.id === nextProviderId);
    const models = ((provider?.models || []) as unknown[]).map((model) => ({
      value: optionValue(model),
      label: optionLabel(model),
    }));

    if (selectedModel && !models.some((model) => model.value === selectedModel)) {
      models.push({
        value: selectedModel,
        label: `${selectedModel} (current)`,
      });
    }

    if (!models.length) {
      modelOptions = [
        {
          value: "",
          label: "No models available",
        },
      ];
      modelId = "";
      return;
    }

    modelOptions = models;
    modelId = selectedModel || models[0]?.value || "";
  }

  function setPromptDetailModeForTemplate(template: PromptTemplate | null) {
    currentTemplate = template;

    if (!template) {
      templateName = "";
      templateDescription = "";
      templateSystem = "";
      return;
    }

    templateName = String(template.name || "");
    templateDescription = String(template.description || "");
    templateSystem = String(template.system || "");

    if (template.temperature !== undefined && template.temperature !== null) {
      temperature = String(template.temperature);
    }

    if (template.max_tokens !== undefined && template.max_tokens !== null) {
      maxTokens = String(template.max_tokens);
    }

    if (template.top_k !== undefined && template.top_k !== null) {
      topK = String(template.top_k);
    }
  }

  async function loadTemplate(templateId: string) {
    if (templateId === NONE_VALUE) {
      selectedPromptTemplateId = "rag_chat";
      currentTemplate = null;
      templateName = "";
      templateDescription = "";
      templateSystem = "";
      return;
    }

    if (templateId === CREATE_NEW_VALUE) {
      currentTemplate = null;
      templateName = "";
      templateDescription = "";
      templateSystem = "";
      return;
    }

    selectedPromptTemplateId = templateId;
    const template = await dkClient.getPromptTemplate(templateId);
    setPromptDetailModeForTemplate(template);
  }

  async function loadTemplateList(selectedId = NONE_VALUE) {
    templates = await dkClient.listPromptTemplates();

    if (
      selectedId !== NONE_VALUE &&
      selectedId !== CREATE_NEW_VALUE &&
      !templates.some((template) => template.id === selectedId)
    ) {
      templateSelect = NONE_VALUE;
      await loadTemplate(NONE_VALUE);
      return;
    }

    templateSelect = selectedId;
    await loadTemplate(templateSelect);
  }

  async function saveRuntimeSettings() {
    const tempValue = toNumberOrNull(temperature);
    const maxTokenValue = toIntOrNull(maxTokens);
    const topKValue = toIntOrNull(topK);

    const payload: Record<string, unknown> = {
      provider_id: providerId || "ollama",
      model_id: modelId || "",
    };

    if (tempValue !== null) {
      payload.temperature = tempValue;
    }

    if (maxTokenValue !== null) {
      payload.max_tokens = maxTokenValue;
    }

    if (topKValue !== null) {
      payload.top_k = topKValue;
    }

    try {
      await dkClient.patchSettings(currentUserId, payload);
      showToast("Assistant settings updated");
    } catch (error) {
      alert("Settings save failed: " + errorMessage(error));
    }
  }

  async function loadRuntimeSettings() {
    const user = await dkClient.getUser();
    currentUserId = user?.user || "default";

    const [settings, providerData] = await Promise.all([
      dkClient.getSettings(currentUserId),
      dkClient.listProviders({ refresh: true }),
    ]);

    temperature = String(settings?.temperature ?? 0.2);
    maxTokens = String(settings?.max_tokens ?? 512);
    topK = String(settings?.top_k ?? 8);

    providers = providerData?.providers || [];

    if (!providers.length) {
      providers = [
        {
          id: "ollama",
          label: "Ollama",
          models: [],
        },
      ];
    }

    const savedProviderId = String(settings?.provider_id || providers[0]?.id || "ollama");

    providerId = providers.some((provider) => provider.id === savedProviderId)
      ? savedProviderId
      : providers[0]?.id || "ollama";

    populateModelsForProvider(providerId, String(settings?.model_id || ""));
  }

  function selectProfileAction(action: string) {
    if (profileAction === action) {
      resetProfileAction();
      return;
    }

    profileAction = action;
    selectedProfileId = "";

    if (action !== "load") {
      loadedProfileId = null;
    }

    if (action === "create") {
      templateSelect = CREATE_NEW_VALUE;
      loadTemplate(CREATE_NEW_VALUE);
      temperature = "0.2";
      maxTokens = "512";
      topK = "8";
      loadedPersonaId = null;
      hidePersonaTools();
      saveActivePersona("");
    }
  }

  function selectPersonaAction(action: string) {
    if (personaAction === action) {
      resetPersonaAction();
      return;
    }

    personaAction = action;
    selectedPersonaId = "";

    if (action === "create") {
      loadedPersonaId = null;
      personaName = "";
      personaText = "";
    }
  }

  async function saveCurrentProfile() {
    const nextProfiles = loadSavedProfiles();
    const name = profileName.trim();

    if (!name) {
      alert("Profile name is required.");
      return;
    }

    let promptTemplateId = templateSelect;

    if (templateSelect === CREATE_NEW_VALUE) {
      const newTemplateName = templateName.trim();
      const description = templateDescription.trim();
      const system = templateSystem.trim();

      if (!newTemplateName) {
        alert("Prompt template name is required.");
        return;
      }

      if (!system) {
        alert("Prompt template system instructions are required.");
        return;
      }

      const existingTemplateIds = new Set(templates.map((template) => template.id));
      const newTemplateId = uniqueIdFromName(newTemplateName, existingTemplateIds, "custom_prompt");

      const templatePayload: PromptTemplate = {
        id: newTemplateId,
        name: newTemplateName,
        description,
        system,
        user_format: "{user}",
        context_item_format: "- {chunk} (source: {source|unknown})",
        context_header: "Relevant context:",
        context_join: "\n",
        persona_format: "Persona: {persona}",
        history_separator: "\n",
        include_history: true,
        temperature: toNumberOrNull(temperature) ?? 0.2,
        max_tokens: toIntOrNull(maxTokens) ?? 512,
        top_k: toIntOrNull(topK) ?? 8,
      };

      await dkClient.savePromptTemplate(templatePayload.id, templatePayload);
      await loadTemplateList(templatePayload.id);
      promptTemplateId = templatePayload.id;
      selectedPromptTemplateId = templatePayload.id;
    }

    let activePersonaText = localStorage.getItem("persona") || "";
    let nextPersonaId = selectedPersonaId || loadedPersonaId || "";

    if (personaText.trim()) {
      const nextPersonas = loadSavedPersonas();
      let personaId = nextPersonaId;

      if (!personaId || !nextPersonas.some((persona) => persona.id === personaId)) {
        personaId = uniqueIdFromName(personaName || name, new Set(nextPersonas.map((item) => item.id)), "persona");

        nextPersonas.push({
          id: personaId,
          name: personaName || `${name} Persona`,
          text: personaText.trim(),
          created_at: new Date().toISOString(),
        });

        saveSavedPersonas(nextPersonas);
      }

      activePersonaText = personaText.trim();
      nextPersonaId = personaId;
      loadedPersonaId = personaId;
      saveActivePersona(activePersonaText);
    }

    const profile: SavedProfile = {
      id: uniqueIdFromName(name, new Set(nextProfiles.map((item) => item.id)), "profile"),
      name,
      prompt_template_id: promptTemplateId,
      temperature: toNumberOrNull(temperature) ?? 0.2,
      max_tokens: toIntOrNull(maxTokens) ?? 512,
      top_k: toIntOrNull(topK) ?? 8,
      model_id: modelId || "",
      provider_id: providerId || "ollama",
      persona_id: nextPersonaId,
      persona_text: activePersonaText,
      created_at: new Date().toISOString(),
    };

    nextProfiles.push(profile);
    saveSavedProfiles(nextProfiles);
    await saveRuntimeSettings();
    resetProfileAction();
    showToast("Profile saved");
  }

  async function saveLoadedProfileEdits() {
    if (!loadedProfileId) {
      alert("No loaded profile to edit.");
      return;
    }

    const nextProfiles = loadSavedProfiles();
    const index = nextProfiles.findIndex((profile) => profile.id === loadedProfileId);

    if (index === -1) {
      alert("Loaded profile was not found.");
      loadedProfileId = null;
      profiles = nextProfiles;
      return;
    }

    let promptTemplateId = templateSelect;

    if (templateSelect === CREATE_NEW_VALUE) {
      const newTemplateName = templateName.trim();
      const description = templateDescription.trim();
      const system = templateSystem.trim();

      if (!newTemplateName) {
        alert("Prompt template name is required.");
        return;
      }

      if (!system) {
        alert("Prompt template system instructions are required.");
        return;
      }

      const existingTemplateIds = new Set(templates.map((template) => template.id));
      const newTemplateId = uniqueIdFromName(newTemplateName, existingTemplateIds, "custom_prompt");

      const templatePayload: PromptTemplate = {
        id: newTemplateId,
        name: newTemplateName,
        description,
        system,
        user_format: "{user}",
        context_item_format: "- {chunk} (source: {source|unknown})",
        context_header: "Relevant context:",
        context_join: "\n",
        persona_format: "Persona: {persona}",
        history_separator: "\n",
        include_history: true,
        temperature: toNumberOrNull(temperature) ?? 0.2,
        max_tokens: toIntOrNull(maxTokens) ?? 512,
        top_k: toIntOrNull(topK) ?? 8,
      };

      await dkClient.savePromptTemplate(templatePayload.id, templatePayload);
      await loadTemplateList(templatePayload.id);
      promptTemplateId = templatePayload.id;
      selectedPromptTemplateId = templatePayload.id;
    }

    let activePersonaText = localStorage.getItem("persona") || "";
    let nextPersonaId = selectedPersonaId || loadedPersonaId || "";

    if (personaText.trim()) {
      const nextPersonas = loadSavedPersonas();
      let personaId = nextPersonaId;

      if (!personaId || !nextPersonas.some((persona) => persona.id === personaId)) {
        personaId = uniqueIdFromName(
          personaName || nextProfiles[index].name,
          new Set(nextPersonas.map((item) => item.id)),
          "persona",
        );

        nextPersonas.push({
          id: personaId,
          name: personaName || `${nextProfiles[index].name} Persona`,
          text: personaText.trim(),
          created_at: new Date().toISOString(),
        });

        saveSavedPersonas(nextPersonas);
      }

      activePersonaText = personaText.trim();
      nextPersonaId = personaId;
      loadedPersonaId = personaId;
      saveActivePersona(activePersonaText);
    }

    nextProfiles[index] = {
      ...nextProfiles[index],
      prompt_template_id: promptTemplateId,
      temperature: toNumberOrNull(temperature) ?? 0.2,
      max_tokens: toIntOrNull(maxTokens) ?? 512,
      top_k: toIntOrNull(topK) ?? 8,
      model_id: modelId || "",
      provider_id: providerId || "ollama",
      persona_id: nextPersonaId,
      persona_text: activePersonaText,
      updated_at: new Date().toISOString(),
    };

    saveSavedProfiles(nextProfiles);
    await saveRuntimeSettings();
    showToast("Profile edits saved");
  }

  async function confirmProfileAction() {
    if (!selectedProfileId) {
      alert("Select a profile first.");
      return;
    }

    const nextProfiles = loadSavedProfiles();
    const profile = nextProfiles.find((item) => item.id === selectedProfileId);

    if (!profile) {
      alert("Profile not found.");
      profiles = nextProfiles;
      return;
    }

    if (profileAction === "delete") {
      const confirmed = confirm(`Delete profile "${profile.name || profile.id}"?`);
      if (!confirmed) return;

      const updated = nextProfiles.filter((item) => item.id !== selectedProfileId);
      saveSavedProfiles(updated);

      if (loadedProfileId === selectedProfileId) {
        loadedProfileId = null;
      }

      resetProfileAction();
      showToast("Profile deleted");
      return;
    }

    if (profileAction === "load") {
      loadedProfileId = profile.id;

      const profileTemplateId = profile.prompt_template_id || NONE_VALUE;
      const templateExists =
        profileTemplateId === NONE_VALUE ||
        profileTemplateId === CREATE_NEW_VALUE ||
        templates.some((template) => template.id === profileTemplateId);

      if (templateExists) {
        templateSelect = profileTemplateId;
        await loadTemplate(profileTemplateId);
      } else {
        templateSelect = NONE_VALUE;
        selectedPromptTemplateId = "rag_chat";
        currentTemplate = null;
        templateName = "";
        templateDescription = "";
        templateSystem = "";
        showToast("Profile prompt template was missing, using None");
      }

      temperature = String(profile.temperature ?? 0.2);
      maxTokens = String(profile.max_tokens ?? 512);
      topK = String(profile.top_k ?? 8);

      providerId = profile.provider_id || "ollama";
      populateModelsForProvider(providerId, profile.model_id || null);

      if (profile.model_id) {
        modelId = profile.model_id;
      }

      saveActivePersona(profile.persona_text || "");
      loadedPersonaId = profile.persona_id || null;
      resetPersonaAction();

      if (profile.persona_text) {
        const matchingPersona = loadSavedPersonas().find((item) => item.id === loadedPersonaId);

        personaName = matchingPersona?.name || "Profile Persona";
        personaText = profile.persona_text;
      } else {
        personaName = "";
        personaText = "";
      }

      await saveRuntimeSettings();

      profileAction = "";
      selectedProfileId = "";
      showToast(`Loaded profile: ${profile.name || profile.id}`);
    }
  }

  function savePersona() {
    const name = personaName.trim();
    const text = personaText.trim();

    if (!name) {
      alert("Persona name is required.");
      return;
    }

    if (!text) {
      alert("Persona text is required.");
      return;
    }

    const nextPersonas = loadSavedPersonas();

    if (loadedPersonaId) {
      const index = nextPersonas.findIndex((persona) => persona.id === loadedPersonaId);

      if (index !== -1) {
        nextPersonas[index] = {
          ...nextPersonas[index],
          name,
          text,
          updated_at: new Date().toISOString(),
        };

        saveSavedPersonas(nextPersonas);
        saveActivePersona(text);
        showToast("Persona edits saved");
        return;
      }
    }

    const personaId = uniqueIdFromName(name, new Set(nextPersonas.map((persona) => persona.id)), "persona");

    nextPersonas.push({
      id: personaId,
      name,
      text,
      created_at: new Date().toISOString(),
    });

    saveSavedPersonas(nextPersonas);
    loadedPersonaId = personaId;
    saveActivePersona(text);
    showToast("Persona saved and applied");
  }

  function confirmPersonaAction() {
    if (!selectedPersonaId) {
      alert("Select a persona first.");
      return;
    }

    const nextPersonas = loadSavedPersonas();
    const persona = nextPersonas.find((item) => item.id === selectedPersonaId);

    if (!persona) {
      alert("Persona not found.");
      personas = nextPersonas;
      return;
    }

    if (personaAction === "load") {
      loadedPersonaId = persona.id;
      personaName = persona.name || "";
      personaText = persona.text || "";
      saveActivePersona(persona.text || "");
      showToast(`Loaded persona: ${persona.name || persona.id}`);
      return;
    }

    if (personaAction === "delete") {
      const confirmed = confirm(`Delete persona "${persona.name || persona.id}"?`);
      if (!confirmed) return;

      const updated = nextPersonas.filter((item) => item.id !== selectedPersonaId);
      saveSavedPersonas(updated);

      if ((localStorage.getItem("persona") || "") === (persona.text || "")) {
        saveActivePersona("");
      }

      if (loadedPersonaId === selectedPersonaId) {
        loadedPersonaId = null;
      }

      personaName = "";
      personaText = "";
      selectedPersonaId = "";
      showToast("Persona deleted");
    }
  }

  async function saveTemplate() {
    const name = templateName.trim();
    const description = templateDescription.trim();
    const system = templateSystem.trim();

    if (!name) {
      alert("Name is required.");
      return;
    }

    if (!system) {
      alert("System is required.");
      return;
    }

    if (templateSelect === CREATE_NEW_VALUE) {
      const existingIds = new Set(templates.map((template) => template.id));
      const templateId = uniqueIdFromName(name, existingIds, "custom_prompt");

      const payload: PromptTemplate = {
        id: templateId,
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
        top_k: toIntOrNull(topK) ?? 8,
        temperature: toNumberOrNull(temperature) ?? 0.2,
        max_tokens: toIntOrNull(maxTokens) ?? 512,
      };

      try {
        await dkClient.savePromptTemplate(payload.id, payload);
        showToast("Created prompt template");
        selectedPromptTemplateId = payload.id;
        await loadTemplateList(payload.id);
      } catch (error) {
        alert("Save failed: " + errorMessage(error));
      }

      return;
    }

    if (loadedProfileId && currentTemplate?.id && templateSelect !== NONE_VALUE) {
      const payload: PromptTemplate = {
        ...currentTemplate,
        id: currentTemplate.id,
        name,
        description,
        system,
        user_format: currentTemplate.user_format || "{user}",
        context_item_format:
          currentTemplate.context_item_format || "- {chunk} (source: {source|unknown})",
        context_header: currentTemplate.context_header || "Relevant context:",
        context_join: currentTemplate.context_join || "\n",
        persona_format: currentTemplate.persona_format || "Persona: {persona}",
        history_separator: currentTemplate.history_separator || "\n",
        include_history:
          typeof currentTemplate.include_history === "boolean"
            ? currentTemplate.include_history
            : true,
        temperature: toNumberOrNull(temperature) ?? Number(currentTemplate.temperature ?? 0.2),
        max_tokens: toIntOrNull(maxTokens) ?? Number(currentTemplate.max_tokens ?? 512),
        top_k: toIntOrNull(topK) ?? Number(currentTemplate.top_k ?? 8),
      };

      try {
        await dkClient.savePromptTemplate(payload.id, payload);
        currentTemplate = payload;
        showToast("Prompt template edits saved");
        await loadTemplateList(payload.id);
      } catch (error) {
        alert("Prompt template edit save failed: " + errorMessage(error));
      }
    }
  }

  async function deleteSelectedTemplate() {
    if (!templateSelect || protectedTemplateIds.includes(templateSelect)) return;

    const selectedTemplate = templates.find((template) => template.id === templateSelect);
    const label = selectedTemplate?.name || templateSelect;

    const confirmed = confirm(
      `Delete prompt template "${label}"?\n\nThis will remove prompts/${templateSelect}.json. Profiles and personas will NOT be deleted.`,
    );

    if (!confirmed) return;

    try {
      await dkClient.deletePromptTemplate(templateSelect);

      if (selectedPromptTemplateId === templateSelect) {
        selectedPromptTemplateId = "rag_chat";
      }

      currentTemplate = null;
      await loadTemplateList(NONE_VALUE);
      showToast("Prompt template deleted");
    } catch (error) {
      alert("Prompt template delete failed: " + errorMessage(error));
    }
  }

  async function handleProviderChange() {
    populateModelsForProvider(providerId, null);
    await saveRuntimeSettings();
  }

  async function fetchApiKeyProviders() {
    const data = await dkClient.listProviders({
      includeUnavailable: true,
      refresh: true,
    });

    return (data?.providers || []) as ApiKeyRow[];
  }

  function openApiKeyManager() {
    apiKeyManagerOpen = true;
    apiKeyInputs = {};
    apiKeyProvidersPromise = fetchApiKeyProviders();
  }

  function setApiKeyInput(providerId: string, value: string) {
    apiKeyInputs = {
      ...apiKeyInputs,
      [providerId]: value,
    };
  }

  async function saveProviderApiKey(provider: ApiKeyRow) {
    const key = (apiKeyInputs[provider.id] || "").trim();

    if (provider.api_key_required && !key) {
      showToast("Enter an API key to save");
      return;
    }

    try {
      await dkClient.patchProvider(provider.id, {
        api_key: key,
      });

      await loadRuntimeSettings();
      apiKeyProvidersPromise = fetchApiKeyProviders();
      showToast("Provider saved");
    } catch (error) {
      alert("Provider save failed: " + errorMessage(error));
    }
  }

  async function clearProviderApiKey(provider: ApiKeyRow) {
    try {
      await dkClient.clearProviderApiKey(provider.id);
      await loadRuntimeSettings();
      apiKeyProvidersPromise = fetchApiKeyProviders();
      showToast("API key cleared");
    } catch (error) {
      alert("API key clear failed: " + errorMessage(error));
    }
  }

  async function initialize() {
    profiles = loadSavedProfiles();
    personas = loadSavedPersonas();

    try {
      await loadRuntimeSettings();
      await loadTemplateList(NONE_VALUE);
    } catch (error) {
      alert("Assistant settings failed to load: " + errorMessage(error));
    }
  }

  onMount(() => {
    initialize();
  });
</script>

{#snippet sectionLabel(text: string)}
  <div class="field-label">{text}</div>
{/snippet}

{#snippet profileActionButton(action: string, label: string)}
  <button
    type="button"
    class:active={profileAction === action}
    class="btn"
    id={`profile_${action}_btn`}
    data-profile-action={action}
    onclick={() => selectProfileAction(action)}
  >
    {label}
  </button>
{/snippet}

{#snippet personaActionButton(action: string, label: string)}
  <button
    type="button"
    class:active={personaAction === action}
    class="btn"
    id={`persona_${action}_btn`}
    data-persona-action={action}
    onclick={() => selectPersonaAction(action)}
  >
    {label}
  </button>
{/snippet}

{#snippet apiKeyProviderRow(provider: ApiKeyRow)}
  <div class="api-key-provider-row">
    <div class="api-key-provider-main">
      <div>
        <div class="api-key-provider-name">{provider.label || provider.id}</div>

        <div class:connected={provider.available} class="api-key-provider-status">
          {#if provider.available}
            Connected
          {:else}
            Not connected
          {/if}
        </div>
      </div>
    </div>

    <div class="api-key-provider-controls">
      <input
        class="input api-key-input"
        type="password"
        autocomplete="off"
        placeholder={provider.has_api_key ? "Saved API key" : "API key"}
        disabled={!provider.api_key_required}
        value={apiKeyInputs[provider.id] || ""}
        oninput={(event) => setApiKeyInput(provider.id, event.currentTarget.value)}
      />

      <div class="api-key-provider-actions">
        <button type="button" class="btn api-key-save" onclick={() => saveProviderApiKey(provider)}>
          Save
        </button>

        <button
          type="button"
          class="btn api-key-clear"
          disabled={!provider.api_key_required}
          onclick={() => clearProviderApiKey(provider)}
        >
          Clear
        </button>
      </div>
    </div>
  </div>
{/snippet}

<BaseWindow
  {id}
  {title}
  {closable}
  {collapsed}
  {onToggleCollapse}
  {onClose}
  contentLabel="Assistant settings window"
>
  <div class="form assistant-settings-form">
    <div class="row">
      {@render sectionLabel("Profiles")}

      <div
        class="assistant-action-buttons"
        style="display: flex; gap: 6px; justify-content: flex-start; align-items: center; flex-wrap: wrap;"
      >
        {@render profileActionButton("create", "Create Profile")}
        {@render profileActionButton("load", "Load Profile")}
        {@render profileActionButton("delete", "Delete Profile")}
      </div>
    </div>

    {#if showProfileCreate}
      <div class="row" id="profile_create_row">
        <label for="profile_name">Profile Name</label>
        <input
          id="profile_name"
          class="input"
          type="text"
          placeholder="Example: Research Mode"
          bind:value={profileName}
        />
      </div>
    {/if}

    {#if showProfileSelect}
      <div class="row" id="profile_select_row">
        <label for="profile_select">Saved Profile</label>
        <select id="profile_select" class="input" bind:value={selectedProfileId} disabled={!profiles.length}>
          {#if profiles.length}
            <option value="">Select a profile</option>

            {#each profiles as profile (profile.id)}
              <option value={profile.id}>{profile.name || profile.id}</option>
            {/each}
          {:else}
            <option value="">No saved profiles</option>
          {/if}
        </select>
      </div>
    {/if}

    {#if showProfileActions || showProfileSaveEdits}
      <div class="row" id="profile_actions">
        {#if showProfileConfirm}
          <button type="button" class="btn" id="profile_confirm" onclick={confirmProfileAction}>
            Confirm
          </button>
        {/if}

        {#if showProfileSave}
          <button type="button" class="btn" id="profile_save" onclick={saveCurrentProfile}>
            Save Profile
          </button>
        {/if}

        {#if showProfileSaveEdits}
          <button type="button" class="btn" id="profile_save_edits" onclick={saveLoadedProfileEdits}>
            Save Edits
          </button>
        {/if}
      </div>
    {/if}

    <div class="row">
      <label for="tmpl_select">Prompt Template</label>

      <div style="display: flex; gap: 6px; align-items: center;">
        <select
          id="tmpl_select"
          class="input"
          style="flex: 1;"
          bind:value={templateSelect}
          onchange={() => loadTemplate(templateSelect)}
        >
          <option value={NONE_VALUE}>None</option>

          {#each templates as template (template.id)}
            <option value={template.id}>{template.name || template.id}</option>
          {/each}

          <option value={CREATE_NEW_VALUE}>Create Your Own</option>
        </select>

        {#if deleteTemplateVisible}
          <button
            type="button"
            class="btn"
            id="tmpl_delete"
            title="Delete selected user-made prompt template"
            onclick={deleteSelectedTemplate}
          >
            Delete Template
          </button>
        {/if}
      </div>
    </div>

    {#if promptDetailsVisible}
      {#key templateSelect}
        <div id="tmpl_details">
          <div class="row">
            <label for="tmpl_name">Name</label>
            <input
              id="tmpl_name"
              class="input"
              type="text"
              placeholder="Example: Technical Helper"
              bind:value={templateName}
              disabled={!promptCanEdit}
              readonly={!promptCanEdit}
            />
          </div>

          <div class="row">
            <label for="tmpl_description">Description</label>
            <textarea
              id="tmpl_description"
              class="textarea"
              placeholder="Short description of what this prompt does."
              style="min-height: 70px;"
              bind:value={templateDescription}
              disabled={!promptCanEdit}
              readonly={!promptCanEdit}
            ></textarea>
          </div>

          <div class="row">
            <label for="tmpl_system">System</label>
            <textarea
              id="tmpl_system"
              class="textarea"
              placeholder="System instructions for the assistant."
              style="min-height: 130px;"
              bind:value={templateSystem}
              disabled={!promptCanEdit}
              readonly={!promptCanEdit}
            ></textarea>
          </div>
        </div>
      {/key}
    {/if}

    <div class="row">
      {@render sectionLabel("Personas")}

      <div
        class="assistant-action-buttons"
        style="display: flex; gap: 6px; justify-content: flex-start; align-items: center; flex-wrap: wrap;"
      >
        {@render personaActionButton("create", "Create Persona")}
        {@render personaActionButton("load", "Load Persona")}
        {@render personaActionButton("delete", "Delete Persona")}
      </div>
    </div>

    {#if showPersonaSelect}
      <div class="row" id="persona_select_row">
        <label for="persona_select">Saved Persona</label>
        <select id="persona_select" class="input" bind:value={selectedPersonaId} disabled={!personas.length}>
          {#if personas.length}
            <option value="">Select a persona</option>

            {#each personas as persona (persona.id)}
              <option value={persona.id}>{persona.name || persona.id}</option>
            {/each}
          {:else}
            <option value="">No saved personas</option>
          {/if}
        </select>
      </div>
    {/if}

    {#if showPersonaConfirm}
      <div class="row" id="persona_confirm_row">
        <button type="button" class="btn" id="persona_confirm" onclick={confirmPersonaAction}>
          Confirm
        </button>
      </div>
    {/if}

    {#if showPersonaEditor}
      {#key loadedPersonaId || personaAction}
        <div id="persona_editor">
          <div class="row">
            <label for="persona_name">Persona Name</label>
            <input
              id="persona_name"
              class="input"
              type="text"
              placeholder="Example: Engineering Tutor"
              bind:value={personaName}
            />
          </div>

          <div class="row">
            <label for="assistant_persona">Persona</label>
            <textarea
              id="assistant_persona"
              class="textarea"
              placeholder="Write the persona instructions here."
              style="min-height: 90px;"
              bind:value={personaText}
            ></textarea>
          </div>

          <div class="row">
            <button type="button" class="btn" id="persona_save" onclick={savePersona}>
              {#if loadedPersonaId}
                Save Persona Edits
              {:else}
                Save Persona
              {/if}
            </button>
          </div>
        </div>
      {/key}
    {/if}

    <div
      class="row assistant-compact-row"
      style="display: flex; align-items: end; justify-content: space-between; gap: 10px; flex-wrap: nowrap; width: 100%;"
    >
      <div
        class="assistant-number-settings"
        style="display: grid; grid-template-columns: 90px 75px 105px; align-items: end; gap: 8px; flex: 0 0 auto;"
      >
        <div class="assistant-compact-field">
          <label for="assistant_temperature">Temperature</label>
          <input
            id="assistant_temperature"
            class="input"
            type="number"
            min="0"
            max="2"
            step="0.1"
            placeholder="0.2"
            style="width: 100%; box-sizing: border-box;"
            bind:value={temperature}
            onchange={saveRuntimeSettings}
          />
        </div>

        <div class="assistant-compact-field">
          <label for="assistant_top_k">Top K</label>
          <input
            id="assistant_top_k"
            class="input"
            type="number"
            min="0"
            step="1"
            placeholder="8"
            style="width: 100%; box-sizing: border-box;"
            bind:value={topK}
            onchange={saveRuntimeSettings}
          />
        </div>

        <div class="assistant-compact-field">
          <label for="assistant_max_tokens">Max Tokens</label>
          <input
            id="assistant_max_tokens"
            class="input"
            type="number"
            min="1"
            step="1"
            placeholder="512"
            style="width: 100%; box-sizing: border-box;"
            bind:value={maxTokens}
            onchange={saveRuntimeSettings}
          />
        </div>
      </div>

      <div
        class="assistant-manage-buttons"
        style="display: flex; align-items: end; gap: 6px; margin-left: auto;"
      >
        <button
          type="button"
          class="btn"
          id="manage_mcps"
          onclick={() => showToast("MCP manager coming soon")}
        >
          Manage MCP's
        </button>

        <button type="button" class="btn" id="manage_api_keys" onclick={openApiKeyManager}>
          Manage API Keys
        </button>
      </div>
    </div>

    {#if saveTemplateVisible}
      <div class="row">
        <button type="button" class="btn" id="tmpl_save" onclick={saveTemplate}>
          {saveTemplateLabel}
        </button>
      </div>
    {/if}

    <div class="row">
      <label for="assistant_llm_provider">LLM Provider</label>
      <select
        id="assistant_llm_provider"
        class="input"
        bind:value={providerId}
        onchange={handleProviderChange}
      >
        {#each providers as provider (provider.id)}
          <option value={provider.id}>{provider.label || provider.id}</option>
        {:else}
          <option value="ollama">Ollama</option>
        {/each}
      </select>
    </div>

    <div class="row">
      <label for="assistant_llm_model">Chat Model</label>
      <select
        id="assistant_llm_model"
        class="input"
        bind:value={modelId}
        disabled={!modelOptions.length || modelOptions[0]?.value === ""}
        onchange={saveRuntimeSettings}
      >
        {#each modelOptions as model (model.value)}
          <option value={model.value}>{model.label}</option>
        {:else}
          <option value="">No models available</option>
        {/each}
      </select>
    </div>
  </div>

  {#if toastMessage}
    <div class="toast show">{toastMessage}</div>
  {/if}

  {#if apiKeyManagerOpen}
    <div
      class="api-key-manager-overlay"
      role="presentation"
      onclick={(event) => {
        if (event.currentTarget === event.target) {
          apiKeyManagerOpen = false;
        }
      }}
    >
      <div class="api-key-manager" role="dialog" aria-modal="true" aria-labelledby="api-key-manager-title">
        <div class="api-key-manager-head">
          <h2 id="api-key-manager-title">API Keys</h2>
          <button
            type="button"
            class="btn api-key-manager-close"
            aria-label="Close"
            onclick={() => (apiKeyManagerOpen = false)}
          >
            Close
          </button>
        </div>

        <div class="api-key-provider-list">
          {#if apiKeyProvidersPromise}
            {#await apiKeyProvidersPromise}
              <div class="api-key-manager-empty">Loading providers...</div>
            {:then apiKeyProviders}
              {#each apiKeyProviders as provider (provider.id)}
                {@render apiKeyProviderRow(provider)}
              {:else}
                <div class="api-key-manager-empty">No providers found.</div>
              {/each}
            {:catch error}
              <div class="api-key-manager-empty">
                Provider load failed: {errorMessage(error)}
              </div>
            {/await}
          {:else}
            <div class="api-key-manager-empty">Loading providers...</div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</BaseWindow>

<style>
  .assistant-action-buttons .active {
    outline: 1px solid var(--accent);
  }

  .assistant-settings-form {
    display: grid;
    gap: 10px;
  }

  .field-label {
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }

  .assistant-compact-field {
    display: grid;
    gap: 4px;
  }

  .assistant-compact-field label {
    font-size: 12px;
  }

  .toast {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 10000;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--text);
    padding: 8px 12px;
    opacity: 0;
    transform: translateY(8px);
    transition:
      opacity 120ms ease,
      transform 120ms ease;
  }

  .toast.show {
    opacity: 1;
    transform: translateY(0);
  }

  .api-key-manager-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.45);
  }

  .api-key-manager {
    width: min(720px, calc(100vw - 32px));
    max-height: min(720px, calc(100vh - 32px));
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: hsl(var(--h) var(--sat) var(--l-panel));
    color: var(--text);
    padding: 14px;
    box-shadow: 0 20px 80px rgba(0, 0, 0, 0.45);
  }

  .api-key-manager-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .api-key-manager-head h2 {
    margin: 0;
    font-size: 18px;
  }

  .api-key-provider-list {
    display: grid;
    gap: 10px;
  }

  .api-key-provider-row {
    display: grid;
    grid-template-columns: minmax(160px, 1fr) minmax(260px, 2fr);
    gap: 12px;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px;
  }

  .api-key-provider-name {
    font-weight: 600;
  }

  .api-key-provider-status {
    color: var(--muted);
    font-size: 12px;
  }

  .api-key-provider-status.connected {
    color: var(--accent);
  }

  .api-key-provider-controls {
    display: grid;
    gap: 8px;
  }

  .api-key-provider-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .api-key-manager-empty {
    color: var(--muted);
    padding: 12px;
  }

  @media (max-width: 720px) {
    .assistant-compact-row {
      flex-wrap: wrap !important;
    }

    .assistant-number-settings {
      grid-template-columns: 1fr !important;
      width: 100%;
    }

    .assistant-manage-buttons {
      margin-left: 0 !important;
    }

    .api-key-provider-row {
      grid-template-columns: 1fr;
    }
  }
</style>