import { TITLE_GENERATION_PROMPT } from '$lib/server/agent/prompts';
import type { Provider, ProviderChatOptions } from '$lib/server/providers/provider';

export async function generateChatTitle(
	userMessage: string,
	provider: Provider,
	modelId: string,
	options: ProviderChatOptions
): Promise<string> {
	let title = '';
	for await (const chunk of provider.chat(
		`${TITLE_GENERATION_PROMPT}\n\n${userMessage}`,
		modelId,
		options
	)) {
		title += chunk;
	}
	return title.trim().split('\n')[0] || 'New conversation';
}
