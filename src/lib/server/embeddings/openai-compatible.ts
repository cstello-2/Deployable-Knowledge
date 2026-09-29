import type { EmbeddingTask } from '$lib/constants';
import type { CustomProviderRecord } from '$lib/server/database/schema';
import { EmbeddingProvider, normalizeVector } from './provider';

export class OpenAiCompatibleEmbeddingProvider extends EmbeddingProvider {
	override id: string;
	override name: string;
	private readonly baseUrl: string;
	private readonly apiKey: string;

	constructor(record: CustomProviderRecord) {
		super();
		this.id = record.id;
		this.name = record.name;
		this.baseUrl = record.baseUrl;
		this.apiKey = record.apiKey;
	}

	override async embed(
		texts: string[],
		_task: EmbeddingTask,
		model: string
	): Promise<Float32Array[]> {
		const response = await fetch(`${this.baseUrl}/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
			body: JSON.stringify({ model, input: texts })
		});

		if (!response.ok) {
			throw new Error(
				`${this.name} embeddings failed (${response.status}): ${await response.text()}`
			);
		}

		const { data } = (await response.json()) as {
			data: { index: number; embedding: number[] }[];
		};

		if (data.length !== texts.length) {
			throw new Error(`${this.name} did not return one embedding per input.`);
		}

		return data
			.sort((left, right) => left.index - right.index)
			.map(({ embedding }) => normalizeVector(embedding));
	}
}
