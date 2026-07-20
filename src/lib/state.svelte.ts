import type {
  NotebookPage,
  NotebookWithPages,
  PromptTemplate,
  Session,
} from "$lib/server/database/schema";

export class AppState {
  currentSession = $state<Session | undefined>(undefined);
  notebooks = $state<NotebookWithPages[]>([]);
  activeNotebookId = $state<string | null>(null);
  activeNotebook = $state<NotebookWithPages | null>(null);
  activePage = $state<NotebookPage | null>(null);
  activeProfileId = $state<string | null>(null);
  currentProviderId = $state("ollama");
  currentModelId = $state("granite4:350m");
  maxTokens = $state(1024);
  temperature = $state(0.2);
  topK = $state(8);
  promptTemplateId = $state("");
  promptTemplates = $state<PromptTemplate[]>([]);
  persona = $state("");
  ragTopK = $state(5);
  agentMaxTurns = $state(4);
  lastQuery = $state("");
}
