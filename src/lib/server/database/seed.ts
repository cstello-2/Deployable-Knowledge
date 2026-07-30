import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db } from '$lib/server/database/database';
import { profiles, sessions, users, type User } from '$lib/server/database/schema';
import { LEGACY_LOCAL_USER_ID, LOCAL_USER_ID } from '$lib/server/database/constants';
import { toolRegistry } from '$lib/server/tools';

export const localUsername = LOCAL_USER_ID;

export async function seedLocalUser(): Promise<User> {
	await db
		.update(sessions)
		.set({ userId: localUsername })
		.where(eq(sessions.userId, LEGACY_LOCAL_USER_ID));

	let user = await db.select().from(users).where(eq(users.username, localUsername)).get();

	if (!user) {
		[user] = await db
			.insert(users)
			.values({
				username: localUsername,
				activeProfileId: null,
				lastLogin: new Date()
			})
			.returning();
	}

	if (!user.activeProfileId) {
		let profile = await db
			.select({ id: profiles.id })
			.from(profiles)
			.where(eq(profiles.userId, user.id))
			.get();

		if (!profile) {
			[profile] = await db
				.insert(profiles)
				.values({
					id: randomUUID(),
					userId: user.id,
					name: 'Default',
					enabledTools: toolRegistry.ids(),
					createdAt: new Date(),
					updatedAt: new Date()
				})
				.returning({ id: profiles.id });
		}

		await db.update(users).set({ activeProfileId: profile.id }).where(eq(users.id, user.id));
		user.activeProfileId = profile.id;
	}

	return user;
}
