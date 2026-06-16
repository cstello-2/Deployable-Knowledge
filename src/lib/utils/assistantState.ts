export type BuiltInPromptTemplate = {
  id: string;
  name: string;
  description: string;
  system: string;
  includeHistory: boolean;
  temperature: number;
  topK: number;
  maxTokens: number;
  builtIn: true;
};

export type BuiltInPersona = {
  id: string;
  name: string;
  text: string;
  builtIn: true;
};

export const builtInTemplates: BuiltInPromptTemplate[] = [
  {
    id: "default",
    name: "Plain Chat",
    description:
      "General-purpose assistant mode with no special retrieval behavior. Good for normal questions, explanations, and quick help.",
    system:
      "You are a helpful, clear, and practical assistant. Answer the user's request directly. Use simple wording unless the user asks for technical depth. If information is missing, make a reasonable assumption and state it briefly.",
    includeHistory: true,
    temperature: 0.2,
    topK: 8,
    maxTokens: 512,
    builtIn: true,
  },
  {
    id: "rag_chat",
    name: "RAG Chat",
    description:
      "Context-first assistant for answering questions using uploaded documents, synced folders, retrieved chunks, and project files.",
    system:
      "You are a RAG helper. ONLY reference text that is provided in context. DO NOT provide text that is not in context. If you do not know the answer, say I do not know it.",
    includeHistory: true,
    temperature: 0.2,
    topK: 8,
    maxTokens: 512,
    builtIn: true,
  },
  {
    id: "tech_helper",
    name: "Technical Helper",
    description:
      "Direct technical assistant for debugging, software changes, engineering explanations, and implementation steps.",
    system:
      "You are a precise technical helper. Give direct, implementation-ready answers. Prefer concrete steps, filenames, function names, and code snippets over broad explanations. Do not add fluff. When debugging, identify the likely cause, explain why it happens, and give the smallest safe fix first.",
    includeHistory: true,
    temperature: 0.2,
    topK: 8,
    maxTokens: 768,
    builtIn: true,
  },
  {
    id: "title_summarizer",
    name: "Title Summarizer",
    description:
      "Generates a short, useful title for a chat or session.",
    system:
      "You write short, informative chat titles. Return only the title. Do not use quotation marks. Do not add commentary. Keep the title under 7 words when possible.",
    includeHistory: false,
    temperature: 0.2,
    topK: 8,
    maxTokens: 40,
    builtIn: true,
  },
];

export const builtInPersonas: BuiltInPersona[] = [
  {
    id: "creative_writer",
    name: "Creative Writer",
    builtIn: true,
    text: "You are a creative writer with 10 years of experience. Your goal is to help users produce imaginative, polished, and engaging writing. Communicate in a vivid and expressive manner. Mix short, punchy lines with longer, atmospheric thoughts. Use sensory details, emotional language, and strong imagery naturally. Always preserve the user's intended message, genre, and audience. Never make the writing overly generic, flat, or robotic. If you lack information, ask for the missing context or make a clearly labeled creative assumption. Start with a brief creative direction or framing note. Present your main points in polished paragraphs, scenes, outlines, or revised drafts as appropriate. End with a short note on possible next edits or improvements.",
  },
  {
    id: "technical_writer",
    name: "Technical Writer",
    builtIn: true,
    text: "You are a technical writer with 10 years of experience. Your goal is to turn complex information into clear, accurate, and usable documentation. Communicate in a precise and organized manner. Use direct explanations, clean structure, and minimal filler. Use technical terminology naturally, but define it when the audience may not know it. Always prioritize clarity, correctness, and step-by-step usability. Never overcomplicate the explanation or hide important assumptions. If you lack information, identify the missing details and give the safest usable version based on what is known. Start with a brief summary of the goal or issue. Present your main points in numbered steps, labeled sections, tables, or concise bullets as appropriate. End with a verification step, test command, or checklist when useful.",
  },
  {
    id: "consultant",
    name: "Consultant",
    builtIn: true,
    text: "You are a consultant with 12 years of experience. Your goal is to help users make practical decisions, improve workflows, and identify the highest-impact next steps. Communicate in a strategic and direct manner. Balance concise recommendations with enough reasoning to support the decision. Use business, operations, and planning terminology naturally without sounding overly corporate. Always focus on tradeoffs, priorities, risks, and actionable next steps. Never give vague advice without explaining what to do next. If you lack information, state the assumption you are making and recommend what information should be gathered. Start with the main recommendation. Present your main points in prioritized bullets, decision matrices, or action plans as appropriate. End with the next concrete action the user should take.",
  },
];

export const protectedTemplateIds = new Set(
  builtInTemplates.map((template) => template.id),
);

export const protectedPersonaIds = new Set(
  builtInPersonas.map((persona) => persona.id),
);

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

let activePersonaText = "";

function mergeById<T extends { id: string }>(
  builtIns: readonly T[],
  saved: readonly T[],
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of [...builtIns, ...saved]) {
    if (seen.has(item.id)) continue;

    seen.add(item.id);
    merged.push(item);
  }

  return merged;
}

function toClientData(data: AssistantStateResponse): AssistantRuntimeData {
  const settings = data.settings;

  const providerId = settings.providerId ?? settings.provider_id ?? "ollama";
  const modelId = settings.modelId ?? settings.model_id ?? "";
  const templateId =
    settings.promptTemplateId ?? settings.prompt_template_id ?? "rag_chat";
  const personaId = settings.personaId ?? settings.persona_id ?? null;

  const topK = settings.topK ?? settings.top_k ?? 8;
  const maxTokens = settings.maxTokens ?? settings.max_tokens ?? 512;

  return {
    userId: settings.userId ?? settings.user_id ?? "default",
    settings: {
      temperature: settings.temperature ?? 0.2,
      max_tokens: maxTokens,
      top_k: topK,
    },
    runtime: {
      providerId,
      modelId,
      templateId,
      personaId,
    },
    providers: data.providers ?? [],
    templates: mergeById<PromptTemplate>(
      builtInTemplates,
      data.templates ?? [],
    ),
    personas: mergeById<PersonaRecord>(
      builtInPersonas,
      data.personas ?? [],
    ),
    profiles: data.profiles ?? [],
  };
}

async function requestAssistantState(
  body?: unknown,
): Promise<AssistantStateResponse> {
  const response = await fetch("/assistant", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(text || `Assistant state request failed: ${response.status}`);
  }

  return (await response.json()) as AssistantStateResponse;
}

export async function loadAssistantRuntimeData(
  options: { refresh?: boolean } = {},
): Promise<AssistantRuntimeData> {
  const data = await requestAssistantState();
  const clientData = toClientData(data);

  activePersonaText =
    clientData.personas.find(
      (persona) => persona.id === clientData.runtime.personaId,
    )?.text ?? "";

  return clientData;
}

export async function saveAssistantRuntime(
  _userId: string,
  payload: AssistantRuntimePayload,
): Promise<AssistantRuntimeData> {
  const data = await requestAssistantState({
    action: "settings.save",
    settings: {
      providerId: payload.providerId ?? payload.provider_id ?? "ollama",
      modelId: payload.modelId ?? payload.model_id ?? "",
      promptTemplateId:
        payload.promptTemplateId ?? payload.prompt_template_id ?? "rag_chat",
      personaId: payload.personaId ?? payload.persona_id ?? null,
      temperature: payload.temperature ?? 0.2,
      topK: payload.topK ?? payload.top_k ?? 8,
      maxTokens: payload.maxTokens ?? payload.max_tokens ?? 512,
    },
  });

  const clientData = toClientData(data);

  activePersonaText =
    clientData.personas.find(
      (persona) => persona.id === clientData.runtime.personaId,
    )?.text ?? "";

  return clientData;
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