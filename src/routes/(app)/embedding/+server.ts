import { error, json } from '@sveltejs/kit';
import {
	EMBEDDING_DEVICES,
	findLocalEmbeddingModel,
	LOCAL_EMBEDDING_MODELS,
	LOCAL_MODEL_PROVIDER_ID
} from '$lib/constants';
import type { ApiEmbeddingStatus, EmbeddingSettings } from '$lib/types';
import {
	findEmbeddingProvider,
	listEmbeddingProviders,
	localEmbeddingProvider
} from '$lib/server/embeddings/registry';
import { countStaleEmbeddings, refreshStaleEmbeddings } from '$lib/server/rag/embedding';
import { getActiveEmbedding, updateEmbeddingSettings } from '$lib/server/rag/embedding-model';
import type { RequestHandler } from './$types';

async function embeddingStatus(): Promise<ApiEmbeddingStatus> {
	const { provider, settings, key } = await getActiveEmbedding();
	const providers = await listEmbeddingProviders();
	const localModels = await Promise.all(
		LOCAL_EMBEDDING_MODELS.map(async ({ fileName }) => ({
			fileName,
			downloaded: await localEmbeddingProvider.isInstalled(fileName)
		}))
	);

	return {
		settings,
		providers: providers.map(({ id, name }) => ({ id, name })),
		localModels,
		ready: await provider.isInstalled(settings.model),
		backend: provider.backend(),
		pendingChunks: await countStaleEmbeddings(key)
	};
}

export const GET: RequestHandler = async () => json(await embeddingStatus());

export const PATCH: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as Partial<
		Record<keyof EmbeddingSettings, unknown>
	> | null;

	const provider =
		typeof body?.provider === 'string' ? await findEmbeddingProvider(body.provider) : null;
	if (!provider) throw error(400, 'Unknown embedding provider.');

	const model = typeof body?.model === 'string' ? body.model.trim() : '';
	if (!model) throw error(400, 'Choose an embedding model.');
	if (provider.id === LOCAL_MODEL_PROVIDER_ID && !findLocalEmbeddingModel(model)) {
		throw error(400, 'Unknown local embedding model.');
	}

	const device = EMBEDDING_DEVICES.find((value) => value === body?.device);
	if (!device) throw error(400, 'Unknown compute device.');

	await updateEmbeddingSettings({ provider: provider.id, model, device });
	refreshStaleEmbeddings();
	return json(await embeddingStatus());
};
