import { TITLE_GENERATION_PROMPT } from '$lib/server/agent/prompts';
import type { Provider, ProviderChatOptions } from '$lib/server/providers/provider';

// A title is a handful of tokens, but it runs as a second generation and holds
// the single local-model lock while it does. Inheriting the conversation's
// budget let a thinking model deliberate for ~10s over seven words, delaying the
// next message; these caps produced equally good titles in testing.
const TITLE_MAX_TOKENS = 64;
const TITLE_REASONING_BUDGET = 0;

export async function generateChatTitle(
	userMessage: string,
	provider: Provider,
	modelId: string,
	options: ProviderChatOptions
): Promise<string> {
	let title = '';
	for await (const chunk of provider.chat(`${TITLE_GENERATION_PROMPT}\n\n${userMessage}`, modelId, {
		temperature: options.temperature,
		topK: options.topK,
		signal: options.signal,
		maxTokens: TITLE_MAX_TOKENS,
		reasoningBudget: TITLE_REASONING_BUDGET
	})) {
		title += chunk;
	}
	return title.trim().split('\n')[0] || 'New conversation';
}
