import { API_EMBEDDING } from '$lib/constants';
import type { ApiDocumentIngestProgress, ApiEmbeddingStatus, EmbeddingSettings } from '$lib/types';
import { apiDelete, apiFetch, apiPatch } from '$lib/utils';
import { streamModelDownload } from './model-download';

export class EmbeddingService {
	static getStatus() {
		return apiFetch<ApiEmbeddingStatus>(API_EMBEDDING.BASE);
	}

	static update(settings: EmbeddingSettings) {
		return apiPatch<ApiEmbeddingStatus, EmbeddingSettings>(API_EMBEDDING.BASE, settings);
	}

	static download(
		fileName: string,
		onProgress: (progress: ApiDocumentIngestProgress) => void
	): Promise<string> {
		return streamModelDownload(
			API_EMBEDDING.LOCAL_MODELS,
			fileName,
			'Downloading embedding model',
			onProgress
		);
	}

	static remove(fileName: string) {
		return apiDelete<{ fileName: string; deleted: boolean }>(API_EMBEDDING.localModel(fileName));
	}
}
