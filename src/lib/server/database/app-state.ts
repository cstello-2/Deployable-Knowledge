import { eq } from 'drizzle-orm';

import { DEFAULT_EMBEDDING_SETTINGS, parseThemeColor, parseThemeMode } from '$lib/constants';
import type { EmbeddingSettings, ThemeSettings } from '$lib/types';
import { db } from '$lib/server/database/database';
import { appState } from '$lib/server/database/schema';

const APP_STATE_ID = 'app';

export async function getActiveProfileId(): Promise<string | null> {
	const state = await db.select().from(appState).where(eq(appState.id, APP_STATE_ID)).get();
	return state?.activeProfileId ?? null;
}

export async function setActiveProfileId(activeProfileId: string | null): Promise<void> {
	await db
		.insert(appState)
		.values({ id: APP_STATE_ID, activeProfileId })
		.onConflictDoUpdate({ target: appState.id, set: { activeProfileId } });
}

export async function clearActiveProfileId(profileId: string): Promise<void> {
	await db
		.update(appState)
		.set({ activeProfileId: null })
		.where(eq(appState.activeProfileId, profileId));
}

export async function getActiveLayoutId(): Promise<string | null> {
	const state = await db.select().from(appState).where(eq(appState.id, APP_STATE_ID)).get();
	return state?.activeLayoutId ?? null;
}

export async function setActiveLayoutId(activeLayoutId: string | null): Promise<void> {
	await db
		.insert(appState)
		.values({ id: APP_STATE_ID, activeLayoutId })
		.onConflictDoUpdate({ target: appState.id, set: { activeLayoutId } });
}

export async function getThemeSettings(): Promise<ThemeSettings> {
	const state = await db.select().from(appState).where(eq(appState.id, APP_STATE_ID)).get();
	return {
		color: parseThemeColor(state?.themeColor),
		mode: parseThemeMode(state?.themeMode)
	};
}

export async function setThemeSettings({ color, mode }: ThemeSettings): Promise<ThemeSettings> {
	await db
		.insert(appState)
		.values({ id: APP_STATE_ID, themeColor: color, themeMode: mode })
		.onConflictDoUpdate({
			target: appState.id,
			set: { themeColor: color, themeMode: mode }
		});
	return { color, mode };
}

export async function getEmbeddingSettings(): Promise<EmbeddingSettings> {
	const state = await db.select().from(appState).where(eq(appState.id, APP_STATE_ID)).get();
	return {
		provider: state?.embeddingProvider ?? DEFAULT_EMBEDDING_SETTINGS.provider,
		model: state?.embeddingModel ?? DEFAULT_EMBEDDING_SETTINGS.model,
		device: state?.embeddingDevice ?? DEFAULT_EMBEDDING_SETTINGS.device
	};
}

export async function setEmbeddingSettings(settings: EmbeddingSettings): Promise<void> {
	const values = {
		embeddingProvider: settings.provider,
		embeddingModel: settings.model,
		embeddingDevice: settings.device
	};
	await db
		.insert(appState)
		.values({ id: APP_STATE_ID, ...values })
		.onConflictDoUpdate({ target: appState.id, set: values });
}

export async function clearActiveLayoutId(layoutId: string): Promise<void> {
	await db
		.update(appState)
		.set({ activeLayoutId: null })
		.where(eq(appState.activeLayoutId, layoutId));
}
