import { randomUUID } from 'node:crypto';
import { asc } from 'drizzle-orm';

import { db } from '$lib/server/database/database';
import { getActiveProfileId, setActiveProfileId } from '$lib/server/database/app-state';
import { profiles, type AssistantProfile } from '$lib/server/database/schema';
import { ProfilesRepository } from '$lib/server/repositories';
import { toolRegistry } from '$lib/server/tools';

export async function ensureActiveProfileId(): Promise<string> {
	const activeProfileId = await getActiveProfileId();
	if (activeProfileId) return activeProfileId;

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
				enabledTools: toolRegistry.defaultIds(),
				createdAt: timestamp,
				updatedAt: timestamp
			})
			.returning({ id: profiles.id });
	}

	await setActiveProfileId(profile.id);
	return profile.id;
}

export async function getActiveProfile(): Promise<AssistantProfile | null> {
	const activeProfileId = await ensureActiveProfileId();
	return (await ProfilesRepository.find(activeProfileId)) ?? null;
}
