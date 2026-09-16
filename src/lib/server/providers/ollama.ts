import { CONTEXT_WINDOW_TOKENS_MAX } from '$lib/constants';
import { cachedCapability } from './capability-cache';
import { OpenAiCompatible } from './openai-compatible';
import { readObject } from '$lib/server/utils/values';
import type { ProviderChatChunk, ProviderChatMessage, ProviderChatOptions } from './provider';

const OLLAMA_URL = 'http://localhost:11434';

type OllamaChatMessage = {
	role: ProviderChatMessage['role'];
	content: string;
	thinking?: string;
	tool_calls?: {
		id?: string;
		function: { name: string; arguments: Record<string, unknown> };
	}[];
	tool_name?: string;
	tool_call_id?: string;
};

type OllamaChatResponse = {
	message?: OllamaChatMessage;
	error?: string;
	done: boolean;
};

export class Ollama extends OpenAiCompatible {
	constructor() {
		super({ id: 'ollama', name: 'Ollama', baseUrl: `${OLLAMA_URL}/v1`, apiKey: '' });
	}

	override async *streamChat(
		messages: ProviderChatMessage[],
		model: string,
		options: ProviderChatOptions = {}
	): AsyncGenerator<ProviderChatChunk> {
		const tools = options.toolChoice === 'none' ? undefined : options.tools;
		const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages: messages.map(encodeOllamaMessage),
				tools: tools?.length ? tools : undefined,
				options: {
					num_ctx: CONTEXT_WINDOW_TOKENS_MAX,
					num_predict: options.maxTokens,
					temperature: options.temperature,
					top_k: options.topK
				},
				stream: true
			}),
			signal: options.signal
		});

		if (!resp.ok) {
			throw new Error(`Ollama chat failed (${resp.status}): ${await resp.text()}`);
		}

		yield* streamOllamaChat(resp);
	}

	override supportsTools(model: string): Promise<boolean> {
		return cachedCapability(`ollama:${model}`, async () => {
			const resp = await fetch(`${OLLAMA_URL}/api/show`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model }),
				signal: AbortSignal.timeout(2500)
			});

			if (!resp.ok) return true;
			const data = readObject(await resp.json());

			if (!Array.isArray(data.capabilities)) return true;
			return data.capabilities.includes('tools');
		});
	}
}

function encodeOllamaMessage(message: ProviderChatMessage): OllamaChatMessage {
	const encoded: OllamaChatMessage = {
		role: message.role,
		content: message.content ?? ''
	};

	if (message.role === 'assistant') {
		encoded.thinking = message.reasoningContent;
		encoded.tool_calls = message.toolCalls?.map((call) => ({
			id: call.id,
			function: {
				name: call.function.name,
				arguments: JSON.parse(call.function.arguments) as Record<string, unknown>
			}
		}));
	}

	if (message.role === 'tool') {
		encoded.tool_name = message.name;
		encoded.tool_call_id = message.toolCallId;
	}

	return encoded;
}

async function* streamOllamaChat(response: Response): AsyncGenerator<ProviderChatChunk> {
	const reader = response.body?.getReader();
	if (!reader) throw new Error('Ollama chat response body is unavailable.');
	const decoder = new TextDecoder();
	let buffer = '';
	let toolCallCount = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			buffer += decoder.decode(value, { stream: !done });
			const lines = buffer.split('\n');
			buffer = done ? '' : (lines.pop() ?? '');

			for (const line of lines) {
				if (!line.trim()) continue;
				const record = JSON.parse(line) as OllamaChatResponse;
				if (record.error) throw new Error(record.error);

				if (record.message) {
					const chunk = decodeOllamaChunk(record.message, toolCallCount);
					toolCallCount += chunk.toolCalls?.length ?? 0;
					if (chunk.content || chunk.reasoningContent || chunk.toolCalls) yield chunk;
				}
				if (record.done) return;
			}

			if (done) break;
		}
	} finally {
		reader.releaseLock();
	}
}

function decodeOllamaChunk(message: OllamaChatMessage, toolCallOffset: number): ProviderChatChunk {
	const chunk: ProviderChatChunk = {};
	if (message.content) chunk.content = message.content;
	if (message.thinking) chunk.reasoningContent = message.thinking;
	if (!message.tool_calls?.length) return chunk;

	chunk.toolCalls = message.tool_calls.map((call, index) => ({
		index: toolCallOffset + index,
		id: call.id,
		nameSnapshot: call.function.name,
		argumentsSnapshot: call.function.arguments
	}));
	return chunk;
}
