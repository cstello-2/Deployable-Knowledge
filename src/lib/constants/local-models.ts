export const LOCAL_MODEL_PROVIDER_ID = 'llamacpp';

// Gemma weights ship under use-restricted terms rather than an open-source license,
// so the terms have to be reachable before a user starts a multi-gigabyte download.
const GEMMA_LICENSE = 'Gemma Terms of Use';
const GEMMA_LICENSE_URL = 'https://ai.google.dev/gemma/terms';

export interface LocalModel {
	name: string;
	vendor: string;
	description: string;
	repo: string;
	fileName: string;
	sizeBytes: number;
	minRamGiB: number;
	license: string;
	licenseUrl: string;
}

export const LOCAL_MODELS: readonly LocalModel[] = [
	{
		name: 'Gemma 4 E2B',
		vendor: 'Google',
		description: 'Lighter effective-2B variant for lower-RAM machines.',
		repo: 'unsloth/gemma-4-E2B-it-GGUF',
		fileName: 'gemma-4-E2B-it-Q4_K_M.gguf',
		sizeBytes: 3_110_000_000,
		minRamGiB: 8,
		license: GEMMA_LICENSE,
		licenseUrl: GEMMA_LICENSE_URL
	},
	{
		name: 'Gemma 4 E4B',
		vendor: 'Google',
		description: 'Runs CPU-only at readable speed on a modern laptop.',
		repo: 'unsloth/gemma-4-E4B-it-GGUF',
		fileName: 'gemma-4-E4B-it-Q4_K_M.gguf',
		sizeBytes: 4_980_000_000,
		minRamGiB: 16,
		license: GEMMA_LICENSE,
		licenseUrl: GEMMA_LICENSE_URL
	}
];

export const findLocalModelByFile = (fileName: string): LocalModel | null =>
	LOCAL_MODELS.find((model) => model.fileName === fileName) ?? null;
