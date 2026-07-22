import { eq } from 'drizzle-orm';

import { db } from '$lib/server/database/database';
import { sessions, users, type User } from '$lib/server/database/schema';
import { LEGACY_LOCAL_USER_ID, LOCAL_USER_ID } from '$lib/server/database/constants';

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

	return user;
}
