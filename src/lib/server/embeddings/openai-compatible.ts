import type { EmbeddingTask } from '$lib/constants';
import {
	openAiAuthHeaders,
	type OpenAiCompatibleConfig
} from '$lib/server/providers/openai-compatible';
import { readObject } from '$lib/server/utils/values';
import { EmbeddingProvider, normalizeVector } from './provider';

export class OpenAiCompatibleEmbeddingProvider extends EmbeddingProvider {
	override id: string;
	override name: string;
	private readonly baseUrl: string;
	private readonly apiKey: string;

	constructor(config: OpenAiCompatibleConfig) {
		super();
		this.id = config.id;
		this.name = config.name;
		this.baseUrl = config.baseUrl;
		this.apiKey = config.apiKey;
	}

	override async embed(
		texts: string[],
		_task: EmbeddingTask,
		model: string
	): Promise<Float32Array[]> {
		const response = await fetch(`${this.baseUrl}/embeddings`, {
			method: 'POST',
			headers: { ...openAiAuthHeaders(this.apiKey), 'Content-Type': 'application/json' },
			body: JSON.stringify({ model, input: texts })
		});

		if (!response.ok) {
			throw new Error(
				`${this.name} embeddings failed (${response.status}): ${await response.text()}`
			);
		}

		const data = readObject(await response.json()).data;
		if (!Array.isArray(data) || data.length !== texts.length) {
			throw new Error(`${this.name} did not return one embedding per input.`);
		}

		const entries = data.map((entry) => {
			const { index, embedding } = readObject(entry);
			if (
				typeof index !== 'number' ||
				!Array.isArray(embedding) ||
				!embedding.every((value) => typeof value === 'number')
			) {
				throw new Error(`${this.name} returned a malformed embedding.`);
			}
			return { index, embedding };
		});

		return entries
			.sort((left, right) => left.index - right.index)
			.map(({ embedding }) => normalizeVector(embedding));
	}
}
