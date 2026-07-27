export interface ImageArtifact {
	id: string;
	mimeType: 'image/png';
	base64: string;
	alt: string;
}

export interface SourceArtifact {
	url?: string;
	title?: string;
	description?: string;
	documentId?: string;
	chunkId?: string;
	pageIndex?: number;
	chunkIndex?: number;
}

export type ToolOutput =
	| { id: string; type: 'source'; data: SourceArtifact }
	| { id: string; type: 'image'; data: ImageArtifact }
	| { id: string; type: 'text'; label?: string; data: string }
	| { id: string; type: 'data'; label?: string; data: unknown };

export type AgentOutput = ToolOutput & {
	toolCallId: string;
	toolName: string;
};

export interface StoredToolCall {
	id?: string;
	name: string;
	arguments?: unknown;
	isError?: boolean;
	error?: string;
	outputCount?: number;
}

export interface AgentTraceItem {
	id: string;
	kind: 'reasoning' | 'tool';
	title: string;
	output: string;
	status?: 'running' | 'complete' | 'error';
	isError?: boolean;
}

export interface StoredAgentRun {
	providerId?: string;
	modelId?: string;
	modelTurns?: number;
	toolTurns?: number;
	trace?: AgentTraceItem[];
	toolCalls?: StoredToolCall[];
}

export interface AssistantMessageMetadata {
	agent?: StoredAgentRun;
	outputs?: AgentOutput[];
}

export type AgentProgressEvent =
	| {
			kind: 'model';
			status: 'started' | 'completed';
			modelTurn: number;
			toolTurn: number;
			requestedTools?: string[];
			trace?: AgentTraceItem;
	  }
	| {
			kind: 'tool';
			status: 'started' | 'completed';
			modelTurn: number;
			toolTurn: number;
			callId: string;
			name: string;
			trace: AgentTraceItem;
			isError?: boolean;
			error?: string;
	  };
