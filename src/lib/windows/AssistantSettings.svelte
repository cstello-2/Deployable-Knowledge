<script lang="ts">
  import { onMount } from "svelte";
  import {
    getActivePersona,
    loadAssistantRuntimeData,
    modelOptionsForProvider,
    saveAssistantRuntime,
    setActivePersona,
    type AssistantRuntimePayload,
    type ModelOption,
  } from "$lib/assistantState";
  import BaseWindow from "$lib/components/BaseWindow.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { errorMessage } from "$lib/errors";
  import { AssistantApiKeyPopup } from "$lib/popups";
  import { dkClient, type PromptTemplate, type ProviderRecord } from "$lib/sdk";
  import type { WindowInstanceProps } from "./index.ts";

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
  const PERSONAS_STORAGE_KEY = "dk_saved_personas";
  const PROFILES_STORAGE_KEY = "dk_saved_profiles";
  const DEFAULT_PERSONAS: SavedPersona[] = [
    {
      id: "default_creative_writer",
      name: "Creative Writer",
      text: ` You are a creative writer with 10 years of experience. Your goal is to help users produce imaginative, polished, and engaging writing. Communicate in a vivid and expressive manner. Mix short, punchy lines with longer, atmospheric thoughts. Use sensory details, emotional language, and strong imagery naturally. Always preserve the user's intended message, genre, and audience. Never make the writing overly generic, flat, or robotic. If you lack information, ask for the missing context or make a clearly labeled creative assumption. Start with a brief creative direction or framing note. Present your main points in polished paragraphs, scenes, outlines, or revised drafts as appropriate. End with a short note on possible next edits or improvements.`,
    },
    {
      id: "default_technical_writer",
      name: "Technical Writer",
      text: `You are a technical writer with 10 years of experience. Your goal is to turn complex information into clear, accurate, and usable documentation. Communicate in a precise and organized manner. Use direct explanations, clean structure, and minimal filler. Use technical terminology naturally, but define it when the audience may not know it. Always prioritize clarity, correctness, and step-by-step usability. Never overcomplicate the explanation or hide important assumptions. If you lack information, identify the missing details and give the safest usable version based on what is known. Start with a brief summary of the goal or issue. Present your main points in numbered steps, labeled sections, tables, or concise bullets as appropriate. End with a verification step, test command, or checklist when useful.`,
    },
    {
      id: "default_consultant",
      name: "Consultant",
      text: ` You are a consultant with 12 years of experience. Your goal is to help users make practical decisions, improve workflows, and identify the highest-impact next steps. Communicate in a strategic and direct manner. Balance concise recommendations with enough reasoning to support the decision. Use business, operations, and planning terminology naturally without sounding overly corporate. Always focus on tradeoffs, priorities, risks, and actionable next steps. Never give vague advice without explaining what to do next. If you lack information, state the assumption you are making and recommend what information should be gathered. Start with the main recommendation. Present your main points in prioritized bullets, decision matrices, or action plans as appropriate. End with the next concrete action the user should take.`,
    },
  ];
  const protectedPersonaIds = DEFAULT_PERSONAS.map((persona) => persona.id);

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

  let currentUserId = $state("default");

  let templates = $state<PromptTemplate[]>([]);
  let currentTemplate = $state<PromptTemplate | null>(null);
  let selectedPromptTemplateId = $state("rag_chat");

  let promptAction = $state("");
  let selectedPromptId = $state("");
  let loadedPromptId = $state<string | null>(null);

  let copyPromptOpen = $state(false);
  let selectedCopyPromptId = $state("");

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
  let modelOptions = $state<ModelOption[]>([]);

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
  let personaTextarea: HTMLTextAreaElement | null = $state(null);
  let copyPersonaOpen = $state(false);
  let selectedCopyPersonaId = $state("");

  let apiKeyManagerOpen = $state(false);

  let toastMessage = $state("");

  const protectedTemplateIds = [
    NONE_VALUE,
    CREATE_NEW_VALUE,
    "default",
    "rag_chat",
    "tech_helper",
    "title_summarizer",
    "caveman",
  ];

  const showProfileCreate = $derived(profileAction === "create");
  const showProfileSelect = $derived(
    profileAction === "load" || profileAction === "delete",
  );
  const showProfileActions = $derived(
    profileAction === "create" ||
      profileAction === "load" ||
      profileAction === "delete",
  );
  const showProfileConfirm = $derived(
    profileAction === "load" || profileAction === "delete",
  );
  const showProfileSave = $derived(profileAction === "create");
  const showProfileSaveEdits = $derived(
    Boolean(loadedProfileId) && profileAction === "",
  );

  const showPersonaCreate = $derived(personaAction === "create");

  const showPersonaSelect = $derived(
    personaAction === "load" || personaAction === "delete",
  );

  const showPersonaConfirm = $derived(
    personaAction === "load" || personaAction === "delete",
  );

  const showPersonaEditor = $derived(
    personaAction === "create" || Boolean(loadedPersonaId && personaText),
  );

  const showPersonaCopySelect = $derived(showPersonaCreate && copyPersonaOpen);

  const loadedPersonaIsProtected = $derived(
    Boolean(loadedPersonaId && protectedPersonaIds.includes(loadedPersonaId)),
  );

  const personaCanEdit = $derived(!loadedPersonaIsProtected);

  const showPromptCreate = $derived(promptAction === "create");
  const loadedPromptIsProtected = $derived(
    Boolean(templateSelect && protectedTemplateIds.includes(templateSelect)),
  );

  const promptCanEdit = $derived(
    promptAction === "create" ||
      Boolean(
        loadedPromptId &&
          templateSelect !== NONE_VALUE &&
          !protectedTemplateIds.includes(templateSelect),
      ),
  );
  const showPromptSelect = $derived(
    promptAction === "load" || promptAction === "delete",
  );
  const showPromptConfirm = $derived(
    promptAction === "load" || promptAction === "delete",
  );

  const showPromptCopySelect = $derived(showPromptCreate && copyPromptOpen);

  const promptDetailsVisible = $derived(
    showPromptCreate ||
      Boolean(loadedPromptId) ||
      Boolean(loadedProfileId && templateSelect !== NONE_VALUE),
  );

  const saveTemplateVisible = $derived(promptCanEdit);
  const saveTemplateLabel = $derived(
    showPromptCreate || templateSelect === CREATE_NEW_VALUE
      ? "Save Prompt"
      : "Save Prompt Edits",
  );

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
      const savedPersonas = Array.isArray(parsed) ? parsed : [];

      const defaultPersonaIds = new Set(
        DEFAULT_PERSONAS.map((persona) => persona.id),
      );

      const customPersonas = savedPersonas.filter(
        (persona) => !defaultPersonaIds.has(persona.id),
      );

      return [...DEFAULT_PERSONAS, ...customPersonas];
    } catch {
      return DEFAULT_PERSONAS;
    }
  }

  function saveSavedPersonas(nextPersonas: SavedPersona[]) {
    const defaultPersonaIds = new Set(
      DEFAULT_PERSONAS.map((persona) => persona.id),
    );

    const customPersonas = nextPersonas.filter(
      (persona) => !defaultPersonaIds.has(persona.id),
    );

    localStorage.setItem(PERSONAS_STORAGE_KEY, JSON.stringify(customPersonas));
    personas = [...DEFAULT_PERSONAS, ...customPersonas];
  }

  function resetProfileAction() {
    profileAction = "";
    profileName = "";
    selectedProfileId = "";
  }

  function resetPersonaAction() {
    personaAction = "";
    selectedPersonaId = "";
    copyPersonaOpen = false;
    selectedCopyPersonaId = "";
  }

  function resetPromptAction() {
    promptAction = "";
    selectedPromptId = "";
    copyPromptOpen = false;
    selectedCopyPromptId = "";
  }

  function hidePersonaTools() {
    personaAction = "";
    selectedPersonaId = "";
    personaName = "";
    personaText = "";
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
    modelId = modelOptions[0]?.value
      ? selectedModel || modelOptions[0].value
      : "";
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
      loadedPromptId = null;
      templateName = "";
      templateDescription = "";
      templateSystem = "";
      return;
    }

    if (templateId === CREATE_NEW_VALUE) {
      currentTemplate = null;
      loadedPromptId = null;
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

    const payload: AssistantRuntimePayload = {
      provider_id: providerId || "ollama",
      model_id: modelId || "",
      prompt_template_id:
        templateSelect &&
        templateSelect !== NONE_VALUE &&
        templateSelect !== CREATE_NEW_VALUE
          ? templateSelect
          : selectedPromptTemplateId || "rag_chat",
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
      await saveAssistantRuntime(currentUserId, payload);
      showToast("Assistant settings updated");
    } catch (error) {
      alert("Settings save failed: " + errorMessage(error));
    }
  }

  async function loadRuntimeSettings() {
    const {
      userId,
      settings,
      providers: runtimeProviders,
      runtime,
    } = await loadAssistantRuntimeData({
      refresh: true,
    });
    currentUserId = userId;

    temperature = String(settings?.temperature ?? 0.2);
    maxTokens = String(settings?.max_tokens ?? 512);
    topK = String(settings?.top_k ?? 8);
    selectedPromptTemplateId = runtime.templateId || "rag_chat";

    providers = runtimeProviders || [];

    if (!providers.length) {
      providers = [
        {
          id: "ollama",
          label: "Ollama",
          models: [],
        },
      ];
    }

    providerId = runtime.providerId || providers[0]?.id || "ollama";
    populateModelsForProvider(providerId, runtime.modelId || "");
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
      setActivePersona("");
    }
  }

  function selectPromptAction(action: string) {
    if (promptAction === action) {
      resetPromptAction();
      return;
    }

    promptAction = action;
    selectedPromptId = "";

    if (action === "create") {
      loadedPromptId = null;
      templateSelect = CREATE_NEW_VALUE;
      selectedPromptTemplateId = "rag_chat";
      currentTemplate = null;
      templateName = "";
      templateDescription = "";
      templateSystem = "";
      copyPromptOpen = false;
      selectedCopyPromptId = "";
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
      copyPersonaOpen = false;
      selectedCopyPersonaId = "";
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

      const existingTemplateIds = new Set(
        templates.map((template) => template.id),
      );
      const newTemplateId = uniqueIdFromName(
        newTemplateName,
        existingTemplateIds,
        "custom_prompt",
      );

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

    let activePersonaText = getActivePersona();
    let nextPersonaId = selectedPersonaId || loadedPersonaId || "";

    if (personaText.trim()) {
      const nextPersonas = loadSavedPersonas();
      let personaId = nextPersonaId;

      if (
        !personaId ||
        !nextPersonas.some((persona) => persona.id === personaId)
      ) {
        personaId = uniqueIdFromName(
          personaName || name,
          new Set(nextPersonas.map((item) => item.id)),
          "persona",
        );

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
      setActivePersona(activePersonaText);
    }

    const profile: SavedProfile = {
      id: uniqueIdFromName(
        name,
        new Set(nextProfiles.map((item) => item.id)),
        "profile",
      ),
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
    const index = nextProfiles.findIndex(
      (profile) => profile.id === loadedProfileId,
    );

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

      const existingTemplateIds = new Set(
        templates.map((template) => template.id),
      );
      const newTemplateId = uniqueIdFromName(
        newTemplateName,
        existingTemplateIds,
        "custom_prompt",
      );

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

    let activePersonaText = getActivePersona();
    let nextPersonaId = selectedPersonaId || loadedPersonaId || "";

    if (personaText.trim()) {
      const nextPersonas = loadSavedPersonas();
      let personaId = nextPersonaId;

      if (
        !personaId ||
        !nextPersonas.some((persona) => persona.id === personaId)
      ) {
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
      setActivePersona(activePersonaText);
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

  async function confirmPromptAction() {
    if (!selectedPromptId) {
      alert("Select a prompt first.");
      return;
    }

    const prompt = templates.find((template) => template.id === selectedPromptId);

    if (!prompt) {
      alert("Prompt template not found.");
      return;
    }

    if (promptAction === "load") {
      loadedPromptId = selectedPromptId;
      templateSelect = selectedPromptId;
      selectedPromptTemplateId = selectedPromptId;

      await loadTemplate(selectedPromptId);
      await saveRuntimeSettings();

      resetPromptAction();
      showToast(`Loaded prompt: ${prompt.name || prompt.id}`);
      return;
    }

    if (promptAction === "delete") {
      if (protectedTemplateIds.includes(selectedPromptId)) {
        alert(
        );
        return;
      }

      const confirmed = confirm(
        `Delete prompt template "${prompt.name || prompt.id}"?\n\nThis will remove prompts/${selectedPromptId}.json. Profiles and personas will NOT be deleted.`,
      );

      if (!confirmed) return;

      try {
        await dkClient.deletePromptTemplate(selectedPromptId);

        if (selectedPromptTemplateId === selectedPromptId) {
          selectedPromptTemplateId = "rag_chat";
        }

        if (loadedPromptId === selectedPromptId) {
          loadedPromptId = null;
        }

        currentTemplate = null;
        templateSelect = NONE_VALUE;
        templateName = "";
        templateDescription = "";
        templateSystem = "";

        await loadTemplateList(NONE_VALUE);
        resetPromptAction();
        showToast("Prompt template deleted");
      } catch (error) {
        alert("Prompt template delete failed: " + errorMessage(error));
      }

      return;
    }
  }

  async function copyPromptIntoCreate() {
    if (!selectedCopyPromptId) {
      alert("Select a prompt to copy first.");
      return;
    }

    const promptToCopy = templates.find(
      (template) => template.id === selectedCopyPromptId,
    );

    if (!promptToCopy) {
      alert("Prompt template not found.");
      return;
    }

    try {
      const fullPrompt = await dkClient.getPromptTemplate(selectedCopyPromptId);

      loadedPromptId = null;
      currentTemplate = null;
      templateSelect = CREATE_NEW_VALUE;
      selectedPromptTemplateId = "rag_chat";
      promptAction = "create";

      templateName = `Copy of ${
        fullPrompt.name || promptToCopy.name || selectedCopyPromptId
      }`;
      templateDescription = String(fullPrompt.description || "");
      templateSystem = String(fullPrompt.system || "");

      if (fullPrompt.temperature !== undefined && fullPrompt.temperature !== null) {
        temperature = String(fullPrompt.temperature);
      }

      if (fullPrompt.max_tokens !== undefined && fullPrompt.max_tokens !== null) {
        maxTokens = String(fullPrompt.max_tokens);
      }

      if (fullPrompt.top_k !== undefined && fullPrompt.top_k !== null) {
        topK = String(fullPrompt.top_k);
      }

      copyPromptOpen = false;
      selectedCopyPromptId = "";

      showToast("Prompt copied into Create Prompt");
    } catch (error) {
      alert("Copy prompt failed: " + errorMessage(error));
    }
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
      const confirmed = confirm(
        `Delete profile "${profile.name || profile.id}"?`,
      );
      if (!confirmed) return;

      const updated = nextProfiles.filter(
        (item) => item.id !== selectedProfileId,
      );
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

      setActivePersona(profile.persona_text || "");
      loadedPersonaId = profile.persona_id || null;
      resetPersonaAction();

      if (profile.persona_text) {
        const matchingPersona = loadSavedPersonas().find(
          (item) => item.id === loadedPersonaId,
        );

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

  function resizePersonaTextarea() {
    requestAnimationFrame(() => {
      if (!personaTextarea) return;

      personaTextarea.style.height = "auto";
      personaTextarea.style.height = `${personaTextarea.scrollHeight}px`;
    });
  }

  $effect(() => {
    personaText;
    resizePersonaTextarea();
  });

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
      if (protectedPersonaIds.includes(loadedPersonaId)) {
        alert("Default personas cannot be edited directly. Use Copy Persona to make an editable version.");
        return;
      }

      const index = nextPersonas.findIndex(
        (persona) => persona.id === loadedPersonaId,
      );

      if (index !== -1) {
        nextPersonas[index] = {
          ...nextPersonas[index],
          name,
          text,
          updated_at: new Date().toISOString(),
        };

        saveSavedPersonas(nextPersonas);
        setActivePersona(text);
        showToast("Persona edits saved");
        return;
      }
    }

    const personaId = uniqueIdFromName(
      name,
      new Set(nextPersonas.map((persona) => persona.id)),
      "persona",
    );

    nextPersonas.push({
      id: personaId,
      name,
      text,
      created_at: new Date().toISOString(),
    });

    saveSavedPersonas(nextPersonas);
    loadedPersonaId = personaId;
    setActivePersona(text);
    showToast("Persona saved and applied");
  }

  function copyPersonaIntoCreate() {
    if (!selectedCopyPersonaId) {
      alert("Select a persona to copy first.");
      return;
    }

    const personaToCopy = personas.find(
      (persona) => persona.id === selectedCopyPersonaId,
    );

    if (!personaToCopy) {
      alert("Persona not found.");
      return;
    }

    loadedPersonaId = null;
    personaAction = "create";

    personaName = `Copy of ${personaToCopy.name || selectedCopyPersonaId}`;
    personaText = personaToCopy.text || "";

    copyPersonaOpen = false;
    selectedCopyPersonaId = "";

    showToast("Persona copied into Create Persona");
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
      setActivePersona(persona.text || "");
      showToast(`Loaded persona: ${persona.name || persona.id}`);
      return;
    }

    if (personaAction === "delete") {
      if (protectedPersonaIds.includes(persona.id)) {
        alert("Default personas cannot be deleted. Use Copy Persona to make your own editable version.");
        return;
      }

      const confirmed = confirm(
        `Delete persona "${persona.name || persona.id}"?`,
      );
      if (!confirmed) return;

      const updated = nextPersonas.filter(
        (item) => item.id !== selectedPersonaId,
      );
      saveSavedPersonas(updated);

      if (getActivePersona() === (persona.text || "")) {
        setActivePersona("");
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

    if (
      templateSelect !== CREATE_NEW_VALUE &&
      templateSelect !== NONE_VALUE &&
      protectedTemplateIds.includes(templateSelect)
    ) {
      alert("Default prompt templates cannot be edited directly. Use Create Prompt → Copy Prompt to make an editable version.");
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
        loadedPromptId = payload.id;
        templateSelect = payload.id;
        await loadTemplateList(payload.id);
        await saveRuntimeSettings();
        resetPromptAction();
      } catch (error) {
        alert("Save failed: " + errorMessage(error));
      }

      return;
    }

    if (
      (loadedPromptId || loadedProfileId) &&
      currentTemplate?.id &&
      templateSelect !== NONE_VALUE
    ) {
      const payload: PromptTemplate = {
        ...currentTemplate,
        id: currentTemplate.id,
        name,
        description,
        system,
        user_format: currentTemplate.user_format || "{user}",
        context_item_format:
          currentTemplate.context_item_format ||
          "- {chunk} (source: {source|unknown})",
        context_header: currentTemplate.context_header || "Relevant context:",
        context_join: currentTemplate.context_join || "\n",
        persona_format: currentTemplate.persona_format || "Persona: {persona}",
        history_separator: currentTemplate.history_separator || "\n",
        include_history:
          typeof currentTemplate.include_history === "boolean"
            ? currentTemplate.include_history
            : true,
        temperature:
          toNumberOrNull(temperature) ??
          Number(currentTemplate.temperature ?? 0.2),
        max_tokens:
          toIntOrNull(maxTokens) ?? Number(currentTemplate.max_tokens ?? 512),
        top_k: toIntOrNull(topK) ?? Number(currentTemplate.top_k ?? 8),
      };

      try {
        await dkClient.savePromptTemplate(payload.id, payload);
        currentTemplate = payload;
        showToast("Prompt template edits saved");
        await loadTemplateList(payload.id);
        loadedPromptId = payload.id;
        selectedPromptTemplateId = payload.id;
        await saveRuntimeSettings();
      } catch (error) {
        alert("Prompt template edit save failed: " + errorMessage(error));
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
      <div class="row">
        <div class="right-action-row">
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
      {@render sectionLabel("Prompt Template")}

      <div class="assistant-action-buttons">
        {@render promptActionButton("create", "Create Prompt")}
        {@render promptActionButton("load", "Load Prompt")}
        {@render promptActionButton("delete", "Delete Prompt")}
      </div>

      {#if showPromptCreate}
        <div class="assistant-action-buttons">
          <button
            type="button"
            class="btn"
            id="prompt_copy_btn"
            onclick={() => {
              copyPromptOpen = !copyPromptOpen;
              selectedCopyPromptId = "";
            }}
          >
            Copy Prompt
          </button>
        </div>
      {/if}
    </div>

    {#if showPromptCopySelect}
      <div class="row" id="prompt_copy_select_row">
        <label for="prompt_copy_select">Copy From Prompt</label>

        <div class="inline-control-row">
          <select
            id="prompt_copy_select"
            class="input"
            bind:value={selectedCopyPromptId}
            disabled={!templates.length}
          >
            {#if templates.length}
              <option value="">Select a prompt to copy</option>

              {#each templates as template (template.id)}
                <option value={template.id}>
                  {template.name || template.id}{protectedTemplateIds.includes(template.id) ? " (default)" : ""}
                </option>
              {/each}
            {:else}
              <option value="">No saved prompts</option>
            {/if}
          </select>

          <button
            type="button"
            class="settings-action-button settings-save-button"
            id="prompt_copy_confirm"
            aria-label="Copy prompt"
            title="Copy prompt"
            onclick={copyPromptIntoCreate}
          >
            <Icon name="save" size={16} />
          </button>
        </div>
      </div>
    {/if}

    {#if showPromptSelect}
      <div class="row" id="prompt_select_row">
        <label for="prompt_select">Saved Prompt</label>

        <div class="inline-control-row">
          <select
            id="prompt_select"
            class="input"
            bind:value={selectedPromptId}
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

    {#if promptDetailsVisible}
      {#key templateSelect}
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

          {#if loadedPromptIsProtected}
            <div class="row prompt-protected-note">
            </div>
          {/if}
        </div>
      {/key}
    {/if}

    <div class="row">
      {@render sectionLabel("Personas")}

      <div class="assistant-action-buttons">
        {@render personaActionButton("create", "Create Persona")}
        {@render personaActionButton("load", "Load Persona")}
        {@render personaActionButton("delete", "Delete Persona")}
      </div>

      {#if showPersonaCreate}
        <div class="assistant-action-buttons">
          <button
            type="button"
            class="btn"
            id="persona_copy_btn"
            onclick={() => {
              copyPersonaOpen = !copyPersonaOpen;
              selectedCopyPersonaId = "";
            }}
          >
            Copy Persona
          </button>
        </div>
      {/if}
    </div>

    {#if showPersonaCopySelect}
      <div class="row" id="persona_copy_select_row">
        <label for="persona_copy_select">Copy From Persona</label>

        <div class="inline-control-row">
          <select
            id="persona_copy_select"
            class="input"
            bind:value={selectedCopyPersonaId}
            disabled={!personas.length}
          >
            {#if personas.length}
              <option value="">Select a persona to copy</option>

              {#each personas as persona (persona.id)}
                <option value={persona.id}>
                  {persona.name || persona.id}{protectedPersonaIds.includes(persona.id) ? " (default)" : ""}
                </option>
              {/each}
            {:else}
              <option value="">No saved personas</option>
            {/if}
          </select>

          <button
            type="button"
            class="settings-action-button settings-save-button"
            id="persona_copy_confirm"
            aria-label="Copy persona"
            title="Copy persona"
            onclick={copyPersonaIntoCreate}
          >
            <Icon name="save" size={16} />
          </button>
        </div>
      </div>
    {/if}

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
                  {persona.name || persona.id}{protectedPersonaIds.includes(persona.id) ? " (default)" : ""}
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
              class="textarea persona-textarea"
              placeholder="Write the persona instructions here."
              bind:value={personaText}
              bind:this={personaTextarea}
              disabled={!personaCanEdit}
              readonly={!personaCanEdit}
            ></textarea>
          </div>

          {#if !personaCanEdit}
            <div class="row persona-protected-note">
            </div>
          {/if}
        </div>
      {/key}
    {/if}

    <div class="row assistant-compact-row">
      <div class="assistant-number-settings">
        <div class="assistant-compact-field">
          <label
            for="assistant_temperature"
            title="Controls response randomness. Higher temperature makes answers more creative and varied; lower temperature makes answers more precise and consistent."
          >
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
            bind:value={temperature}
            onchange={saveRuntimeSettings}
          />
        </div>

        <div class="assistant-compact-field">
          <label
            for="assistant_top_k"
            title="Limits how many likely next-word choices the model considers. Lower Top K makes responses more focused; higher Top K allows more variety."
          >
            Top K
          </label>
          <input
            id="assistant_top_k"
            class="input"
            type="number"
            min="0"
            step="1"
            placeholder="8"
            bind:value={topK}
            onchange={saveRuntimeSettings}
          />
        </div>

        <div class="assistant-compact-field">
          <label
            for="assistant_max_tokens"
            title="Sets the maximum response length. 512 tokens usually produces roughly 350–400 words, depending on formatting and word length."
          >
            Max Tokens
          </label>
          <input
            id="assistant_max_tokens"
            class="input"
            type="number"
            min="1"
            step="1"
            placeholder="512"
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
</BaseWindow>

<AssistantApiKeyPopup
  open={apiKeyManagerOpen}
  onClose={() => (apiKeyManagerOpen = false)}
  onChanged={loadRuntimeSettings}
  onToast={showToast}
/>

<style>
  .assistant-settings-form {
    display: grid;
    gap: 10px;
  }

  .assistant-action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    justify-content: flex-start;
  }

  .assistant-action-buttons .active {
    outline: 1px solid var(--accent);
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

  .persona-textarea {
    min-height: 90px;
    overflow: hidden;
    resize: none;
  }

  .prompt-protected-note,
  .persona-protected-note {
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
      flex-wrap: wrap;
    }

    .assistant-number-settings {
      grid-template-columns: 1fr;
      width: 100%;
    }

    .assistant-manage-buttons {
      margin-left: 0;
    }
  }
</style>
