import { ChatService } from '$lib/services';
import type { Session } from '$lib/types';

class SessionsStore {
	private _sessions = $state<Session[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);

	get sessions(): readonly Session[] {
		return this._sessions;
	}

	async refresh(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			this._sessions = await ChatService.listSessions();
		} catch (error) {
			this.error = message(error);
		} finally {
			this.loading = false;
		}
	}

	async create(): Promise<Session> {
		const session = await ChatService.createSession();
		this._sessions = [session, ...this._sessions];
		return session;
	}

	async rename(id: string, title: string): Promise<void> {
		await ChatService.renameSession(id, title);
		this._sessions = this._sessions.map((session) =>
			session.id === id ? { ...session, title, updatedAt: new Date() } : session
		);
	}

	async delete(id: string): Promise<void> {
		await ChatService.deleteSession(id);
		this._sessions = this._sessions.filter((session) => session.id !== id);
	}
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export const sessionsStore = new SessionsStore();
