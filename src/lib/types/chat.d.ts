import type { AgentProgressEvent } from './agent';
import type { ApiChatStreamEvent } from './api';

export interface ChatStreamCallbacks {
	onAgent?: (progress: AgentProgressEvent) => void;
	onText?: (delta: string) => void;
	onTextReset?: () => void;
	onTitle?: (title: string) => void;
	onComplete?: (event: Extract<ApiChatStreamEvent, { type: 'complete' }>) => void;
	onError?: (error: Error) => void;
}
