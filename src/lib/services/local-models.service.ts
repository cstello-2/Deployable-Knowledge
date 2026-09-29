import { API_LOCAL_MODELS } from '$lib/constants';
import type { ApiDocumentIngestProgress, ApiLocalModelsStatus } from '$lib/types';
import { apiDelete, apiFetch } from '$lib/utils';
import { streamModelDownload } from './model-download';

export class LocalModelsService {
	static getStatus() {
		return apiFetch<ApiLocalModelsStatus>(API_LOCAL_MODELS.BASE);
	}

	static download(
		fileName: string,
		onProgress?: (progress: ApiDocumentIngestProgress) => void,
		signal?: AbortSignal
	): Promise<string> {
		return streamModelDownload(
			API_LOCAL_MODELS.BASE,
			fileName,
			'Downloading model',
			onProgress,
			signal
		);
	}

	static remove(fileName: string) {
		return apiDelete<{ fileName: string; deleted: boolean }>(API_LOCAL_MODELS.byFile(fileName));
	}
}
