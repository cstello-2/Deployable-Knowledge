export type ProviderRecord = {
  id: string;
  name?: string;
  label?: string;
  models?: string[];
};

export type ModelOption = {
  value: string;
  label: string;
};

export type PromptTemplate = {
  id: string;
  name: string;
  description?: string;
  system: string;

  user_format?: string;
  context_item_format?: string;
  context_header?: string;
  context_join?: string;
  persona_format?: string;
  history_separator?: string;

  include_history?: boolean;
  includeHistory?: boolean;

  temperature?: number | null;
  max_tokens?: number | null;
  maxTokens?: number | null;
  top_k?: number | null;
  topK?: number | null;

  builtIn?: boolean;
};

export type PersonaRecord = {
  id: string;
  name: string;
  text: string;
};

export type AssistantProfile = {
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
  temperature: number;
  topK?: number;
  top_k?: number;
  maxTokens?: number;
  max_tokens?: number;
};

export type AssistantRuntimeSettings = {
  id: string;
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

  temperature: number;

  topK?: number;
  top_k?: number;

  maxTokens?: number;
  max_tokens?: number;

  updatedAt?: string;
  updated_at?: string;
};

export type AssistantRuntimePayload = {
  provider_id?: string;
  providerId?: string;

  model_id?: string;
  modelId?: string;

  prompt_template_id?: string;
  promptTemplateId?: string;

  persona_id?: string | null;
  personaId?: string | null;

  temperature?: number;
  max_tokens?: number;
  maxTokens?: number;
  top_k?: number;
  topK?: number;
};

export type AssistantRuntimeData = {
  userId: string;
  settings: {
    temperature: number;
    max_tokens: number;
    top_k: number;
  };
  runtime: {
    providerId: string;
    modelId: string;
    templateId: string;
    personaId: string | null;
  };
  providers: ProviderRecord[];
  templates: PromptTemplate[];
  personas: PersonaRecord[];
  profiles: AssistantProfile[];
};

type AssistantStateResponse = {
  settings: AssistantRuntimeSettings;
  templates: PromptTemplate[];
  personas: PersonaRecord[];
  profiles: AssistantProfile[];
  providers: ProviderRecord[];
};

let cachedRuntime: AssistantStateResponse | null = null;
let activePersonaText = "";

function getProviderId(settings: AssistantRuntimeSettings) {
  return settings.providerId ?? settings.provider_id ?? "ollama";
}

function getModelId(settings: AssistantRuntimeSettings) {
  return settings.modelId ?? settings.model_id ?? "";
}

function getPromptTemplateId(settings: AssistantRuntimeSettings) {
  return settings.promptTemplateId ?? settings.prompt_template_id ?? "rag_chat";
}

function getPersonaId(settings: AssistantRuntimeSettings) {
  return settings.personaId ?? settings.persona_id ?? null;
}

function getTopK(settings: AssistantRuntimeSettings) {
  return settings.topK ?? settings.top_k ?? 8;
}

function getMaxTokens(settings: AssistantRuntimeSettings) {
  return settings.maxTokens ?? settings.max_tokens ?? 512;
}

function toClientData(data: AssistantStateResponse): AssistantRuntimeData {
  return {
    userId: data.settings.userId ?? data.settings.user_id ?? "default",
    settings: {
      temperature: data.settings.temperature ?? 0.2,
      max_tokens: getMaxTokens(data.settings),
      top_k: getTopK(data.settings),
    },
    runtime: {
      providerId: getProviderId(data.settings),
      modelId: getModelId(data.settings),
      templateId: getPromptTemplateId(data.settings),
      personaId: getPersonaId(data.settings),
    },
    providers: data.providers ?? [],
    templates: data.templates ?? [],
    personas: data.personas ?? [],
    profiles: data.profiles ?? [],
  };
}

async function requestAssistantState(
  body?: unknown,
): Promise<AssistantStateResponse> {
  const response = await fetch("/assistant-state", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Assistant state request failed: ${response.status}`);
  }

  const data = (await response.json()) as AssistantStateResponse;

  cachedRuntime = data;

  const activePersonaId = getPersonaId(data.settings);
  activePersonaText =
    data.personas.find((persona) => persona.id === activePersonaId)?.text ?? "";

  return data;
}

export async function loadAssistantRuntimeData(
  _options: { refresh?: boolean } = {},
): Promise<AssistantRuntimeData> {
  const data = await requestAssistantState();
  return toClientData(data);
}

export async function saveAssistantRuntime(
  _userId: string,
  payload: AssistantRuntimePayload,
): Promise<AssistantRuntimeData> {
  const data = await requestAssistantState({
    action: "settings.save",
    settings: {
      providerId: payload.providerId ?? payload.provider_id,
      modelId: payload.modelId ?? payload.model_id,
      promptTemplateId: payload.promptTemplateId ?? payload.prompt_template_id,
      personaId: payload.personaId ?? payload.persona_id ?? null,
      temperature: payload.temperature,
      topK: payload.topK ?? payload.top_k,
      maxTokens: payload.maxTokens ?? payload.max_tokens,
    },
  });

  return toClientData(data);
}

export function modelOptionsForProvider(
  providers: ProviderRecord[],
  providerId: string,
  selectedModel: string | null = null,
): ModelOption[] {
  const provider = providers.find((item) => item.id === providerId);
  const models = provider?.models ?? [];

  if (!models.length && selectedModel) {
    return [{ value: selectedModel, label: selectedModel }];
  }

  return models.map((model) => ({
    value: model,
    label: model,
  }));
}

export function getActivePersona(): string {
  return activePersonaText;
}

export function setActivePersona(personaText: string | null) {
  activePersonaText = personaText ?? "";
}