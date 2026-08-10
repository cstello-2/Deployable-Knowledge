import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';

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
