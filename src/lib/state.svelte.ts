import type {
  NotebookPage,
  NotebookWithPages,
  PromptTemplate,
  Session,
  UserSettings,
} from "$lib/server/database/schema";

export type RetrievalMode = "semantic" | "bm25" | "hybrid" | "graph";

export type Settings = {
  provider: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topK: number;
  promptTemplateId: string | null;
  persona: string;
  retrievalMode: RetrievalMode;
  ragTopK: number;
};

class AppState {
  currentSession = $state<Session | undefined>(undefined);
  notebooks = $state<NotebookWithPages[]>([]);
  activeNotebookId = $state<string | null>(null);
  activeNotebook = $state<NotebookWithPages | null>(null);
  activePage = $state<NotebookPage | null>(null);
  currentProviderId = $state("ollama");
  currentModelId = $state("granite4:350m");
  maxTokens = $state(512);
  temperature = $state(0.2);
  topK = $state(8);
  promptTemplateId = $state("");
  promptTemplates = $state<PromptTemplate[]>([]);
  persona = $state("");
  retrievalMode = $state<RetrievalMode>("hybrid");
  ragTopK = $state(5);
  lastQuery = $state("");

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
    this.promptTemplateId = settings.promptTemplateId || "";
    this.persona = settings.persona || "";
    this.retrievalMode = readRetrievalMode(settings.retrievalMode);
    this.ragTopK = settings.ragTopK ?? 5;
  }

  get settings(): Settings {
    return {
      provider: this.currentProviderId,
      model: this.currentModelId,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      topK: this.topK,
      promptTemplateId: this.promptTemplateId || null,
      persona: this.persona,
      retrievalMode: this.retrievalMode,
      ragTopK: this.ragTopK,
    };
  }
}

export function createAppState(settings?: UserSettings | null) {
  return new AppState(settings);
}

export type { AppState };

function readRetrievalMode(value: unknown): RetrievalMode {
  if (value === "semantic" || value === "bm25" || value === "hybrid" || value === "graph") {
    return value;
  }

  return "hybrid";
}
