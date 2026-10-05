import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { DEFAULT_EMBEDDING_SETTINGS, type EmbeddingTask } from '$lib/constants';
import type { EmbeddingSettings } from '$lib/types';
import { getEmbeddingSettings, setEmbeddingSettings } from '$lib/server/database/app-state';
import type { EmbeddingProvider } from '$lib/server/embeddings/provider';
import { findEmbeddingProvider } from '$lib/server/embeddings/registry';

const EMBEDDING_BATCH_SIZE = 16;

type ActiveEmbedding = {
	provider: EmbeddingProvider;
	settings: EmbeddingSettings;
	key: string;
};

export type EmbeddingBatch = {
	key: string;
	vectors: Float32Array[];
};

let cachedSettings: Promise<EmbeddingSettings> | undefined;

export function getCurrentEmbeddingSettings(): Promise<EmbeddingSettings> {
	cachedSettings ??= getEmbeddingSettings().catch((error) => {
		cachedSettings = undefined;
		throw error;
	});
	return cachedSettings;
}

export async function getActiveEmbedding(): Promise<ActiveEmbedding> {
	const current = await getCurrentEmbeddingSettings();
	const provider = await findEmbeddingProvider(current.provider);
	if (!provider) throw new Error('The embedding provider no longer exists.');

	return { provider, settings: current, key: `${provider.id}/${current.model}` };
}

export async function updateEmbeddingSettings(next: EmbeddingSettings): Promise<void> {
	const previous = await getCurrentEmbeddingSettings();
	await setEmbeddingSettings(next);
	cachedSettings = Promise.resolve(next);
	await (await findEmbeddingProvider(previous.provider))?.unload();
}

export async function resetEmbeddingProvider(providerId: string): Promise<void> {
	const current = await getCurrentEmbeddingSettings();
	if (current.provider === providerId) await updateEmbeddingSettings(DEFAULT_EMBEDDING_SETTINGS);
}

export async function isEmbeddingModelInstalled(): Promise<boolean> {
	const { provider, settings } = await getActiveEmbedding();
	return provider.isInstalled(settings.model);
}

export async function embedTexts(
	texts: string[],
	task: EmbeddingTask,
	onProgress?: (current: number, total: number) => void
): Promise<EmbeddingBatch> {
	const { provider, settings, key } = await getActiveEmbedding();
	const vectors: Float32Array[] = [];

	for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
		const batch = texts.slice(index, index + EMBEDDING_BATCH_SIZE);
		vectors.push(...(await provider.embed(batch, task, settings.model, settings.device)));
		onProgress?.(Math.min(index + EMBEDDING_BATCH_SIZE, texts.length), texts.length);
		await yieldEventLoop();
	}

	return { key, vectors };
}
