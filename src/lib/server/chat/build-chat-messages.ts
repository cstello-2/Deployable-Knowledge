import { CHAT_HISTORY_MESSAGE_LIMIT } from '$lib/constants';
import type { SessionMessage } from '$lib/server/database/schema';
import type { ProviderChatMessage } from '$lib/server/providers/provider';
import { toolRegistry } from '$lib/server/tools';
import {
	AGENT_SYSTEM_PROMPT,
	CONVERSATIONAL_SYSTEM_PROMPT,
	DOCUMENT_CONTEXT_SYSTEM_PROMPT,
	REFERENCE_MATERIAL_INSTRUCTION
} from '$lib/server/agent/prompts';

type ChatInput = {
	history: SessionMessage[];
	userMessage: string;
	context: string;
	toolNames: readonly string[];
};

export function createNotebookMessages({
	history,
	userMessage,
	context,
	toolNames
}: ChatInput): ProviderChatMessage[] {
	const request = context
		? `Reference material (background knowledge — do not reprint it):\n\n${context}\n\n${REFERENCE_MATERIAL_INSTRUCTION}\n\nRequest: ${userMessage}`
		: userMessage;
	return chatMessages([CONVERSATIONAL_SYSTEM_PROMPT, ...toolPrompts(toolNames)], history, request);
}

// When the search already ran for this prompt (auto-search), the model works
// from the retrieved context instead of being told to search.
export function createDocumentMessages({
	history,
	userMessage,
	context,
	toolNames,
	systemPrompt,
	persona,
	autoSearch
}: ChatInput & {
	systemPrompt: string;
	persona: string;
	autoSearch: boolean;
}): ProviderChatMessage[] {
	const system = [
		systemPrompt,
		persona.trim() ? `Persona: ${persona.trim()}` : '',
		...toolPrompts(toolNames),
		autoSearch ? DOCUMENT_CONTEXT_SYSTEM_PROMPT : ''
	];
	return chatMessages(
		system,
		history,
		context ? `${context}\n\nRequest: ${userMessage}` : userMessage
	);
}

function toolPrompts(toolNames: readonly string[]): string[] {
	return toolNames.length ? [AGENT_SYSTEM_PROMPT, ...toolRegistry.instructions(toolNames)] : [];
}

function chatMessages(
	system: string[],
	history: SessionMessage[],
	request: string
): ProviderChatMessage[] {
	const systemContent = system
		.map((part) => part.trim())
		.filter(Boolean)
		.join('\n\n');

	return [
		...(systemContent ? [{ role: 'system' as const, content: systemContent }] : []),
		...history
			.slice(-CHAT_HISTORY_MESSAGE_LIMIT)
			.flatMap(({ role, content }) =>
				role === 'user' || role === 'assistant' ? [{ role, content }] : []
			),
		{ role: 'user', content: request }
	];
}
