import { existsSync } from 'node:fs';
import { PassThrough } from 'node:stream';

import type { ChatHistoryItem, ChatModelFunctions } from 'node-llama-cpp';

import {
	Provider,
	type ProviderChatChunk,
	type ProviderChatMessage,
	type ProviderChatOptions
} from './provider';
import { listLocalModelFiles, resolveLocalModelPath, withChat } from './llamacpp-runtime';

export class LlamaCpp extends Provider {
	override id = 'llamacpp';
	override name = 'Local (llama.cpp)';

	override async *streamChat(
		messages: ProviderChatMessage[],
		model: string,
		options: ProviderChatOptions = {}
	): AsyncGenerator<ProviderChatChunk> {
		const modelPath = resolveLocalModelPath(model);

		if (!existsSync(modelPath)) {
			throw new Error(`Local model "${model}" is not downloaded.`);
		}

		const budget = options.reasoningBudget;
		const thoughtTokens = budget !== undefined && budget < 0 ? Infinity : budget;
		const functions =
			options.tools &&
			(Object.fromEntries(
				options.tools.map(({ function: fn }) => [
					fn.name,
					{ description: fn.description, params: fn.parameters }
				])
			) as ChatModelFunctions);
		const chunks = new PassThrough({ objectMode: true });

		withChat(modelPath, options.gpuMode ?? 'auto', options.signal, (chat) =>
			chat.generateResponse(toChatHistory(messages), {
				functions,
				budgets: thoughtTokens === undefined ? undefined : { thoughtTokens },
				maxTokens:
					options.maxTokens === undefined
						? undefined
						: options.maxTokens + Math.max(0, budget ?? 0),
				temperature: options.temperature,
				topK: options.topK,
				signal: options.signal,
				onResponseChunk(chunk) {
					if (chunk.type === 'segment') chunks.write({ reasoning_content: chunk.text });
					else if (chunk.type == null) chunks.write({ content: chunk.text });
				}
			})
		).then(
			({ functionCalls = [] }) => {
				chunks.end({
					tool_calls: functionCalls.map((call, index) => ({
						index,
						function: { name: call.functionName, arguments: JSON.stringify(call.params ?? {}) }
					}))
				});
			},
			(error) => chunks.destroy(error)
		);

		yield* chunks;
	}

	override async listModels(): Promise<string[]> {
		return listLocalModelFiles();
	}
}

function toChatHistory(messages: ProviderChatMessage[]): ChatHistoryItem[] {
	const toolResults = new Map(
		messages
			.filter((message) => message.role === 'tool')
			.map((message) => [message.tool_call_id, message.content])
	);

	return messages.flatMap((message): ChatHistoryItem[] => {
		switch (message.role) {
			case 'system':
				return [{ type: 'system', text: message.content ?? '' }];
			case 'user':
				return [{ type: 'user', text: message.content ?? '' }];
			case 'assistant':
				return [
					{
						type: 'model',
						response: [
							...(message.content ? [message.content] : []),
							...(message.tool_calls ?? []).map((call, index) => ({
								type: 'functionCall' as const,
								name: call.function.name,
								params: JSON.parse(call.function.arguments) as unknown,
								result: toolResults.get(call.id) ?? '',
								startsNewChunk: index === 0
							}))
						]
					}
				];
			case 'tool':
				return [];
		}
	});
}
