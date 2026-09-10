import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { customProviders, type NewCustomProviderRecord } from '$lib/server/database/schema';

type CustomProviderValues = Pick<NewCustomProviderRecord, 'type' | 'name' | 'baseUrl' | 'apiKey'>;

export class CustomProvidersRepository {
	static list() {
		return db.select().from(customProviders).orderBy(asc(customProviders.name));
	}

	static find(id: string) {
		return db.select().from(customProviders).where(eq(customProviders.id, id)).get();
	}

	static async create(values: CustomProviderValues) {
		const timestamp = new Date();
		const [row] = await db
			.insert(customProviders)
			.values({ id: randomUUID(), ...values, createdAt: timestamp, updatedAt: timestamp })
			.returning();
		return row;
	}

	static async update(id: string, values: Partial<Omit<CustomProviderValues, 'type'>>) {
		const [row] = await db
			.update(customProviders)
			.set({ ...values, updatedAt: new Date() })
			.where(eq(customProviders.id, id))
			.returning();
		return row;
	}

	static async delete(id: string) {
		const [row] = await db.delete(customProviders).where(eq(customProviders.id, id)).returning();
		return row;
	}
}
