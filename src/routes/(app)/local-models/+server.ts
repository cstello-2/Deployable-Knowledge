import { json } from '@sveltejs/kit';

import { LOCAL_MODELS, findLocalModelByFile } from '$lib/constants/local-models';
import {
	cancelActiveDownload,
	downloadLocalModel,
	getActiveDownloadFile,
	getSupportedGpuTypes,
	listLocalModelFiles
} from '$lib/server/providers/llamacpp-runtime';
import { modelDownloadResponse } from '$lib/server/utils/model-download-response';
import type { ApiLocalModelInfo, ApiLocalModelsStatus } from '$lib/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const files = await listLocalModelFiles();
	const downloaded = new Set(files);

	const models: ApiLocalModelInfo[] = LOCAL_MODELS.map((model) => ({
		fileName: model.fileName,
		sizeBytes: model.sizeBytes,
		downloaded: downloaded.has(model.fileName)
	}));

	for (const fileName of files) {
		if (!findLocalModelByFile(fileName)) {
			models.push({ fileName, sizeBytes: null, downloaded: true });
		}
	}

	const status: ApiLocalModelsStatus = {
		models,
		downloadingFile: getActiveDownloadFile(),
		gpu: { supported: await getSupportedGpuTypes() }
	};

	return json(status);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { fileName?: unknown } | null;
	const model = typeof body?.fileName === 'string' ? findLocalModelByFile(body.fileName) : null;

	if (!model) return json({ error: 'Unknown model.' }, { status: 400 });
	if (getActiveDownloadFile()) {
		return json({ error: 'A model download is already in progress.' }, { status: 409 });
	}

	return modelDownloadResponse(
		'Model download',
		model.fileName,
		(onProgress) => downloadLocalModel(model, onProgress),
		cancelActiveDownload
	);
};
