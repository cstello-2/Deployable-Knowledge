import { API_SETUP } from '$lib/constants';
import type {
	ApiEmbeddingModelInstallEvent,
	ApiEmbeddingModelStatus,
	ApiDocumentIngestProgress
} from '$lib/types';
import { apiFetch, apiStream, parseNdjsonStream } from '$lib/utils';

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

function formatBytes(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
	return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
