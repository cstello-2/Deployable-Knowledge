import { API_SETUP } from '$lib/constants';
import type {
	ApiEmbeddingModelInstallEvent,
	ApiEmbeddingModelStatus,
	ApiDocumentIngestProgress
} from '$lib/types';
import { apiFetch, apiStream, formatBytes, parseNdjsonStream } from '$lib/utils';

export class SetupService {
	static getStatus() {
		return apiFetch<ApiEmbeddingModelStatus>(API_SETUP);
	}

	static async install(
		onProgress?: (progress: ApiDocumentIngestProgress) => void,
		signal?: AbortSignal
	): Promise<void> {
		const response = await apiStream(API_SETUP, { method: 'POST', signal });
		for await (const event of parseNdjsonStream<ApiEmbeddingModelInstallEvent>(response, signal)) {
			if (event.status === 'progress') {
				onProgress?.({
					percent: event.progress,
					label: 'Installing embedding model',
					message: `${formatBytes(event.loaded)} / ${formatBytes(event.total)}`
				});
			} else if (event.status === 'error') {
				throw new Error(event.message);
			}
		}
	}
}
