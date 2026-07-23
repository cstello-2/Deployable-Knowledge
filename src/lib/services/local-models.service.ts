import { API_LOCAL_MODELS } from '$lib/constants';
import type {
	ApiDocumentIngestProgress,
	ApiLocalModelDownloadEvent,
	ApiLocalModelDownloadRequest,
	ApiLocalModelsStatus
} from '$lib/types';
import { apiDelete, apiFetch, apiStream, formatBytes, parseNdjsonStream } from '$lib/utils';

export class LocalModelsService {
	static getStatus() {
		return apiFetch<ApiLocalModelsStatus>(API_LOCAL_MODELS.BASE);
	}

	static async download(
		fileName: string,
		onProgress?: (progress: ApiDocumentIngestProgress) => void,
		signal?: AbortSignal
	): Promise<string> {
		const body: ApiLocalModelDownloadRequest = { fileName };
		const response = await apiStream(API_LOCAL_MODELS.BASE, {
			method: 'POST',
			body: JSON.stringify(body),
			signal
		});

		let downloadedFile: string | null = null;

		for await (const event of parseNdjsonStream<ApiLocalModelDownloadEvent>(response, signal)) {
			if (event.status === 'progress') {
				onProgress?.({
					percent: event.progress * 100,
					label: 'Downloading model',
					message: `${formatBytes(event.loaded)} / ${formatBytes(event.total)}`
				});
			} else if (event.status === 'ready') {
				downloadedFile = event.fileName;
			} else if (event.status === 'error') {
				throw new Error(event.message);
			}
		}

		if (!downloadedFile) throw new Error('The model download ended unexpectedly.');

		return downloadedFile;
	}

	static remove(fileName: string) {
		return apiDelete<{ fileName: string; deleted: boolean }>(API_LOCAL_MODELS.byFile(fileName));
	}
}
