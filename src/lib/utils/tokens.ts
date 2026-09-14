import { CHAT_HISTORY_MESSAGE_LIMIT, ESTIMATED_CHARACTERS_PER_TOKEN } from '$lib/constants';

const PER_MESSAGE_OVERHEAD_TOKENS = 8;

const SYSTEM_PROMPT_TOKENS = {
	notebook: { withTools: 1_040, withoutTools: 515 },
	document: { withTools: 825, withoutTools: 0 }
} as const;

const DOCUMENT_CONTEXT_POLICY_TOKENS = 180;

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / ESTIMATED_CHARACTERS_PER_TOKEN);
}

export function estimateMessageTokens(content: string): number {
	return PER_MESSAGE_OVERHEAD_TOKENS + estimateTokens(content);
}

export function estimateSystemPromptTokens({
	autoSearchEnabled,
	notebookMode,
	toolsEnabled
}: {
	autoSearchEnabled: boolean;
	notebookMode: boolean;
	toolsEnabled: boolean;
}): number {
	const mode = SYSTEM_PROMPT_TOKENS[notebookMode ? 'notebook' : 'document'];
	const policyTokens = autoSearchEnabled ? DOCUMENT_CONTEXT_POLICY_TOKENS : 0;
	return (toolsEnabled ? mode.withTools : mode.withoutTools) + policyTokens;
}

export function estimateHistoryTokens(
	messages: readonly { role: string; content: string }[]
): number {
	let total = 0;

	for (const message of messages.slice(-CHAT_HISTORY_MESSAGE_LIMIT)) {
		if (message.role !== 'user' && message.role !== 'assistant') continue;

		total += estimateMessageTokens(message.content);
	}

	return total;
}
