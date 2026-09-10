import {
	Provider,
	type ProviderChatChunk,
	type ProviderChatMessage,
	type ProviderChatOptions
} from './provider';
import { createChatCodec, type ChatCodec } from './chat-codec';
import type { CustomProviderRecord } from '$lib/server/database/schema';
import { readObject } from '$lib/server/utils/values';

const MODEL_LIST_TIMEOUT_MS = 10_000;

export type OpenAiCompatibleConfig = Pick<
	CustomProviderRecord,
	'id' | 'name' | 'baseUrl' | 'apiKey'
>;

export class OpenAiCompatible extends Provider {
	override id: string;
	override name: string;
	protected readonly chatCodec: ChatCodec = createChatCodec({
		reasoningField: 'reasoning_content'
	});
	private readonly baseUrl: string;
	private readonly apiKey: string;

	constructor(config: OpenAiCompatibleConfig) {
		super();
		this.id = config.id;
		this.name = config.name;
		this.baseUrl = config.baseUrl;
		this.apiKey = config.apiKey;
	}

	override async *streamChat(
		messages: ProviderChatMessage[],
		model: string,
		options: ProviderChatOptions = {}
	): AsyncGenerator<ProviderChatChunk> {
		const tools = options.toolChoice === 'none' ? undefined : options.tools;

		const resp = await fetch(`${this.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages: messages.map(this.chatCodec.encodeMessage),
				temperature: options.temperature,
				max_tokens: options.maxTokens,
				...(tools?.length
					? {
							tools,
							tool_choice: options.toolChoice ?? 'auto',
							parallel_tool_calls: options.parallelToolCalls ?? true
						}
					: {}),
				stream: true
			}),
			signal: options.signal
		});

		if (!resp.ok) {
			throw new Error(`${this.name} chat failed (${resp.status}): ${await resp.text()}`);
		}

		yield* streamChatCompletion(resp, this.chatCodec);
	}

	override async listModels(): Promise<string[]> {
		const resp = await fetch(`${this.baseUrl}/models`, {
			headers: this.authHeaders(),
			signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
		});

		if (!resp.ok) {
			throw new Error(`${this.name} model list failed (${resp.status}): ${await resp.text()}`);
		}

		const data = readObject(await resp.json()).data;

		if (!Array.isArray(data)) {
			throw new Error(`${this.name} returned a model list without a data array.`);
		}

		return data
			.flatMap((value) => {
				const id = readObject(value).id;
				return typeof id === 'string' ? [id] : [];
			})
			.sort((a, b) => a.localeCompare(b));
	}

	private authHeaders(): Record<string, string> {
		return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
	}
}

async function* streamChatCompletion(
	response: Response,
	codec: ChatCodec
): AsyncGenerator<ProviderChatChunk> {
	const reader = response.body?.getReader();
	const decoder = new TextDecoder();

	if (!reader) throw new Error('Chat completion response body is unavailable.');

	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			buffer += decoder.decode(value, { stream: !done });

			const lines = buffer.split('\n');
			buffer = done ? '' : (lines.pop() ?? '');

			for (const line of lines) {
				const event = parseServerSentEvent(line, codec);
				if (event.done) return;
				if (event.chunk) yield event.chunk;
			}

			if (done) break;
		}
	} finally {
		reader.releaseLock();
	}
}

function parseServerSentEvent(
	line: string,
	codec: ChatCodec
): {
	done: boolean;
	chunk?: ProviderChatChunk;
} {
	const trimmed = line.trim();
	if (!trimmed.startsWith('data:')) return { done: false };

	const payload = trimmed.slice(5).trim();
	if (!payload) return { done: false };
	if (payload === '[DONE]') return { done: true };

	const parsed = JSON.parse(payload) as unknown;
	const record = readObject(parsed);
	const error = readObject(record.error);

	if (typeof error.message === 'string' && error.message) {
		throw new Error(error.message);
	}

	const choices = Array.isArray(record.choices) ? record.choices : [];
	const delta = readObject(readObject(choices[0]).delta);

	return { done: false, chunk: codec.decodeChunk(delta) ?? undefined };
}
