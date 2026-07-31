import { CHAT_HISTORY_MESSAGE_LIMIT } from '$lib/constants';
import type { SessionMessage } from '$lib/server/database/schema';
import type { ProviderChatMessage } from '$lib/server/providers/provider';
import {
	AGENT_SYSTEM_PROMPT,
	CONVERSATIONAL_SYSTEM_PROMPT,
	DOCUMENT_CONTEXT_SYSTEM_PROMPT,
	REFERENCE_MATERIAL_INSTRUCTION
} from '$lib/server/agent/prompts';

export function createConversationalMessages({
	messages,
	userMessage,
	context = '',
	toolsEnabled = true,
	toolInstructions = []
}: {
	messages: SessionMessage[];
	userMessage: string;
	context?: string;
	toolsEnabled?: boolean;
	toolInstructions?: readonly string[];
}): ProviderChatMessage[] {
	const output: ProviderChatMessage[] = [
		{
			role: 'system',
			content: joinPrompts([
				CONVERSATIONAL_SYSTEM_PROMPT,
				...(toolsEnabled ? [AGENT_SYSTEM_PROMPT, ...toolInstructions] : [])
			])
		}
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

export function createDocumentMessages({
	messages,
	userMessage,
	systemPrompt = '',
	persona = '',
	context = '',
	toolsEnabled = true,
	toolInstructions = [],
	searchToolEnabled = toolsEnabled
}: {
	messages: SessionMessage[];
	userMessage: string;
	systemPrompt?: string;
	persona?: string;
	context?: string;
	toolsEnabled?: boolean;
	toolInstructions?: readonly string[];
	searchToolEnabled?: boolean;
}): ProviderChatMessage[] {
	const personaBlock = persona.trim() ? `Persona: ${persona.trim()}` : '';
	// Each enabled tool contributes its own policy block. Without the search
	// tool the search already ran for this prompt, so the model works from the
	// retrieved context instead of being told to search.
	const retrievalPolicy = [
		...(toolsEnabled ? [AGENT_SYSTEM_PROMPT, ...toolInstructions] : []),
		...(searchToolEnabled ? [] : [DOCUMENT_CONTEXT_SYSTEM_PROMPT])
	];
	const systemContent = joinPrompts([systemPrompt, personaBlock, ...retrievalPolicy]);
	const output: ProviderChatMessage[] = [];
	if (systemContent) output.push({ role: 'system', content: systemContent });
	appendRecentHistory(output, messages);
	output.push({
		role: 'user',
		content: context ? `${context}\n\nRequest: ${userMessage}` : userMessage
	});
	return output;
}

function joinPrompts(parts: string[]): string {
	return parts
		.map((part) => part.trim())
		.filter(Boolean)
		.join('\n\n');
}

function appendRecentHistory(output: ProviderChatMessage[], messages: SessionMessage[]): void {
	for (const message of messages.slice(-CHAT_HISTORY_MESSAGE_LIMIT)) {
		if (message.role === 'user' || message.role === 'assistant') {
			output.push({ role: message.role, content: message.content });
		}
	}
}
