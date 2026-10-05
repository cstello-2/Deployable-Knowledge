import { API_SESSIONS } from '$lib/constants';
import type {
	ApiChatMessageRequest,
	ApiChatStreamEvent,
	ApiSessionTitleRequest,
	Session,
	SessionMessage
} from '$lib/types';
import { apiDelete, apiFetch, apiPatch, apiStream, parseNdjsonStream } from '$lib/utils';

export class ChatService {
	static listSessions() {
		return apiFetch<Session[]>(API_SESSIONS.BASE);
	}

	static createSession() {
		return apiFetch<Session>(API_SESSIONS.BASE, { method: 'POST' });
	}

	static getMessages(sessionId: string) {
		return apiFetch<SessionMessage[]>(API_SESSIONS.byId(sessionId));
	}

	static renameSession(sessionId: string, title: string) {
		return apiPatch<{ status: 'ok'; session_id: string; title: string }, ApiSessionTitleRequest>(
			API_SESSIONS.byId(sessionId),
			{ title }
		);
	}

	static deleteSession(sessionId: string) {
		return apiDelete<{ status: 'ok'; session_id: string }>(API_SESSIONS.byId(sessionId));
	}

	static async *streamMessage(
		sessionId: string,
		request: ApiChatMessageRequest,
		signal: AbortSignal
	): AsyncGenerator<ApiChatStreamEvent> {
		const response = await apiStream(API_SESSIONS.messages(sessionId), {
			method: 'POST',
			body: JSON.stringify(request),
			signal
		});
		yield* parseNdjsonStream<ApiChatStreamEvent>(response, signal);
	}
}
