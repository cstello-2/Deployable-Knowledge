import { CONTEXT_WINDOW_TOKENS_MAX } from '$lib/constants';
import {
	Provider,
	type ProviderChatChunk,
	type ProviderChatMessage,
	type ProviderChatOptions
} from './provider';

const OLLAMA_URL = 'http://localhost:11434';

type OllamaChatResponse = {
	message?: {
		content: string;
		thinking?: string;
		tool_calls?: { id?: string; function: { name: string; arguments: unknown } }[];
	};
	error?: string;
};

export class Ollama extends Provider {
	override id = 'ollama';
	override name = 'Ollama';

	override async *streamChat(
		messages: ProviderChatMessage[],
		model: string,
		options: ProviderChatOptions = {}
	): AsyncGenerator<ProviderChatChunk> {
		const response = await fetch(`${OLLAMA_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal: options.signal,
			body: JSON.stringify({
				model,
				messages: messages.map((message) => ({
					role: message.role,
					content: message.content ?? '',
					thinking: message.reasoning_content,
					tool_calls: message.tool_calls?.map((call) => ({
						id: call.id,
						function: { name: call.function.name, arguments: JSON.parse(call.function.arguments) }
					})),
					tool_name: message.name,
					tool_call_id: message.tool_call_id
				})),
				tools: options.tools,
				options: {
					num_ctx: CONTEXT_WINDOW_TOKENS_MAX,
					num_predict: options.maxTokens,
					temperature: options.temperature,
					top_k: options.topK
				},
				stream: true
			})
		});

		if (!response.ok) {
			throw new Error(`Ollama chat failed (${response.status}): ${await response.text()}`);
		}

		const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
		let buffer = '';
		let toolCallCount = 0;

		for (let read = await reader.read(); !read.done; read = await reader.read()) {
			const lines = (buffer + read.value).split('\n');
			buffer = lines.pop()!;

			for (const line of lines) {
				if (!line.trim()) continue;

				const { message, error } = JSON.parse(line) as OllamaChatResponse;
				if (error) throw new Error(error);
				if (!message) continue;

				yield {
					content: message.content,
					reasoning_content: message.thinking,
					tool_calls: message.tool_calls?.map((call) => ({
						index: toolCallCount++,
						id: call.id,
						function: {
							name: call.function.name,
							arguments: JSON.stringify(call.function.arguments)
						}
					}))
				};
			}
		}
	}

	override async listModels(): Promise<string[]> {
		const response = await fetch(`${OLLAMA_URL}/api/tags`, {
			signal: AbortSignal.timeout(10_000)
		});

		if (!response.ok) {
			throw new Error(`Ollama model list failed (${response.status}): ${await response.text()}`);
		}

		const { models } = (await response.json()) as { models: { name: string }[] };
		return models.map((model) => model.name).sort((a, b) => a.localeCompare(b));
	}

	override async supportsTools(model: string): Promise<boolean> {
		try {
			const response = await fetch(`${OLLAMA_URL}/api/show`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model }),
				signal: AbortSignal.timeout(2500)
			});
			const { capabilities } = (await response.json()) as { capabilities?: string[] };
			return capabilities?.includes('tools') ?? true;
		} catch {
			return true;
		}
	}
}
