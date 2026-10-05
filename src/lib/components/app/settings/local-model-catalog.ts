import type { Component } from 'svelte';
import type { DownloadableModel } from '$lib/constants';
import GemmaIcon from './icons/GemmaIcon.svelte';

export const LOCAL_MODEL_ICONS: Record<string, Component<{ class?: string }>> = {
	'gemma-4-E4B-it-Q4_K_M.gguf': GemmaIcon,
	'gemma-4-E2B-it-Q4_K_M.gguf': GemmaIcon,
	'gemma-4-E4B-it-qat-UD-Q2_K_XL.gguf': GemmaIcon
};

export interface LocalModelCardData {
	fileName: string;
	name: string;
	vendor: string;
	icon: Component<{ class?: string }> | null;
	description: string | null;
	downloadable: boolean;
	downloadSizeBytes: number | null;
	minRamGiB: number | null;
	license: string | null;
	licenseUrl: string | null;
}

export function catalogModelCard(
	model: DownloadableModel,
	minRamGiB: number | null
): LocalModelCardData {
	return {
		fileName: model.fileName,
		name: model.name,
		vendor: model.vendor,
		icon: LOCAL_MODEL_ICONS[model.fileName] ?? null,
		description: model.description,
		downloadable: true,
		downloadSizeBytes: model.sizeBytes,
		minRamGiB,
		license: model.license,
		licenseUrl: model.licenseUrl
	};
}
