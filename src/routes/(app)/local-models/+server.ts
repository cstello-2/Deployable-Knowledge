import { json } from '@sveltejs/kit';

import { LOCAL_MODELS, findLocalModelByFile } from '$lib/constants/local-models';
import {
	cancelActiveDownload,
	downloadLocalModel,
	getActiveDownloadFile,
	listLocalModelFiles
} from '$lib/server/providers/llamacpp-runtime';
import type {
	ApiLocalModelDownloadEvent,
	ApiLocalModelInfo,
	ApiLocalModelsStatus
} from '$lib/types';
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
		downloadingFile: getActiveDownloadFile()
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

	const encoder = new TextEncoder();
	let connected = true;

	const stream = new ReadableStream({
		async start(controller) {
			const send = (event: ApiLocalModelDownloadEvent) => {
				if (!connected) return;

				try {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				} catch {
					connected = false;
				}
			};

			let lastProgress = 0;
			let lastSentAt = 0;

			try {
				const fileName = await downloadLocalModel(model, (loaded, total) => {
					if (!total) return;

					const progress = loaded / total;
					const now = Date.now();

					if (progress - lastProgress < 0.01 && now - lastSentAt < 300 && progress < 1) return;

					lastProgress = progress;
					lastSentAt = now;
					send({ status: 'progress', progress, loaded, total });
				});

				send({ status: 'ready', fileName });
			} catch (error) {
				send({
					status: 'error',
					message: error instanceof Error ? error.message : 'Model download failed'
				});
			} finally {
				if (connected) controller.close();
			}
		},
		cancel() {
			connected = false;
			cancelActiveDownload();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'Cache-Control': 'no-cache'
		}
	});
};
