<script lang="ts">
  import { onMount } from "svelte";
  import BaseWindow from "./BaseWindow.svelte";
  import Icon from "$lib/components/utils/Icon.svelte";
  import AssistantApiKeyPopup from "$lib/components/popups/AssistantApiKeyPopup.svelte";
  import type { WindowInstanceProps } from "./index";

  type ProviderRecord = {
    id: string;
    name?: string;
    label?: string;
    models?: string[];
  };

  type PromptTemplate = {
    id: string;
    name: string;
    description?: string;
    system: string;
    includeHistory?: boolean;
    include_history?: boolean;
    temperature?: number | null;
    topK?: number | null;
    top_k?: number | null;
    maxTokens?: number | null;
    max_tokens?: number | null;
    builtIn?: boolean;
  };

  type PersonaRecord = {
    id: string;
    name: string;
    text: string;
    builtIn?: boolean;
  };

  type AssistantProfile = {
    id: string;
    name: string;
    promptTemplateId?: string;
    prompt_template_id?: string;
    providerId?: string;
    provider_id?: string;
    modelId?: string;
    model_id?: string;
    personaId?: string | null;
    persona_id?: string | null;
    personaText?: string | null;
    persona_text?: string | null;
    temperature?: number;
    topK?: number;
    top_k?: number;
    maxTokens?: number;
    max_tokens?: number;
  };

  type AssistantSettings = {
    id?: string;
    userId?: string;
    user_id?: string;
    providerId?: string;
    provider_id?: string;
    modelId?: string;
    model_id?: string;
    promptTemplateId?: string;
    prompt_template_id?: string;
    personaId?: string | null;
    persona_id?: string | null;
    temperature?: number;
    topK?: number;
    top_k?: number;
    maxTokens?: number;
    max_tokens?: number;
  };

  type AssistantStateResponse = {
    settings: AssistantSettings;
    templates: PromptTemplate[];
    personas: PersonaRecord[];
    profiles: AssistantProfile[];
    providers: ProviderRecord[];
  };

  type ModelOption = {
    value: string;
    label: string;
  };

  let {
    id,
    title,
    closable = false,
    height = null,
    collapsed = false,
    onToggleCollapse = () => {},
    onClose = () => {},
  }: WindowInstanceProps = $props();

  const NONE_VALUE = "__none__";
  const CREATE_NEW_VALUE = "__create_your_own__";

  const TEMPERATURE_HELP =
    "Controls response randomness. Higher temperature makes answers more creative and varied; lower temperature makes answers more precise and consistent.";

  const TOP_K_HELP =
    "Limits how many likely next-word choices the model considers. Lower Top K makes responses more focused; higher Top K allows more variety.";

  const MAX_TOKENS_HELP =
    "Sets the maximum response length. 512 tokens usually produces roughly 350–400 words, depending on formatting and word length.";

  let templates = $state<PromptTemplate[]>([]);
  let currentTemplate = $state<PromptTemplate | null>(null);
  let selectedPromptTemplateId = $state("rag_chat");

  let promptAction = $state("");
  let selectedPromptActionTemplateId = $state("");
  let promptCopyTemplateId = $state("");

  let templateSelect = $state(NONE_VALUE);
  let templateName = $state("");
  let templateDescription = $state("");
  let templateSystem = $state("");

  let temperature = $state("0.2");
  let topK = $state("8");
  let maxTokens = $state("512");

  let apiKeyManagerOpen = $state(false);

  let providers = $state<ProviderRecord[]>([]);
  let providerId = $state("ollama");
  let modelId = $state("");
  let modelOptions = $state<ModelOption[]>([]);

  let profileAction = $state("");
  let profileName = $state("");
  let selectedProfileId = $state("");
  let loadedProfileId = $state<string | null>(null);
  let profiles = $state<AssistantProfile[]>([]);

  let personaAction = $state("");
  let selectedPersonaId = $state("");
  let loadedPersonaId = $state<string | null>(null);
  let personaCopyId = $state("");
  let personaName = $state("");
  let personaText = $state("");
  let personas = $state<PersonaRecord[]>([]);

  let loading = $state(false);
  let toastMessage = $state("");

  function formatError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  const protectedTemplateIds = [
    NONE_VALUE,
    CREATE_NEW_VALUE,
    "default",
    "rag_chat",
    "tech_helper",
    "title_summarizer",
  ];

  const showProfileCreate = $derived(profileAction === "create");
  const showProfileSelect = $derived(
    profileAction === "load" || profileAction === "delete",
  );
  const showProfileConfirm = $derived(
    profileAction === "load" || profileAction === "delete",
  );
  const showProfileSave = $derived(profileAction === "create");
  const showProfileSaveEdits = $derived(
    Boolean(loadedProfileId) && profileAction === "",
  );

  const showPromptCreate = $derived(promptAction === "create");
  const showPromptSelect = $derived(
    promptAction === "load" || promptAction === "delete",
  );
  const showPromptConfirm = $derived(
    promptAction === "load" || promptAction === "delete",
  );
  const showPromptCopy = $derived(promptAction === "copy" && templates.length > 0);

  const loadedPromptIsProtected = $derived(
    templateSelect !== NONE_VALUE &&
      templateSelect !== CREATE_NEW_VALUE &&
      protectedTemplateIds.includes(templateSelect),
  );

  const promptDetailsVisible = $derived(
    templateSelect !== NONE_VALUE || promptAction === "create",
  );

  const promptCanEdit = $derived(
    promptAction === "create" ||
      templateSelect === CREATE_NEW_VALUE ||
      Boolean(
        currentTemplate &&
          templateSelect !== NONE_VALUE &&
          !protectedTemplateIds.includes(templateSelect),
      ),
  );

  const saveTemplateVisible = $derived(promptCanEdit || showPromptCreate);

  const saveTemplateLabel = $derived(
    templateSelect === CREATE_NEW_VALUE || showPromptCreate
      ? "Save Template"
      : "Save Prompt Edits",
  );

  const showPersonaSelect = $derived(
    personaAction === "load" || personaAction === "delete",
  );
  const showPersonaConfirm = $derived(
    personaAction === "load" || personaAction === "delete",
  );
  const showPersonaCopy = $derived(
    personaAction === "copy" && personas.length > 0,
  );
  const showPersonaEditor = $derived(
    personaAction === "create" || Boolean(loadedPersonaId),
  );

  function settingProviderId(settings: AssistantSettings) {
    return settings.providerId ?? settings.provider_id ?? "ollama";
  }

  function settingModelId(settings: AssistantSettings) {
    return settings.modelId ?? settings.model_id ?? "";
  }

  function settingPromptTemplateId(settings: AssistantSettings) {
    return settings.promptTemplateId ?? settings.prompt_template_id ?? "rag_chat";
  }

  function settingPersonaId(settings: AssistantSettings) {
    return settings.personaId ?? settings.persona_id ?? null;
  }

  function settingTopK(settings: AssistantSettings) {
    return settings.topK ?? settings.top_k ?? 8;
  }

  function settingMaxTokens(settings: AssistantSettings) {
    return settings.maxTokens ?? settings.max_tokens ?? 512;
  }

  function profilePromptTemplateId(profile: AssistantProfile) {
    return profile.promptTemplateId ?? profile.prompt_template_id ?? "rag_chat";
  }

  function profileProviderId(profile: AssistantProfile) {
    return profile.providerId ?? profile.provider_id ?? "ollama";
  }

  function profileModelId(profile: AssistantProfile) {
    return profile.modelId ?? profile.model_id ?? "";
  }

  function profilePersonaId(profile: AssistantProfile) {
    return profile.personaId ?? profile.persona_id ?? null;
  }

  function profilePersonaText(profile: AssistantProfile) {
    return profile.personaText ?? profile.persona_text ?? "";
  }

  function profileTopK(profile: AssistantProfile) {
    return profile.topK ?? profile.top_k ?? 8;
  }

  function profileMaxTokens(profile: AssistantProfile) {
    return profile.maxTokens ?? profile.max_tokens ?? 512;
  }

  function templateTopK(template: PromptTemplate) {
    return template.topK ?? template.top_k ?? null;
  }

  function templateMaxTokens(template: PromptTemplate) {
    return template.maxTokens ?? template.max_tokens ?? null;
  }

  function templateIncludeHistory(template: PromptTemplate) {
    return template.includeHistory ?? template.include_history ?? true;
  }

  function personaIsProtected(personaId: string | null) {
    if (!personaId) return false;

    return Boolean(
      personas.find((persona) => persona.id === personaId)?.builtIn,
    );
  }

  const loadedPersonaIsProtected = $derived(
    personaIsProtected(loadedPersonaId),
  );

  const personaCanEdit = $derived(!loadedPersonaIsProtected);

  function showToast(message: string) {
    toastMessage = message;

    window.setTimeout(() => {
      if (toastMessage === message) {
        toastMessage = "";
      }
    }, 2000);
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

  function uniqueIdFromName(
    name: string,
    existingIds: Set<string>,
    fallback: string,
  ) {
    const base = slugifyName(name, fallback);
    let nextId = base;
    let count = 2;

    while (existingIds.has(nextId)) {
      nextId = `${base}_${count}`;
      count += 1;
    }

    return nextId;
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

  async function assistantStateRequest(
    body?: Record<string, unknown>,
  ): Promise<AssistantStateResponse> {
    const response = await fetch("/assistant-state", {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        text || `Assistant settings request failed: ${response.status}`,
      );
    }

    return (await response.json()) as AssistantStateResponse;
  }

  function modelOptionsForProvider(
    providerList: ProviderRecord[],
    nextProviderId: string,
    selectedModel: string | null = null,
  ): ModelOption[] {
    const provider = providerList.find((item) => item.id === nextProviderId);
    const models = provider?.models ?? [];

    if (!models.length && selectedModel) {
      return [{ value: selectedModel, label: selectedModel }];
    }

    return models.map((model) => ({
      value: model,
      label: model,
    }));
  }

  function populateModelsForProvider(
    nextProviderId: string,
    selectedModel: string | null = null,
  ) {
    modelOptions = modelOptionsForProvider(
      providers,
      nextProviderId,
      selectedModel,
    );

    if (
      selectedModel &&
      modelOptions.some((model) => model.value === selectedModel)
    ) {
      modelId = selectedModel;
      return;
    }

    modelId = modelOptions[0]?.value ?? selectedModel ?? "";
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

    const nextMaxTokens = templateMaxTokens(template);
    if (nextMaxTokens !== undefined && nextMaxTokens !== null) {
      maxTokens = String(nextMaxTokens);
    }

    const nextTopK = templateTopK(template);
    if (nextTopK !== undefined && nextTopK !== null) {
      topK = String(nextTopK);
    }
  }

  async function refreshState(selectedTemplateId: string | null = null) {
    const data = await assistantStateRequest();

    templates = data.templates ?? [];
    personas = data.personas ?? [];
    profiles = data.profiles ?? [];
    providers = data.providers?.length
      ? data.providers
      : [{ id: "ollama", name: "Ollama", label: "Ollama", models: [] }];

    const settings = data.settings ?? {};

    temperature = String(settings.temperature ?? 0.2);
    maxTokens = String(settingMaxTokens(settings));
    topK = String(settingTopK(settings));

    selectedPromptTemplateId =
      selectedTemplateId ?? settingPromptTemplateId(settings) ?? "rag_chat";

    templateSelect = selectedPromptTemplateId || NONE_VALUE;

    providerId = settingProviderId(settings);
    populateModelsForProvider(providerId, settingModelId(settings));

    loadedPersonaId = settingPersonaId(settings);

    const activePersona = personas.find(
      (persona) => persona.id === loadedPersonaId,
    );

    if (activePersona) {
      personaName = activePersona.name;
      personaText = activePersona.text;
    } else {
      personaName = "";
      personaText = "";
    }

    if (templateSelect === NONE_VALUE) {
      setPromptDetailModeForTemplate(null);
    } else {
      const template = templates.find((item) => item.id === templateSelect) ?? null;
      setPromptDetailModeForTemplate(template);
    }
  }

  async function saveRuntimeSettings() {
    const tempValue = toNumberOrNull(temperature);
    const maxTokenValue = toIntOrNull(maxTokens);
    const topKValue = toIntOrNull(topK);

    const settings = {
      providerId: providerId || "ollama",
      modelId: modelId || "",
      promptTemplateId: selectedPromptTemplateId || "rag_chat",
      personaId: loadedPersonaId,
      temperature: tempValue ?? 0.2,
      maxTokens: maxTokenValue ?? 512,
      topK: topKValue ?? 8,
    };

    try {
      await assistantStateRequest({
        action: "settings.save",
        settings,
      });

      showToast("Assistant settings updated");
    } catch (error) {
      alert("Settings save failed: " + formatError(error));
    }
  }

  function resetProfileAction() {
    profileAction = "";
    profileName = "";
    selectedProfileId = "";
  }

  function resetPromptAction() {
    promptAction = "";
    selectedPromptActionTemplateId = "";
    promptCopyTemplateId = "";

    if (templateSelect === CREATE_NEW_VALUE) {
      templateSelect = NONE_VALUE;
      selectedPromptTemplateId = "default";
      currentTemplate = null;
      templateName = "";
      templateDescription = "";
      templateSystem = "";
    }
  }

  function resetPersonaAction() {
    personaAction = "";
    selectedPersonaId = "";
    personaCopyId = "";
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
      selectedPromptTemplateId = "default";
      setPromptDetailModeForTemplate(null);
      temperature = "0.2";
      maxTokens = "512";
      topK = "8";
      loadedPersonaId = null;
      personaName = "";
      personaText = "";
    }
  }

  function selectPromptAction(action: string) {
    if (promptAction === action) {
      resetPromptAction();
      return;
    }

    promptAction = action;
    selectedPromptActionTemplateId = "";

    if (action === "create") {
      templateSelect = CREATE_NEW_VALUE;
      selectedPromptTemplateId = "default";
      setPromptDetailModeForTemplate(null);
      templateName = "";
      templateDescription = "";
      templateSystem = "";
    }

    if (action === "copy") {
      promptCopyTemplateId = "";
    }
  }

  function selectPersonaAction(action: string) {
    if (personaAction === action) {
      resetPersonaAction();
      return;
    }

    personaAction = action;
    selectedPersonaId = "";
    personaCopyId = "";

    if (action === "create") {
      loadedPersonaId = null;
      personaName = "";
      personaText = "";
    }
  }

  async function confirmPromptAction() {
    if (!selectedPromptActionTemplateId) {
      alert("Select a prompt template first.");
      return;
    }

    const selectedTemplate = templates.find(
      (template) => template.id === selectedPromptActionTemplateId,
    );

    if (!selectedTemplate) {
      alert("Prompt template not found.");
      return;
    }

    if (promptAction === "delete") {
      if (protectedTemplateIds.includes(selectedTemplate.id)) {
        alert(
          "Default prompt templates cannot be deleted. Use Create Prompt → Copy Prompt to make an editable version.",
        );
        return;
      }

      const confirmed = confirm(
        `Delete prompt template "${selectedTemplate.name || selectedTemplate.id}"?\n\nProfiles and personas will NOT be deleted.`,
      );

      if (!confirmed) return;

      try {
        await assistantStateRequest({
          action: "template.delete",
          id: selectedTemplate.id,
        });

        if (selectedPromptTemplateId === selectedTemplate.id) {
          selectedPromptTemplateId = "rag_chat";
        }

        templateSelect = NONE_VALUE;
        currentTemplate = null;
        await refreshState("rag_chat");
        resetPromptAction();
        showToast("Prompt template deleted");
      } catch (error) {
        alert("Prompt template delete failed: " + formatError(error));
      }

      return;
    }

    if (promptAction === "load") {
      templateSelect = selectedTemplate.id;
      selectedPromptTemplateId = selectedTemplate.id;
      setPromptDetailModeForTemplate(selectedTemplate);
      await saveRuntimeSettings();
      resetPromptAction();
      showToast(`Loaded prompt: ${selectedTemplate.name || selectedTemplate.id}`);
    }
  }

  function copyPromptFromSelected() {
    if (!promptCopyTemplateId) {
      alert("Select a prompt template to copy from.");
      return;
    }

    const selectedTemplate = templates.find(
      (template) => template.id === promptCopyTemplateId,
    );

    if (!selectedTemplate) {
      alert("Prompt template not found.");
      return;
    }

    templateName = `${selectedTemplate.name || "Prompt"} Copy`;
    templateDescription = selectedTemplate.description || "";
    templateSystem = selectedTemplate.system || "";

    if (selectedTemplate.temperature !== undefined && selectedTemplate.temperature !== null) {
      temperature = String(selectedTemplate.temperature);
    }

    const copiedMaxTokens = templateMaxTokens(selectedTemplate);
    if (copiedMaxTokens !== null) {
      maxTokens = String(copiedMaxTokens);
    }

    const copiedTopK = templateTopK(selectedTemplate);
    if (copiedTopK !== null) {
      topK = String(copiedTopK);
    }

    promptAction = "create";
    templateSelect = CREATE_NEW_VALUE;
    selectedPromptTemplateId = "default";
    currentTemplate = null;
    showToast("Prompt copied into editor");
  }

  async function saveTemplate() {
    const name = templateName.trim();
    const description = templateDescription.trim();
    const system = templateSystem.trim();

    if (
      templateSelect !== CREATE_NEW_VALUE &&
      templateSelect !== NONE_VALUE &&
      protectedTemplateIds.includes(templateSelect)
    ) {
      alert(
        "Default prompt templates cannot be edited directly. Use Create Prompt → Copy Prompt to make an editable version.",
      );
      return;
    }

    if (!name) {
      alert("Name is required.");
      return;
    }

    if (!system) {
      alert("System is required.");
      return;
    }

    const existingIds = new Set(templates.map((template) => template.id));

    const templateId =
      templateSelect === CREATE_NEW_VALUE || !currentTemplate?.id
        ? uniqueIdFromName(name, existingIds, "custom_prompt")
        : currentTemplate.id;

    const wasCreate = templateSelect === CREATE_NEW_VALUE || promptAction === "create";

    try {
      await assistantStateRequest({
        action: "template.save",
        template: {
          id: templateId,
          name,
          description,
          system,
          includeHistory: currentTemplate
            ? templateIncludeHistory(currentTemplate)
            : true,
          temperature: toNumberOrNull(temperature),
          maxTokens: toIntOrNull(maxTokens),
          topK: toIntOrNull(topK),
        },
      });

      selectedPromptTemplateId = templateId;
      templateSelect = templateId;

      await refreshState(templateId);
      await saveRuntimeSettings();

      promptAction = "";
      selectedPromptActionTemplateId = "";
      promptCopyTemplateId = "";
      showToast(wasCreate ? "Created prompt template" : "Prompt template saved");
    } catch (error) {
      alert("Prompt template save failed: " + formatError(error));
    }
  }

  async function saveCurrentProfile() {
    const name = profileName.trim();

    if (!name) {
      alert("Profile name is required.");
      return;
    }

    let promptTemplateId = templateSelect;

    if (templateSelect === CREATE_NEW_VALUE) {
      await saveTemplate();
      promptTemplateId = selectedPromptTemplateId;
    }

    if (promptTemplateId === NONE_VALUE || promptTemplateId === CREATE_NEW_VALUE) {
      promptTemplateId = "rag_chat";
    }

    const profileId = uniqueIdFromName(
      name,
      new Set(profiles.map((item) => item.id)),
      "profile",
    );

    try {
      await assistantStateRequest({
        action: "profile.save",
        profile: {
          id: profileId,
          name,
          promptTemplateId,
          temperature: toNumberOrNull(temperature) ?? 0.2,
          maxTokens: toIntOrNull(maxTokens) ?? 512,
          topK: toIntOrNull(topK) ?? 8,
          modelId: modelId || "",
          providerId: providerId || "ollama",
          personaId: loadedPersonaId,
          personaText: personaText.trim() || null,
        },
      });

      loadedProfileId = profileId;
      await refreshState(promptTemplateId);
      await saveRuntimeSettings();

      resetProfileAction();
      showToast("Profile saved");
    } catch (error) {
      alert("Profile save failed: " + formatError(error));
    }
  }

  async function saveLoadedProfileEdits() {
    if (!loadedProfileId) {
      alert("No loaded profile to edit.");
      return;
    }

    const existingProfile = profiles.find((profile) => profile.id === loadedProfileId);

    if (!existingProfile) {
      alert("Loaded profile was not found.");
      loadedProfileId = null;
      return;
    }

    let promptTemplateId = templateSelect;

    if (templateSelect === CREATE_NEW_VALUE) {
      await saveTemplate();
      promptTemplateId = selectedPromptTemplateId;
    }

    if (promptTemplateId === NONE_VALUE || promptTemplateId === CREATE_NEW_VALUE) {
      promptTemplateId = "rag_chat";
    }

    try {
      await assistantStateRequest({
        action: "profile.save",
        profile: {
          id: loadedProfileId,
          name: existingProfile.name,
          promptTemplateId,
          temperature: toNumberOrNull(temperature) ?? 0.2,
          maxTokens: toIntOrNull(maxTokens) ?? 512,
          topK: toIntOrNull(topK) ?? 8,
          modelId: modelId || "",
          providerId: providerId || "ollama",
          personaId: loadedPersonaId,
          personaText: personaText.trim() || null,
        },
      });

      await refreshState(promptTemplateId);
      await saveRuntimeSettings();

      showToast("Profile edits saved");
    } catch (error) {
      alert("Profile edit save failed: " + formatError(error));
    }
  }

  async function confirmProfileAction() {
    if (!selectedProfileId) {
      alert("Select a profile first.");
      return;
    }

    const profile = profiles.find((item) => item.id === selectedProfileId);

    if (!profile) {
      alert("Profile not found.");
      return;
    }

    if (profileAction === "delete") {
      const confirmed = confirm(`Delete profile "${profile.name || profile.id}"?`);
      if (!confirmed) return;

      try {
        await assistantStateRequest({
          action: "profile.delete",
          id: selectedProfileId,
        });

        if (loadedProfileId === selectedProfileId) {
          loadedProfileId = null;
        }

        await refreshState();
        resetProfileAction();
        showToast("Profile deleted");
      } catch (error) {
        alert("Profile delete failed: " + formatError(error));
      }

      return;
    }

    if (profileAction === "load") {
      loadedProfileId = profile.id;

      const profileTemplateId = profilePromptTemplateId(profile);

      templateSelect = profileTemplateId;
      selectedPromptTemplateId = profileTemplateId;
      setPromptDetailModeForTemplate(
        templates.find((template) => template.id === profileTemplateId) ?? null,
      );

      temperature = String(profile.temperature ?? 0.2);
      maxTokens = String(profileMaxTokens(profile));
      topK = String(profileTopK(profile));

      providerId = profileProviderId(profile);
      populateModelsForProvider(providerId, profileModelId(profile));

      loadedPersonaId = profilePersonaId(profile);

      const matchingPersona = personas.find(
        (item) => item.id === loadedPersonaId,
      );

      personaName = matchingPersona?.name || "";
      personaText = profilePersonaText(profile) || matchingPersona?.text || "";

      await saveRuntimeSettings();

      profileAction = "";
      selectedProfileId = "";
      showToast(`Loaded profile: ${profile.name || profile.id}`);
    }
  }

  async function savePersona() {
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

    if (personaIsProtected(loadedPersonaId)) {
      alert(
        "Default personas cannot be edited directly. Use Create Persona → Copy Persona to make an editable version.",
      );
      return;
    }

    const personaId =
      loadedPersonaId ||
      uniqueIdFromName(
        name,
        new Set(personas.map((persona) => persona.id)),
        "persona",
      );

    const isCreate = !loadedPersonaId;

    try {
      await assistantStateRequest({
        action: "persona.save",
        persona: {
          id: personaId,
          name,
          text,
        },
      });

      loadedPersonaId = personaId;

      await refreshState(selectedPromptTemplateId);
      await saveRuntimeSettings();

      personaAction = "";
      personaCopyId = "";
      showToast(isCreate ? "Persona created" : "Persona saved");
    } catch (error) {
      alert("Persona save failed: " + formatError(error));
    }
  }

  function copyPersonaFromSelected() {
    if (!personaCopyId) {
      alert("Select a persona to copy from.");
      return;
    }

    const persona = personas.find((item) => item.id === personaCopyId);

    if (!persona) {
      alert("Persona not found.");
      return;
    }

    loadedPersonaId = null;
    personaAction = "create";
    personaName = `${persona.name || "Persona"} Copy`;
    personaText = persona.text || "";
    personaCopyId = "";
    showToast("Persona copied into editor");
  }

  async function confirmPersonaAction() {
    if (!selectedPersonaId) {
      alert("Select a persona first.");
      return;
    }

    const persona = personas.find((item) => item.id === selectedPersonaId);

    if (!persona) {
      alert("Persona not found.");
      return;
    }

    if (personaAction === "load") {
      loadedPersonaId = persona.id;
      personaName = persona.name || "";
      personaText = persona.text || "";
      await saveRuntimeSettings();
      resetPersonaAction();
      showToast(`Loaded persona: ${persona.name || persona.id}`);
      return;
    }

    if (personaAction === "delete") {
      if (persona.builtIn) {
        alert(
          "Default personas cannot be deleted. Use Create Persona → Copy Persona to make an editable version.",
        );
        return;
      }

      const confirmed = confirm(`Delete persona "${persona.name || persona.id}"?`);
      if (!confirmed) return;

      try {
        await assistantStateRequest({
          action: "persona.delete",
          id: selectedPersonaId,
        });

        if (loadedPersonaId === selectedPersonaId) {
          loadedPersonaId = null;
          personaName = "";
          personaText = "";
        }

        selectedPersonaId = "";
        await refreshState(selectedPromptTemplateId);
        await saveRuntimeSettings();

        showToast("Persona deleted");
      } catch (error) {
        alert("Persona delete failed: " + formatError(error));
      }
    }
  }

  async function handleProviderChange() {
    populateModelsForProvider(providerId, null);
    await saveRuntimeSettings();
  }

  function openApiKeyManager() {
    apiKeyManagerOpen = true;
  }

  async function initialize() {
    loading = true;

    try {
      await refreshState();
    } catch (error) {
      alert("Assistant settings failed to load: " + formatError(error));
    } finally {
      loading = false;
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

{#snippet promptActionButton(action: string, label: string)}
  <button
    type="button"
    class:active={promptAction === action}
    class="btn"
    id={`prompt_${action}_btn`}
    data-prompt-action={action}
    onclick={() => selectPromptAction(action)}
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

<BaseWindow
  {id}
  {title}
  {closable}
  {height}
  {collapsed}
  {onToggleCollapse}
  {onClose}
  contentLabel="Assistant settings window"
>
  <div class="form assistant-settings-form">
    {#if loading}
      <div class="row">
        <div class="field-label">Loading assistant settings…</div>
      </div>
    {/if}

    <div class="row">
      {@render sectionLabel("Profiles")}

      <div class="assistant-action-buttons">
        {@render profileActionButton("create", "Create Profile")}
        {@render profileActionButton("load", "Load Profile")}
        {@render profileActionButton("delete", "Delete Profile")}
      </div>
    </div>

    {#if showProfileCreate}
      <div class="row" id="profile_create_row">
        <label for="profile_name">Profile Name</label>

        <div class="inline-control-row">
          <input
            id="profile_name"
            class="input"
            type="text"
            placeholder="Example: Research Mode"
            bind:value={profileName}
          />

          {#if showProfileSave}
            <button
              type="button"
              class="settings-action-button settings-save-button"
              id="profile_save"
              aria-label="Save profile"
              title="Save profile"
              onclick={saveCurrentProfile}
            >
              <Icon name="save" size={16} />
            </button>
          {/if}
        </div>
      </div>
    {/if}

    {#if showProfileSelect}
      <div class="row" id="profile_select_row">
        <label for="profile_select">Saved Profile</label>

        <div class="inline-control-row">
          <select
            id="profile_select"
            class="input"
            bind:value={selectedProfileId}
            disabled={!profiles.length}
          >
            {#if profiles.length}
              <option value="">Select a profile</option>

              {#each profiles as profile (profile.id)}
                <option value={profile.id}>{profile.name || profile.id}</option>
              {/each}
            {:else}
              <option value="">No saved profiles</option>
            {/if}
          </select>

          {#if showProfileConfirm}
            <button
              type="button"
              class="settings-action-button settings-save-button"
              id="profile_confirm"
              aria-label="Confirm profile action"
              title="Confirm"
              onclick={confirmProfileAction}
            >
              <Icon name="save" size={16} />
            </button>
          {/if}
        </div>
      </div>
    {/if}

    {#if showProfileSaveEdits}
      <div class="row" id="profile_save_edits_row">
        <label for="loaded_profile_name">Loaded Profile</label>

        <div class="inline-control-row">
          <input
            id="loaded_profile_name"
            class="input"
            type="text"
            value={profiles.find((profile) => profile.id === loadedProfileId)?.name || loadedProfileId || ""}
            readonly
          />

          <button
            type="button"
            class="settings-action-button settings-save-button"
            id="profile_save_edits"
            aria-label="Save profile edits"
            title="Save profile edits"
            onclick={saveLoadedProfileEdits}
          >
            <Icon name="save" size={16} />
          </button>
        </div>
      </div>
    {/if}

    <div class="row">
      {@render sectionLabel("Prompt Templates")}

      <div class="assistant-action-buttons prompt-action-layout">
        <div class="prompt-create-stack">
          {@render promptActionButton("create", "Create Prompt")}
          {@render promptActionButton("copy", "Copy Prompt")}
        </div>

        {@render promptActionButton("load", "Load Prompt")}
        {@render promptActionButton("delete", "Delete Prompt")}
      </div>
    </div>

    {#if showPromptSelect}
      <div class="row" id="prompt_select_row">
        <label for="prompt_select">Saved Prompt</label>

        <div class="inline-control-row">
          <select
            id="prompt_select"
            class="input"
            bind:value={selectedPromptActionTemplateId}
            disabled={!templates.length}
          >
            {#if templates.length}
              <option value="">Select a prompt</option>

              {#each templates as template (template.id)}
                <option value={template.id}>
                  {template.name || template.id}{protectedTemplateIds.includes(template.id) ? " (default)" : ""}
                </option>
              {/each}
            {:else}
              <option value="">No saved prompts</option>
            {/if}
          </select>

          {#if showPromptConfirm}
            <button
              type="button"
              class="settings-action-button settings-save-button"
              id="prompt_confirm"
              aria-label="Confirm prompt action"
              title="Confirm"
              onclick={confirmPromptAction}
            >
              <Icon name="save" size={16} />
            </button>
          {/if}
        </div>
      </div>
    {/if}

    {#if showPromptCopy}
      <div class="row" id="prompt_copy_select_row">
        <label for="prompt_copy_select">Copy From Prompt</label>

        <div class="inline-control-row">
          <select
            id="prompt_copy_select"
            class="input"
            bind:value={promptCopyTemplateId}
            disabled={!templates.length}
          >
            <option value="">Select a prompt to copy</option>

            {#each templates as template (template.id)}
              <option value={template.id}>
                {template.name || template.id}{protectedTemplateIds.includes(template.id) ? " (default)" : ""}
              </option>
            {/each}
          </select>

          <button
            type="button"
            class="settings-action-button settings-save-button"
            id="prompt_copy_confirm"
            aria-label="Copy prompt"
            title="Copy prompt"
            onclick={copyPromptFromSelected}
          >
            <Icon name="save" size={16} />
          </button>
        </div>
      </div>
    {/if}

    {#if promptDetailsVisible}
      {#key templateSelect + promptAction}
        <div id="tmpl_details">
          <div class="row">
            <label for="tmpl_name">Name</label>

            <div class="inline-control-row">
              <input
                id="tmpl_name"
                class="input"
                type="text"
                placeholder="Example: Technical Helper"
                bind:value={templateName}
                disabled={!promptCanEdit}
                readonly={!promptCanEdit}
              />

              {#if saveTemplateVisible && promptCanEdit}
                <button
                  type="button"
                  class="settings-action-button settings-save-button"
                  id="tmpl_save"
                  aria-label={saveTemplateLabel}
                  title={saveTemplateLabel}
                  onclick={saveTemplate}
                >
                  <Icon name="save" size={16} />
                </button>
              {/if}
            </div>
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

    {#if loadedPromptIsProtected}
      <div class="row prompt-protected-note">
        Default prompt templates cannot be edited directly. Use Create Prompt → Copy Prompt to make an editable version.
      </div>
    {/if}

    <div class="row">
      {@render sectionLabel("Personas")}

      <div class="assistant-action-buttons prompt-action-layout">
        <div class="prompt-create-stack">
          {@render personaActionButton("create", "Create Persona")}
          {@render personaActionButton("copy", "Copy Persona")}
        </div>

        {@render personaActionButton("load", "Load Persona")}
        {@render personaActionButton("delete", "Delete Persona")}
      </div>
    </div>

    {#if showPersonaSelect}
      <div class="row" id="persona_select_row">
        <label for="persona_select">Saved Persona</label>

        <div class="inline-control-row">
          <select
            id="persona_select"
            class="input"
            bind:value={selectedPersonaId}
            disabled={!personas.length}
          >
            {#if personas.length}
              <option value="">Select a persona</option>

              {#each personas as persona (persona.id)}
                <option value={persona.id}>
                  {persona.name || persona.id}{persona.builtIn ? " (default)" : ""}
                </option>
              {/each}
            {:else}
              <option value="">No saved personas</option>
            {/if}
          </select>

          {#if showPersonaConfirm}
            <button
              type="button"
              class="settings-action-button settings-save-button"
              id="persona_confirm"
              aria-label="Confirm persona action"
              title="Confirm"
              onclick={confirmPersonaAction}
            >
              <Icon name="save" size={16} />
            </button>
          {/if}
        </div>
      </div>
    {/if}

    {#if showPersonaCopy}
      <div class="row" id="persona_copy_select_row">
        <label for="persona_copy_select">Copy From Persona</label>

        <div class="inline-control-row">
          <select
            id="persona_copy_select"
            class="input"
            bind:value={personaCopyId}
            disabled={!personas.length}
          >
            <option value="">Select a persona to copy</option>

            {#each personas as persona (persona.id)}
              <option value={persona.id}>
                {persona.name || persona.id}{persona.builtIn ? " (default)" : ""}
              </option>
            {/each}
          </select>

          <button
            type="button"
            class="settings-action-button settings-save-button"
            id="persona_copy_confirm"
            aria-label="Copy persona"
            title="Copy persona"
            onclick={copyPersonaFromSelected}
          >
            <Icon name="save" size={16} />
          </button>
        </div>
      </div>
    {/if}

    {#if showPersonaEditor}
      {#key loadedPersonaId || personaAction}
        <div id="persona_editor">
          <div class="row">
            <label for="persona_name">Persona Name</label>

            <div class="inline-control-row">
              <input
                id="persona_name"
                class="input"
                type="text"
                placeholder="Example: Engineering Tutor"
                bind:value={personaName}
                disabled={!personaCanEdit}
                readonly={!personaCanEdit}
              />

              {#if personaCanEdit}
                <button
                  type="button"
                  class="settings-action-button settings-save-button"
                  id="persona_save"
                  aria-label={loadedPersonaId ? "Save persona edits" : "Save persona"}
                  title={loadedPersonaId ? "Save persona edits" : "Save persona"}
                  onclick={savePersona}
                >
                  <Icon name="save" size={16} />
                </button>
              {/if}
            </div>
          </div>

          <div class="row">
            <label for="assistant_persona">Persona</label>
            <textarea
              id="assistant_persona"
              class="textarea"
              placeholder="Write the persona instructions here."
              style="min-height: 90px;"
              bind:value={personaText}
              disabled={!personaCanEdit}
              readonly={!personaCanEdit}
            ></textarea>
          </div>

          {#if !personaCanEdit}
            <div class="row persona-protected-note">
              Default personas cannot be edited directly. Use Create Persona → Copy Persona to make an editable version.
            </div>
          {/if}
        </div>
      {/key}
    {/if}

    <div class="row assistant-compact-row">
      <div class="assistant-number-settings">
        <div class="assistant-compact-field">
          <label for="assistant_temperature" title={TEMPERATURE_HELP}>
            Temperature
          </label>
          <input
            id="assistant_temperature"
            class="input"
            type="number"
            min="0"
            max="2"
            step="0.1"
            placeholder="0.2"
            title={TEMPERATURE_HELP}
            bind:value={temperature}
            onchange={saveRuntimeSettings}
          />
        </div>

        <div class="assistant-compact-field">
          <label for="assistant_top_k" title={TOP_K_HELP}>Top K</label>
          <input
            id="assistant_top_k"
            class="input"
            type="number"
            min="0"
            step="1"
            placeholder="8"
            title={TOP_K_HELP}
            bind:value={topK}
            onchange={saveRuntimeSettings}
          />
        </div>

        <div class="assistant-compact-field">
          <label for="assistant_max_tokens" title={MAX_TOKENS_HELP}>
            Max Tokens
          </label>
          <input
            id="assistant_max_tokens"
            class="input"
            type="number"
            min="1"
            step="1"
            placeholder="512"
            title={MAX_TOKENS_HELP}
            bind:value={maxTokens}
            onchange={saveRuntimeSettings}
          />
        </div>
      </div>

      <div class="assistant-manage-buttons">
        <button
          type="button"
          class="btn"
          id="manage_mcps"
          onclick={() => showToast("MCP manager coming soon")}
        >
          Manage MCP's
        </button>

        <button
          type="button"
          class="btn"
          id="manage_api_keys"
          onclick={openApiKeyManager}
        >
          Manage API Keys
        </button>
      </div>
    </div>

    <div class="row">
      <label for="assistant_llm_provider">LLM Provider</label>
      <select
        id="assistant_llm_provider"
        class="input"
        bind:value={providerId}
        onchange={handleProviderChange}
      >
        {#each providers as provider (provider.id)}
          <option value={provider.id}>
            {provider.label || provider.name || provider.id}
          </option>
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
</BaseWindow>

<AssistantApiKeyPopup
  open={apiKeyManagerOpen}
  onClose={() => (apiKeyManagerOpen = false)}
  onChanged={refreshState}
  onToast={showToast}
/>

<style>
  .assistant-action-buttons {
    display: flex;
    gap: 6px;
    justify-content: flex-start;
    align-items: center;
    flex-wrap: wrap;
  }

  .assistant-action-buttons .active {
    outline: 1px solid var(--accent);
  }

  .assistant-settings-form {
    display: grid;
    gap: 10px;
  }

  .prompt-action-layout {
    align-items: flex-start;
  }

  .prompt-create-stack {
    display: grid;
    gap: 6px;
  }

  .field-label {
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }

  .inline-control-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0;
    align-items: stretch;
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 3%));
    box-shadow: inset 0 1px 0 color-mix(in oklab, white 18%, transparent);
    overflow: hidden;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .inline-control-row:focus-within {
    border-color: color-mix(in oklab, var(--accent) 70%, var(--border));
    box-shadow:
      inset 0 1px 0 color-mix(in oklab, white 18%, transparent),
      0 0 0 2px color-mix(in oklab, var(--accent) 18%, transparent);
  }

  .inline-control-row .input,
  .inline-control-row select {
    min-width: 0;
    width: 100%;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .inline-control-row .input:focus,
  .inline-control-row select:focus {
    outline: none;
    box-shadow: none;
  }

  .settings-action-button {
    display: inline-grid;
    place-items: center;
    width: 38px;
    min-width: 38px;
    height: 100%;
    min-height: 34px;
    border: 0;
    border-left: 1px solid var(--border);
    border-radius: 0;
    background: rgb(204, 255, 204);
    color: #102a10;
    cursor: pointer;
    padding: 0;
  }

  .settings-action-button:hover {
    background: rgb(190, 245, 190);
  }

  .settings-action-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .settings-save-button {
    color: #102a10;
  }


  .assistant-compact-row {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: nowrap;
    width: 100%;
  }

  .assistant-number-settings {
    display: grid;
    grid-template-columns: 90px 75px 105px;
    align-items: end;
    gap: 8px;
    flex: 0 0 auto;
  }

  .assistant-compact-field {
    display: grid;
    gap: 4px;
  }

  .assistant-compact-field label {
    font-size: 12px;
  }

  .assistant-compact-field .input {
    width: 100%;
    box-sizing: border-box;
  }

  .assistant-manage-buttons {
    display: flex;
    align-items: end;
    gap: 6px;
    margin-left: auto;
  }

  .persona-protected-note,
  .prompt-protected-note {
    justify-content: center;
    color: var(--muted);
    font-size: 12px;
    text-align: center;
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
  }
</style>