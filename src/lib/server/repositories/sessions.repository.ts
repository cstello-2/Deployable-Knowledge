import { asc, desc, eq } from 'drizzle-orm';
import { LOCAL_USER_ID } from '$lib/server/database/constants';
import { db } from '$lib/server/database/database';
import { sessionMessages, sessions } from '$lib/server/database/schema';

export class SessionsRepository {
	static list() {
		return db
			.select()
			.from(sessions)
			.where(eq(sessions.userId, LOCAL_USER_ID))
			.orderBy(desc(sessions.updatedAt));
	}

	static find(id: string) {
		return db.select().from(sessions).where(eq(sessions.id, id)).get();
	}

	static listMessages(sessionId: string) {
		return db
			.select()
			.from(sessionMessages)
			.where(eq(sessionMessages.sessionId, sessionId))
			.orderBy(asc(sessionMessages.id));
	}

	static async delete(id: string) {
		await db.delete(sessionMessages).where(eq(sessionMessages.sessionId, id));
		await db.delete(sessions).where(eq(sessions.id, id));
	}
}
