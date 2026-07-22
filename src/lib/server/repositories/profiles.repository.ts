import { and, asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { profiles } from '$lib/server/database/schema';

export class ProfilesRepository {
	static list(userId: number) {
		return db
			.select()
			.from(profiles)
			.where(eq(profiles.userId, userId))
			.orderBy(asc(profiles.name));
	}

	static find(id: string, userId: number) {
		return db
			.select()
			.from(profiles)
			.where(and(eq(profiles.id, id), eq(profiles.userId, userId)))
			.get();
	}

	static getActive(user: { id: number; activeProfileId: string | null }) {
		return user.activeProfileId ? this.find(user.activeProfileId, user.id) : Promise.resolve(null);
	}
}
