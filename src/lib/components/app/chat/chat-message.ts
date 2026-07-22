import type {
	AgentTraceItem,
	AssistantMessageMetadata,
	SessionMessage,
	StoredAgentRun
} from '$lib/types';
import { legacyToolCallTrace } from '$lib/utils/agent-trace';

export function messageMetadata(message: SessionMessage): AssistantMessageMetadata {
	return message.metadata && typeof message.metadata === 'object'
		? (message.metadata as AssistantMessageMetadata)
		: {};
}

export function messageTrace(agent?: StoredAgentRun): AgentTraceItem[] {
	if (agent?.trace?.length) return agent.trace;
	return (agent?.toolCalls ?? []).map(legacyToolCallTrace);
}

export function sourceChunkIds(message: SessionMessage): string[] {
	return (messageMetadata(message).outputs ?? []).flatMap((output) =>
		output.type === 'source' && output.data.chunkId ? [output.data.chunkId] : []
	);
}
