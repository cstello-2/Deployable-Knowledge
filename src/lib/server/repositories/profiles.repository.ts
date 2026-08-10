import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { ensureActiveProfileId } from '$lib/server/database/app-state';
import { profiles, type AssistantProfile } from '$lib/server/database/schema';

export class ProfilesRepository {
	static list() {
		return db.select().from(profiles).orderBy(asc(profiles.name));
	}

	static find(id: string) {
		return db.select().from(profiles).where(eq(profiles.id, id)).get();
	}

	static async getActive(): Promise<AssistantProfile | null> {
		const activeProfileId = await ensureActiveProfileId();
		return (await this.find(activeProfileId)) ?? null;
	}
}
