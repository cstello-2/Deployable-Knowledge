import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import type { ChatHistoryItem, ChatModelFunctions, ChatModelResponse } from 'node-llama-cpp';

import {
	Provider,
	type ProviderChatChunk,
	type ProviderChatMessage,
	type ProviderChatOptions,
	type ProviderToolDefinition
} from './provider';
import {
	generateChatResponse,
	listLocalModelFiles,
	resolveLocalModelPath
} from './llamacpp-runtime';

export class LlamaCpp extends Provider {
	override id = 'llamacpp';
	override name = 'Local (llama.cpp)';
	override apiKeyRequired = false;

	override async *streamChat(
		messages: ProviderChatMessage[],
		model: string,
		options: ProviderChatOptions = {}
	): AsyncGenerator<ProviderChatChunk> {
		const modelPath = resolveLocalModelPath(model);

		if (!existsSync(modelPath)) {
			throw new Error(`Local model "${model}" is not downloaded.`);
		}

		const tools = options.toolChoice === 'none' ? undefined : options.tools;
		const functions = toChatModelFunctions(tools);
		const queue = createChunkQueue<ProviderChatChunk>();

		const run = generateChatResponse({
			modelPath,
			history: toChatHistory(messages),
			functions,
			temperature: options.temperature,
			topK: options.topK,
			maxTokens: options.maxTokens,
			reasoningBudget: options.reasoningBudget,
			contextSize: options.contextSize,
			gpuMode: options.gpuMode,
			signal: options.signal,
			onText: (text) => queue.push({ content: text }),
			onReasoning: (text) => queue.push({ reasoningContent: text })
		}).then(
			(result) => {
				if (result.functionCalls.length) {
					queue.push({
						toolCalls: result.functionCalls.map((call, index) => ({
							index,
							id: `call_${randomUUID().slice(0, 8)}`,
							nameSnapshot: call.functionName,
							argumentsSnapshot: call.params ?? {}
						}))
					});
				}
				queue.close();
			},
			(error) => queue.fail(error)
		);

		yield* queue;
		await run;
	}

	override async listModels(): Promise<string[]> {
		return listLocalModelFiles();
	}
}

function createChunkQueue<T>() {
	const items: T[] = [];
	let done = false;
	let error: unknown = null;
	let notify: (() => void) | null = null;

	const wake = () => {
		notify?.();
		notify = null;
	};

	return {
		push(item: T) {
			items.push(item);
			wake();
		},
		close() {
			done = true;
			wake();
		},
		fail(err: unknown) {
			error = err;
			done = true;
			wake();
		},
		async *[Symbol.asyncIterator]() {
			while (true) {
				const item = items.shift();

				if (item !== undefined) {
					yield item;
					continue;
				}

				if (done) {
					if (error) throw error;
					return;
				}

				await new Promise<void>((resolve) => (notify = resolve));
			}
		}
	};
}

function toChatHistory(messages: ProviderChatMessage[]): ChatHistoryItem[] {
	const history: ChatHistoryItem[] = [];

	messages.forEach((message, index) => {
		switch (message.role) {
			case 'system':
				history.push({ type: 'system', text: message.content ?? '' });
				break;
			case 'user':
				history.push({ type: 'user', text: message.content ?? '' });
				break;
			case 'assistant':
				history.push(toModelResponse(message, messages.slice(index + 1)));
				break;
			case 'tool':
				// Consumed by the preceding assistant message's tool-call mapping.
				break;
		}
	});

	return history;
}

function toModelResponse(
	message: ProviderChatMessage,
	followingMessages: ProviderChatMessage[]
): ChatModelResponse {
	const response: ChatModelResponse['response'] = [];

	if (message.content) response.push(message.content);

	const results = followingMessages.filter((candidate) => candidate.role === 'tool');

	(message.toolCalls ?? []).forEach((call, index) => {
		const result = results.find((candidate) => candidate.toolCallId === call.id) ?? results[index];

		response.push({
			type: 'functionCall',
			name: call.function.name,
			params: parseJsonSafe(call.function.arguments),
			result: result?.content ?? '',
			...(index === 0 ? { startsNewChunk: true } : {})
		});
	});

	return { type: 'model', response };
}

function parseJsonSafe(value: string): unknown {
	if (!value) return {};

	try {
		return JSON.parse(value) as unknown;
	} catch {
		return {};
	}
}

function toChatModelFunctions(
	tools: ProviderToolDefinition[] | undefined
): ChatModelFunctions | undefined {
	if (!tools?.length) return undefined;

	const functions: Record<string, { description?: string; params?: unknown }> = {};

	for (const tool of tools) {
		functions[tool.function.name] = {
			description: tool.function.description,
			params: sanitizeGbnfSchema(tool.function.parameters)
		};
	}

	return functions as ChatModelFunctions;
}

// node-llama-cpp enforces params with a GBNF grammar that supports only a
// subset of JSON Schema; unknown keywords throw at generation time.
const GBNF_SCHEMA_KEYS = new Set([
	'type',
	'description',
	'enum',
	'const',
	'properties',
	'items',
	'prefixItems',
	'oneOf',
	'minItems',
	'maxItems'
]);

function sanitizeGbnfSchema(schema: unknown): unknown {
	if (Array.isArray(schema)) return schema.map(sanitizeGbnfSchema);
	if (schema === null || typeof schema !== 'object') return schema;

	const result: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(schema)) {
		if (!GBNF_SCHEMA_KEYS.has(key)) continue;

		if (key === 'properties' && value !== null && typeof value === 'object') {
			result[key] = Object.fromEntries(
				Object.entries(value).map(([name, child]) => [name, sanitizeGbnfSchema(child)])
			);
		} else if (key === 'items' || key === 'prefixItems' || key === 'oneOf') {
			result[key] = sanitizeGbnfSchema(value);
		} else {
			result[key] = value;
		}
	}

	return result;
}
