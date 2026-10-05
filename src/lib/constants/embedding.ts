import { LOCAL_MODEL_PROVIDER_ID, type DownloadableModel } from './local-models';

export const EMBEDDING_DEVICES = ['auto', 'cpu', 'gpu'] as const;

export type EmbeddingDevice = (typeof EMBEDDING_DEVICES)[number];
export type EmbeddingTask = 'search_document' | 'search_query';

export interface LocalEmbeddingModel extends DownloadableModel {
	prefixes: Record<EmbeddingTask, string>;
}

export const LOCAL_EMBEDDING_MODELS: readonly LocalEmbeddingModel[] = [
	{
		name: 'Nomic Embed Text v1.5',
		vendor: 'Nomic AI',
		description: 'Fast general-purpose English embeddings. Runs on the GPU when one is available.',
		repo: 'nomic-ai/nomic-embed-text-v1.5-GGUF',
		fileName: 'nomic-embed-text-v1.5.Q8_0.gguf',
		sizeBytes: 146_146_432,
		license: 'Apache 2.0',
		licenseUrl: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5',
		prefixes: { search_document: 'search_document: ', search_query: 'search_query: ' }
	}
];

export const DEFAULT_EMBEDDING_SETTINGS = {
	provider: LOCAL_MODEL_PROVIDER_ID,
	model: LOCAL_EMBEDDING_MODELS[0].fileName,
	device: 'auto'
} as const satisfies { provider: string; model: string; device: EmbeddingDevice };

export function findLocalEmbeddingModel(fileName: string): LocalEmbeddingModel | undefined {
	return LOCAL_EMBEDDING_MODELS.find((model) => model.fileName === fileName);
}
