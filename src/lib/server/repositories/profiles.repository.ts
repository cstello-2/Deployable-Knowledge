import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { profiles } from '$lib/server/database/schema';

export class ProfilesRepository {
	static list() {
		return db.select().from(profiles).orderBy(asc(profiles.name));
	}

	static find(id: string) {
		return db.select().from(profiles).where(eq(profiles.id, id)).get();
	}
}
