import { RetrievalMode } from '$lib/enums';
import type { AssistantConfig } from '$lib/types';

export const AGENT_MAX_TURNS_MIN = 1;
export const AGENT_MAX_TURNS_UNLIMITED = -1;

export const REASONING_BUDGET_UNLIMITED = -1;

export const DEFAULT_ASSISTANT_CONFIG: Readonly<AssistantConfig> = {
	provider: 'ollama',
	model: 'granite4:350m',
	maxTokens: 1024,
	temperature: 0.2,
	topK: 8,
	reasoningBudget: 512,
	retrievalMode: RetrievalMode.HYBRID,
	ragTopK: 5,
	agentMaxTurns: 4,
	contextSize: null,
	gpuMode: 'auto',
	promptTemplateId: null,
	persona: '',
	enabledTools: []
};
