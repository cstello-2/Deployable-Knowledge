import { ChatService } from '$lib/services';
import type {
	AgentProgressEvent,
	AgentTraceItem,
	ApiChatMessageRequest,
	ApiChatStreamEvent,
	Session,
	SessionMessage
} from '$lib/types';

class ChatStore {
	session = $state<Session | undefined>(undefined);
	messages = $state<SessionMessage[]>([]);
	streamedText = $state('');
	liveTrace = $state<AgentTraceItem[]>([]);
	agentStatus = $state('Thinking…');
	error = $state<string | null>(null);
	isStreaming = $state(false);
	toolsEnabled = $state(true);

	async loadMessages(sessionId = this.session?.id): Promise<void> {
		this.error = null;
		this.messages = sessionId ? await ChatService.getMessages(sessionId) : [];
	}

	async sendMessage(request: ApiChatMessageRequest): Promise<void> {
		if (!this.session) throw new Error('A chat session is required.');
		this.messages = [
			...this.messages,
			{
				id: (this.messages.at(-1)?.id ?? 0) + 1,
				sessionId: this.session.id,
				role: 'user',
				content: request.message,
				metadata: null,
				createdAt: new Date()
			}
		];
		this.isStreaming = true;
		this.streamedText = '';
		this.liveTrace = [];
		this.error = null;
		this.agentStatus = 'Thinking…';

		try {
			await ChatService.streamMessage(this.session.id, request, {
				onAgent: (progress) => this.applyAgentProgress(progress),
				onText: (delta) => this.applyStreamEvent({ type: 'text', delta }),
				onTextReset: () => this.applyStreamEvent({ type: 'text-reset' }),
				onTitle: (title) => this.applyStreamEvent({ type: 'title', title }),
				onComplete: (event) => this.applyStreamEvent(event)
			});
			await this.loadMessages();
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
			this.agentStatus = 'Agent run failed';
			throw error;
		} finally {
			this.isStreaming = false;
			this.streamedText = '';
		}
	}

	applyStreamEvent(event: ApiChatStreamEvent): void {
		if (event.type === 'agent') this.applyAgentProgress(event.progress);
		else if (event.type === 'text') {
			this.streamedText += event.delta;
			this.agentStatus = 'Writing final response';
		} else if (event.type === 'text-reset') {
			this.streamedText = '';
		} else if (event.type === 'title') {
			if (this.session) {
				this.session = { ...this.session, title: event.title, updatedAt: new Date() };
			}
		} else if (event.type === 'complete') {
			this.agentStatus = `Finished · ${event.modelTurns} model turn${event.modelTurns === 1 ? '' : 's'}, ${event.toolCalls} tool call${event.toolCalls === 1 ? '' : 's'}`;
		} else {
			this.error = event.message;
			this.agentStatus = 'Agent run failed';
		}
	}

	private applyAgentProgress(progress: AgentProgressEvent): void {
		if (progress.kind === 'model') {
			if (progress.trace) this.upsertTrace(progress.trace);
			this.agentStatus =
				progress.status === 'started'
					? 'Thinking…'
					: progress.requestedTools?.length
						? 'Starting tools…'
						: 'Writing response…';
		} else {
			this.upsertTrace(progress.trace);
		}
	}

	private upsertTrace(item: AgentTraceItem): void {
		const index = this.liveTrace.findIndex(({ id }) => id === item.id);
		this.liveTrace =
			index === -1
				? [...this.liveTrace, item]
				: this.liveTrace.map((entry, current) => (current === index ? item : entry));
	}
}

export const chatStore = new ChatStore();
