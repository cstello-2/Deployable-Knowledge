import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';

import { parseThemeColor, parseThemeMode } from '$lib/constants';
import type { ThemeSettings } from '$lib/types';
import { db } from '$lib/server/database/database';
import { appState, profiles } from '$lib/server/database/schema';
import { toolRegistry } from '$lib/server/tools';

const APP_STATE_ID = 'app';

export async function ensureActiveProfileId(): Promise<string> {
	const state = await db.select().from(appState).where(eq(appState.id, APP_STATE_ID)).get();
	if (state?.activeProfileId) return state.activeProfileId;

	let profile = await db
		.select({ id: profiles.id })
		.from(profiles)
		.orderBy(asc(profiles.name))
		.get();

	if (!profile) {
		const timestamp = new Date();
		[profile] = await db
			.insert(profiles)
			.values({
				id: randomUUID(),
				name: 'Default',
				enabledTools: toolRegistry.ids(),
				createdAt: timestamp,
				updatedAt: timestamp
			})
			.returning({ id: profiles.id });
	}

	await setActiveProfileId(profile.id);
	return profile.id;
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

export async function clearActiveLayoutId(layoutId: string): Promise<void> {
	await db
		.update(appState)
		.set({ activeLayoutId: null })
		.where(eq(appState.activeLayoutId, layoutId));
}
