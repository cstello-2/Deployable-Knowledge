import { RetrievalMode } from '$lib/enums';
import type { AssistantConfig } from '$lib/types';
import { REASONING_PRESETS } from './reasoning-presets';

export const AGENT_MAX_TURNS_MIN = 1;
export const AGENT_MAX_TURNS_UNLIMITED = -1;

export const DEFAULT_ASSISTANT_CONFIG: Readonly<AssistantConfig> = {
	provider: 'ollama',
	model: 'granite4:350m',
	maxTokens: 4096,
	temperature: 0.2,
	topK: 8,
	reasoningBudget: REASONING_PRESETS.low.budget,
	retrievalMode: RetrievalMode.HYBRID,
	ragTopK: 5,
	agentMaxTurns: 6,
	gpuMode: 'auto',
	promptTemplateId: null,
	persona: '',
	enabledTools: []
};
