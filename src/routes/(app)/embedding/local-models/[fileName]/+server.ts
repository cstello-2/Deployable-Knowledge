import { error, json } from '@sveltejs/kit';
import { findLocalEmbeddingModel, LOCAL_MODEL_PROVIDER_ID } from '$lib/constants';
import { localEmbeddingProvider } from '$lib/server/embeddings/registry';
import { getCurrentEmbeddingSettings } from '$lib/server/rag/embedding-model';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params }) => {
	if (!findLocalEmbeddingModel(params.fileName)) throw error(404, 'Unknown local embedding model.');

	const settings = await getCurrentEmbeddingSettings();
	if (settings.provider === LOCAL_MODEL_PROVIDER_ID && settings.model === params.fileName) {
		throw error(409, 'Choose another embedding model before deleting this one.');
	}

	await localEmbeddingProvider.remove(params.fileName);
	return json({ fileName: params.fileName, deleted: true });
};
