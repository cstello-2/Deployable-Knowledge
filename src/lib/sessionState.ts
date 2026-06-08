import { writable } from 'svelte/store';
import { dkClient, type SessionSummary, type UserResponse } from './sdk';

export const currentSessionId = writable<string | null>(null);
export const currentUser = writable<UserResponse | null>(null);
export const sessions = writable<SessionSummary[]>([]);
export const sessionError = writable<string | null>(null);

export async function initializeSessionState() {
	try {
		sessionError.set(null);
		await dkClient.ensureUserSession();
		const [sessionId, user] = await Promise.all([
			dkClient.getOrCreateChatSession(),
			dkClient.getUser()
		]);
		currentSessionId.set(sessionId);
		currentUser.set(user);
		return { sessionId, user };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to initialize session';
		sessionError.set(message);
		throw error;
	}
}

export async function refreshSessions() {
	const rows = await dkClient.listSessions();
	sessions.set(rows);
	return rows;
}

export async function startNewSession() {
	const sessionId = await dkClient.startNewSession();
	currentSessionId.set(sessionId);
	await refreshSessions();
	return sessionId;
}

export function logout() {
	window.location.href = '/logout';
}
