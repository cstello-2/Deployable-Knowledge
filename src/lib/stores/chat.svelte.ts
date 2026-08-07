import { STORAGE_KEYS } from '$lib/constants';
import { ChatService } from '$lib/services';
import { persisted } from './persisted.svelte';
import type {
	AgentGoal,
	AgentProgressEvent,
	AgentTraceItem,
	ApiChatMessageRequest,
	ApiChatStreamEvent,
	Session,
	SessionMessage
} from '$lib/types';

class ChatStore {
	private _session = $state<Session | undefined>(undefined);
	messages = $state<SessionMessage[]>([]);
	streamedText = $state('');
	liveTrace = $state<AgentTraceItem[]>([]);
	goals = $state<AgentGoal[]>([]);
	agentStatus = $state('Thinking…');
	error = $state<string | null>(null);
	isStreaming = $state(false);
	private _toolsEnabled = persisted(STORAGE_KEYS.CHAT_TOOLS_ENABLED, false);

	get session(): Session | undefined {
		return this._session;
	}

	set session(value: Session | undefined) {
		if (value?.id !== this._session?.id) this.goals = [];
		this._session = value;
	}

	get toolsEnabled(): boolean {
		return this._toolsEnabled.value;
	}

	set toolsEnabled(value: boolean) {
		this._toolsEnabled.value = value;
	}

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
		this.goals = [];
		this.error = null;
		this.agentStatus = 'Thinking…';

		let finishing: Promise<void> | null = null;

		const finish = (saved = true) =>
			(finishing ??= (async () => {
				try {
					if (saved) await this.loadMessages();
				} finally {
					if (saved) this.streamedText = '';
					this.isStreaming = false;
				}
			})());

		try {
			await ChatService.streamMessage(this.session.id, request, {
				onAgent: (progress) => this.applyAgentProgress(progress),
				onText: (delta) => this.applyStreamEvent({ type: 'text', delta }),
				onTextReset: () => this.applyStreamEvent({ type: 'text-reset' }),
				onGoals: (goals) => (this.goals = goals),
				onTitle: (title) => this.applyStreamEvent({ type: 'title', title }),
				onComplete: (event) => {
					this.applyStreamEvent(event);
					void finish(event.saved !== false).catch(() => undefined);
				}
			});
			await finish();
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
			this.agentStatus = 'Agent run failed';
			throw error;
		} finally {
			if (!finishing) {
				this.isStreaming = false;
				this.streamedText = '';
			}
		}
	}

	applyStreamEvent(event: ApiChatStreamEvent): void {
		if (event.type === 'agent') this.applyAgentProgress(event.progress);
		else if (event.type === 'text') {
			this.streamedText += event.delta;
			this.agentStatus = 'Writing final response';
		} else if (event.type === 'text-reset') {
			this.streamedText = '';
		} else if (event.type === 'goals') {
			this.goals = event.goals;
		} else if (event.type === 'title') {
			if (this.session) {
				this.session = { ...this.session, title: event.title, updatedAt: new Date() };
			}
		} else if (event.type === 'complete') {
			this.agentStatus =
				event.saved === false
					? 'Finished · not saved (the conversation was removed)'
					: `Finished · ${event.modelTurns} model turn${event.modelTurns === 1 ? '' : 's'}, ${event.toolCalls} tool call${event.toolCalls === 1 ? '' : 's'}`;
		} else {
			this.error = event.message;
			this.agentStatus = 'Agent run failed';
		}
	}

	private applyAgentProgress(progress: AgentProgressEvent): void {
		if (progress.kind !== 'model') {
			this.upsertTrace(progress.trace);
			return;
		}

		if (progress.trace) this.upsertTrace(progress.trace);
		this.agentStatus = modelStatus(progress);
	}

	private upsertTrace(item: AgentTraceItem): void {
		const index = this.liveTrace.findIndex(({ id }) => id === item.id);
		this.liveTrace =
			index === -1
				? [...this.liveTrace, item]
				: this.liveTrace.map((entry, current) => (current === index ? item : entry));
	}
}

function modelStatus(progress: Extract<AgentProgressEvent, { kind: 'model' }>): string {
	if (progress.status === 'started') return 'Thinking…';
	if (progress.requestedTools?.length) return 'Starting tools…';
	return 'Writing response…';
}

export const chatStore = new ChatStore();
