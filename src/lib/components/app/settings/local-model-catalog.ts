import type { Component } from 'svelte';
import { LOCAL_MODEL_TIERS, type LocalModelTier, type LocalModelTierId } from '$lib/constants';
import GemmaIcon from './icons/GemmaIcon.svelte';

export interface LocalModelCatalogEntry {
	tier: LocalModelTier;
	icon: Component<{ class?: string }> | null;
	/** Featured entries always show in the marketplace; others only once downloaded. */
	featured: boolean;
}

const TIER_CARD_INFO: Record<LocalModelTierId, Omit<LocalModelCatalogEntry, 'tier'>> = {
	high: { icon: GemmaIcon, featured: true },
	medium: { icon: null, featured: false },
	moe: { icon: null, featured: false }
};

export const LOCAL_MODEL_CATALOG: readonly LocalModelCatalogEntry[] = LOCAL_MODEL_TIERS.map(
	(tier) => ({ tier, ...TIER_CARD_INFO[tier.id] })
).sort((a, b) => Number(b.featured) - Number(a.featured));

export interface LocalModelCardData {
	fileName: string;
	name: string;
	vendor: string;
	icon: Component<{ class?: string }> | null;
	description: string | null;
	tierId: LocalModelTierId | null;
	downloadSizeBytes: number | null;
	minRamGiB: number | null;
}
