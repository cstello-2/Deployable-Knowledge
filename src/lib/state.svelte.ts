import type { Session, UserSettings } from "$lib/server/database/schema";

export type Settings = {
  provider: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topK: number;
  prompt: string;
  persona: string;
};

class AppState {
  currentSession = $state<Session | undefined>(undefined);
  currentProviderId = $state("ollama");
  currentModelId = $state("granite4:350m");
  maxTokens = $state(512);
  temperature = $state(0.2);
  topK = $state(8);
  prompt = $state("");
  persona = $state("");

  constructor(settings?: UserSettings | null) {
    this.applySettings(settings);
  }

  applySettings(settings?: UserSettings | null) {
    if (!settings) return;

    this.currentProviderId = settings.provider || "ollama";
    this.currentModelId = settings.model || "granite4:350m";
    this.maxTokens = settings.maxTokens ?? 512;
    this.temperature = settings.temperature ?? 0.2;
    this.topK = settings.topK ?? 8;
    this.prompt = settings.prompt || "";
    this.persona = settings.persona || "";
  }

  get settings(): Settings {
    return {
      provider: this.currentProviderId,
      model: this.currentModelId,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      topK: this.topK,
      prompt: this.prompt,
      persona: this.persona,
    };
  }
}

export function createAppState(settings?: UserSettings | null) {
  return new AppState(settings);
}

export type { AppState };
