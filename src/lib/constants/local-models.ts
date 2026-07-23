export const LOCAL_MODEL_PROVIDER_ID = 'llamacpp';

export type LocalModelTierId = 'medium' | 'high' | 'moe';

export interface LocalModelTier {
	id: LocalModelTierId;
	label: string;
	name: string;
	vendor: string;
	description: string;
	repo: string;
	fileName: string;
	sizeBytes: number;
	minRamGiB: number;
}

export const LOCAL_MODEL_TIERS: readonly LocalModelTier[] = [
	{
		id: 'medium',
		label: 'Balanced',
		name: 'Granite 4.1 3B',
		vendor: 'IBM',
		description: 'Granite 4.1 3B — solid quality and tool use on mid-range machines.',
		repo: 'ibm-granite/granite-4.1-3b-GGUF',
		fileName: 'granite-4.1-3b-Q4_K_M.gguf',
		sizeBytes: 2_100_000_000,
		minRamGiB: 8
	},
	{
		id: 'high',
		label: 'Quality',
		name: 'Gemma 4 E4B',
		vendor: 'Google',
		description: 'Runs CPU-only at readable speed on a modern laptop.',
		repo: 'unsloth/gemma-4-E4B-it-GGUF',
		fileName: 'gemma-4-E4B-it-Q4_K_M.gguf',
		sizeBytes: 4_980_000_000,
		minRamGiB: 16
	},
	{
		id: 'moe',
		label: 'Efficient',
		name: 'LFM2.5 8B MoE',
		vendor: 'Liquid AI',
		description:
			'LFM2.5 8B MoE — runs at conversational speed on a standard-issue laptop CPU (i5/i7-class, 16 GB RAM, no GPU needed); keep ~8 GB of memory free while it is loaded.',
		repo: 'LiquidAI/LFM2.5-8B-A1B-GGUF',
		fileName: 'LFM2.5-8B-A1B-Q4_K_M.gguf',
		sizeBytes: 5_160_000_000,
		minRamGiB: 16
	}
];

export const findLocalModelTier = (id: string): LocalModelTier | null =>
	LOCAL_MODEL_TIERS.find((tier) => tier.id === id) ?? null;

export const findLocalModelTierByFile = (fileName: string): LocalModelTier | null =>
	LOCAL_MODEL_TIERS.find((tier) => tier.fileName === fileName) ?? null;
