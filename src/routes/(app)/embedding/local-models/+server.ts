import { error } from '@sveltejs/kit';
import { findLocalEmbeddingModel } from '$lib/constants';
import { localEmbeddingProvider } from '$lib/server/embeddings/registry';
import { refreshStaleEmbeddings } from '$lib/server/rag/embedding';
import { modelDownloadResponse } from '$lib/server/utils/model-download-response';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { fileName?: unknown } | null;
	const model = typeof body?.fileName === 'string' ? findLocalEmbeddingModel(body.fileName) : null;
	if (!model) throw error(400, 'Unknown local embedding model.');
	if (localEmbeddingProvider.downloadingFile) {
		throw error(409, 'An embedding model download is already running.');
	}

	return modelDownloadResponse('Embedding model download', model.fileName, async (onProgress) => {
		await localEmbeddingProvider.download(model.fileName, onProgress);
		refreshStaleEmbeddings();
	});
};
