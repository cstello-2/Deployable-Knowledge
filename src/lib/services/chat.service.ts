import { API_SESSIONS } from '$lib/constants';
import type {
	ApiChatMessageRequest,
	ApiChatStreamEvent,
	ApiSessionTitleRequest,
	ChatStreamCallbacks,
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

	static async streamMessage(
		sessionId: string,
		request: ApiChatMessageRequest,
		callbacks: ChatStreamCallbacks = {},
		signal?: AbortSignal
	): Promise<void> {
		const response = await apiStream(API_SESSIONS.messages(sessionId), {
			method: 'POST',
			body: JSON.stringify(request),
			signal
		});

		for await (const event of parseNdjsonStream<ApiChatStreamEvent>(response, signal)) {
			switch (event.type) {
				case 'agent':
					callbacks.onAgent?.(event.progress);
					break;
				case 'text':
					callbacks.onText?.(event.delta);
					break;
				case 'text-reset':
					callbacks.onTextReset?.();
					break;
				case 'title':
					callbacks.onTitle?.(event.title);
					break;
				case 'complete':
					callbacks.onComplete?.(event);
					break;
				case 'error': {
					const error = new Error(event.message);
					callbacks.onError?.(error);
					throw error;
				}
			}
		}
	}
}
