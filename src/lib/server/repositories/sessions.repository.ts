import { asc, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { sessionMessages, sessions } from '$lib/server/database/schema';

export class SessionsRepository {
	static list() {
		return db.select().from(sessions).orderBy(desc(sessions.updatedAt));
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

	static async appendTurn(turn: {
		sessionId: string;
		userMessage: string;
		assistantContent: string;
		metadata: unknown;
		createdAt: Date;
	}): Promise<boolean> {
		if (!(await this.find(turn.sessionId))) return false;

		await db.insert(sessionMessages).values([
			{
				sessionId: turn.sessionId,
				role: 'user' as const,
				content: turn.userMessage,
				metadata: null,
				createdAt: turn.createdAt
			},
			...(turn.assistantContent
				? [
						{
							sessionId: turn.sessionId,
							role: 'assistant' as const,
							content: turn.assistantContent,
							metadata: turn.metadata,
							createdAt: turn.createdAt
						}
					]
				: [])
		]);

		return true;
	}

	static async delete(id: string) {
		await db.delete(sessionMessages).where(eq(sessionMessages.sessionId, id));
		await db.delete(sessions).where(eq(sessions.id, id));
	}
}
