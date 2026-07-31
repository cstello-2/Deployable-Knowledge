export const LOCAL_MODEL_PROVIDER_ID = 'llamacpp';

export interface LocalModel {
	name: string;
	vendor: string;
	description: string;
	repo: string;
	fileName: string;
	sizeBytes: number;
	minRamGiB: number;
}

export const LOCAL_MODELS: readonly LocalModel[] = [
	{
		name: 'Gemma 4 E2B',
		vendor: 'Google',
		description: 'Lighter effective-2B variant for lower-RAM machines.',
		repo: 'unsloth/gemma-4-E2B-it-GGUF',
		fileName: 'gemma-4-E2B-it-Q4_K_M.gguf',
		sizeBytes: 3_110_000_000,
		minRamGiB: 8
	},
	{
		name: 'Gemma 4 E4B',
		vendor: 'Google',
		description: 'Runs CPU-only at readable speed on a modern laptop.',
		repo: 'unsloth/gemma-4-E4B-it-GGUF',
		fileName: 'gemma-4-E4B-it-Q4_K_M.gguf',
		sizeBytes: 4_980_000_000,
		minRamGiB: 16
	}
];

export const findLocalModelByFile = (fileName: string): LocalModel | null =>
	LOCAL_MODELS.find((model) => model.fileName === fileName) ?? null;
