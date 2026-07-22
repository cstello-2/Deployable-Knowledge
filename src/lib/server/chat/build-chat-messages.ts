import { CHAT_HISTORY_MESSAGE_LIMIT } from '$lib/constants';
import type { SessionMessage } from '$lib/server/database/schema';
import type { ProviderChatMessage } from '$lib/server/providers/provider';
import {
	AGENT_SYSTEM_PROMPT,
	CONVERSATIONAL_SYSTEM_PROMPT,
	DOCUMENT_SEARCH_SYSTEM_PROMPT,
	REFERENCE_MATERIAL_INSTRUCTION
} from '$lib/server/agent/prompts';

export function createConversationalMessages(
	messages: SessionMessage[],
	userMessage: string,
	context = ''
): ProviderChatMessage[] {
	const output: ProviderChatMessage[] = [
		{ role: 'system', content: `${CONVERSATIONAL_SYSTEM_PROMPT}\n\n${AGENT_SYSTEM_PROMPT}` }
	];
	appendRecentHistory(output, messages);

	output.push({
		role: 'user',
		content: context
			? `Reference material (background knowledge — do not reprint it):\n\n${context}\n\n${REFERENCE_MATERIAL_INSTRUCTION}\n\nRequest: ${userMessage}`
			: userMessage
	});
	return output;
}

export function createDocumentMessages(
	messages: SessionMessage[],
	userMessage: string,
	systemPrompt = '',
	persona = ''
): ProviderChatMessage[] {
	const personaBlock = persona.trim() ? `Persona: ${persona.trim()}` : '';
	const systemParts = [
		systemPrompt,
		personaBlock,
		AGENT_SYSTEM_PROMPT,
		DOCUMENT_SEARCH_SYSTEM_PROMPT
	]
		.map((part) => part.trim())
		.filter(Boolean);
	const output: ProviderChatMessage[] = [];
	if (systemParts.length) output.push({ role: 'system', content: systemParts.join('\n\n') });
	appendRecentHistory(output, messages);
	output.push({ role: 'user', content: userMessage });
	return output;
}

function appendRecentHistory(output: ProviderChatMessage[], messages: SessionMessage[]): void {
	for (const message of messages.slice(-CHAT_HISTORY_MESSAGE_LIMIT)) {
		if (message.role === 'user' || message.role === 'assistant') {
			output.push({ role: message.role, content: message.content });
		}
	}
}
