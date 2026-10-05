import type { CustomProviderRecord } from '$lib/server/database/schema';
import {
	Provider,
	type ProviderChatChunk,
	type ProviderChatMessage,
	type ProviderChatOptions
} from './provider';

type ChatCompletionChunk = {
	choices?: { delta?: ProviderChatChunk }[];
	error?: { message: string };
};

export class OpenAiCompatible extends Provider {
	override id: string;
	override name: string;
	private readonly baseUrl: string;
	private readonly headers: Record<string, string>;

	constructor(record: CustomProviderRecord) {
		super();
		this.id = record.id;
		this.name = record.name;
		this.baseUrl = record.baseUrl;
		this.headers = {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${record.apiKey}`
		};
	}

	override async *streamChat(
		messages: ProviderChatMessage[],
		model: string,
		options: ProviderChatOptions = {}
	): AsyncGenerator<ProviderChatChunk> {
		const response = await fetch(`${this.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: this.headers,
			signal: options.signal,
			body: JSON.stringify({
				model,
				messages,
				tools: options.tools,
				parallel_tool_calls: options.tools ? true : undefined,
				temperature: options.temperature,
				max_tokens: options.maxTokens,
				stream: true
			})
		});

		if (!response.ok) {
			throw new Error(`${this.name} chat failed (${response.status}): ${await response.text()}`);
		}

		const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
		let buffer = '';

		for (let read = await reader.read(); !read.done; read = await reader.read()) {
			const lines = (buffer + read.value).split('\n');
			buffer = lines.pop()!;

			for (const line of lines) {
				if (!line.startsWith('data:')) continue;
				const data = line.slice(5).trim();
				if (data === '[DONE]') return;

				const chunk = JSON.parse(data) as ChatCompletionChunk;
				if (chunk.error) throw new Error(chunk.error.message);
				const delta = chunk.choices?.[0]?.delta;
				if (delta) yield delta;
			}
		}
	}

	override async listModels(): Promise<string[]> {
		const response = await fetch(`${this.baseUrl}/models`, {
			headers: this.headers,
			signal: AbortSignal.timeout(10_000)
		});

		if (!response.ok) {
			throw new Error(
				`${this.name} model list failed (${response.status}): ${await response.text()}`
			);
		}

		const { data } = (await response.json()) as { data: { id: string }[] };
		return data.map((model) => model.id).sort((a, b) => a.localeCompare(b));
	}
}
