import { get, writable } from "svelte/store";
import { dkClient, type ProviderRecord, type UserSettings } from "./sdk";
import { currentUser } from "./sessionState";
import { errorMessage } from "./errors";

export const ACTIVE_PERSONA_STORAGE_KEY = "persona";

export type AssistantRuntimeState = {
  providerId: string;
  modelId: string;
  templateId: string;
  topK: number;
  providers: ProviderRecord[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

export type ModelOption = {
  value: string;
  label: string;
};

export type AssistantRuntimePayload = {
  provider_id?: string;
  model_id?: string;
  prompt_template_id?: string | null;
  temperature?: number;
  max_tokens?: number;
  top_k?: number;
};

export type AssistantRuntimeData = {
  userId: string;
  settings: UserSettings;
  providers: ProviderRecord[];
  runtime: AssistantRuntimeState;
};

const defaultRuntime: AssistantRuntimeState = {
  providerId: "",
  modelId: "",
  templateId: "rag_chat",
  topK: 8,
  providers: [],
  loaded: false,
  loading: false,
  error: null,
};

export const assistantRuntime = writable<AssistantRuntimeState>(defaultRuntime);

type LoadAssistantRuntimeOptions = {
  force?: boolean;
  refresh?: boolean;
};

export async function loadAssistantRuntime({
  force = false,
  refresh = true,
}: LoadAssistantRuntimeOptions = {}) {
  const current = get(assistantRuntime);
  if (!force && current.loaded && current.providerId && current.modelId) {
    return current;
  }

  const { runtime } = await loadAssistantRuntimeData({ refresh });
  return runtime;
}

export async function loadAssistantRuntimeData({
  refresh = true,
} = {}): Promise<AssistantRuntimeData> {
  assistantRuntime.update((state) => ({
    ...state,
    loading: true,
    error: null,
  }));

  try {
    const data = await fetchAssistantRuntime({ refresh });
    const { runtime } = data;
    const next = { ...runtime, loaded: true, loading: false };

    assistantRuntime.set(next);
    return { ...data, runtime: next };
  } catch (error) {
    assistantRuntime.update((state) => ({
      ...state,
      loaded: true,
      loading: false,
      error: errorMessage(error),
    }));
    throw error;
  }
}

export async function fetchAssistantRuntime({
  refresh = true,
} = {}): Promise<AssistantRuntimeData> {
  const userId = await currentUserId();
  const [settings, providerData] = await Promise.all([
    dkClient.getSettings(userId),
    dkClient.listProviders({ refresh }),
  ]);
  const providers = providerData.providers || [];

  return {
    userId,
    settings,
    providers,
    runtime: runtimeFromSettings(settings, providers),
  };
}

export async function saveAssistantRuntime(
  userId: string,
  payload: AssistantRuntimePayload,
  { refresh = false } = {},
) {
  await dkClient.patchSettings(userId, payload as Record<string, unknown>);
  return loadAssistantRuntime({ force: true, refresh });
}

export function runtimeFromSettings(
  settings: UserSettings,
  providers: ProviderRecord[],
): AssistantRuntimeState {
  const savedProviderId = settingString(
    settings,
    "provider_id",
    providers[0]?.id || "ollama",
  );
  const providerId = providers.some(
    (provider) => provider.id === savedProviderId,
  )
    ? savedProviderId
    : providers[0]?.id || "ollama";
  const provider = providers.find((item) => item.id === providerId);
  const modelId =
    settingString(settings, "model_id") || firstModelId(provider?.models || []);

  return {
    ...defaultRuntime,
    providerId,
    modelId,
    templateId: settingString(settings, "prompt_template_id", "rag_chat"),
    topK: settingNumber(settings, "top_k", 8),
    providers,
    loaded: true,
    error: modelId ? null : "Assistant model is not configured.",
  };
}

export function modelOptionsForProvider(
  providers: ProviderRecord[],
  providerId: string,
  selectedModel: string | null = null,
) {
  const provider = providers.find((item) => item.id === providerId);
  const models = ((provider?.models || []) as unknown[])
    .map((model) => ({
      value: modelOptionValue(model),
      label: modelOptionLabel(model),
    }))
    .filter((model) => model.value);

  if (selectedModel && !models.some((model) => model.value === selectedModel)) {
    models.push({
      value: selectedModel,
      label: `${selectedModel} (current)`,
    });
  }

  if (!models.length) {
    return [
      {
        value: "",
        label: "No models available",
      },
    ];
  }

  return models;
}

export function getActivePersona() {
  return localStorage.getItem(ACTIVE_PERSONA_STORAGE_KEY) || "";
}

export function setActivePersona(text: string) {
  localStorage.setItem(ACTIVE_PERSONA_STORAGE_KEY, text || "");
}

async function currentUserId() {
  const user = get(currentUser);
  if (user?.user) return user.user;

  const response = await dkClient.getUser();
  return response.user || "default";
}

function settingString(settings: UserSettings, key: string, fallback = "") {
  const value = settings[key];
  return typeof value === "string" && value ? value : fallback;
}

function settingNumber(settings: UserSettings, key: string, fallback: number) {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : fallback;
}

function firstModelId(models: unknown[]) {
  return models.map(modelOptionValue).find(Boolean) || "";
}

function modelOptionValue(model: unknown) {
  if (typeof model === "string") return model;
  if (model && typeof model === "object") {
    const row = model as Record<string, unknown>;
    return String(row.id ?? row.name ?? row.label ?? "");
  }
  return "";
}

function modelOptionLabel(model: unknown) {
  if (typeof model === "string") return model;
  if (model && typeof model === "object") {
    const row = model as Record<string, unknown>;
    return String(row.label ?? row.id ?? row.name ?? "");
  }
  return "";
}
