import {
	Provider,
	type ProviderChatChunk,
	type ProviderChatMessage,
	type ProviderChatOptions
} from './provider';
import { createChatCodec } from './chat-codec';
import { readObject } from '$lib/server/utils/values';

const GITHUB_API_URL = 'https://models.github.ai';
const chatCodec = createChatCodec({
	assistantNullContent: 'preserve',
	reasoningField: 'reasoning_content',
	toolArguments: 'string',
	toolCallChunks: 'delta',
	toolResultNameField: 'name'
});

export class Github extends Provider {
	override id = 'github';
	override name = 'GitHub Models';
	override apiKeyRequired = true;

	override async *streamChat(
		messages: ProviderChatMessage[],
		model: string,
		options: ProviderChatOptions = {}
	): AsyncGenerator<ProviderChatChunk> {
		const apiKey = await this.getApiKey();
		const tools = options.toolChoice === 'none' ? undefined : options.tools;

		// No top_k for Github Models
		const req = new Request(`${GITHUB_API_URL}/inference/chat/completions`, {
			method: 'POST',
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${apiKey}`,
				'X-GitHub-Api-Version': '2026-03-10',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model,
				messages: messages.map(chatCodec.encodeMessage),
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

		const resp = await fetch(req);

		if (!resp.ok) {
			throw new Error(`GitHub Models chat failed (${resp.status}): ${await resp.text()}`);
		}

		yield* streamGithubChatResponse(resp);
	}

	override async listModels(): Promise<string[]> {
		return ['openai/gpt-4.1'];
	}
}

async function* streamGithubChatResponse(response: Response): AsyncGenerator<ProviderChatChunk> {
	const reader = response.body?.getReader();
	const decoder = new TextDecoder();

	if (!reader) throw new Error('GitHub Models response body is unavailable.');

	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			buffer += decoder.decode(value, { stream: !done });

			const lines = buffer.split('\n');
			buffer = done ? '' : (lines.pop() ?? '');

			for (const line of lines) {
				const event = parseServerSentEvent(line);
				if (event.done) return;
				if (event.chunk) yield event.chunk;
			}

			if (done) break;
		}
	} finally {
		reader.releaseLock();
	}
}

function parseServerSentEvent(line: string): {
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

	return { done: false, chunk: chatCodec.decodeChunk(delta) ?? undefined };
}
