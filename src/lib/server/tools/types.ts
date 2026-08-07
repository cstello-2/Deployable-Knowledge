import type { RagRetrievalMode } from '../rag/search/retrieve-rag-context';
import type { AgentGoal, ApiAgentTool, ToolOutput } from '$lib/types';

export type ToolExecutionContext = {
	[key: string]: unknown;
	documentIds?: string[];
	retrievalMode?: RagRetrievalMode;
	ragTopK?: number;
	maxSearchTopK?: number;
	timeZone?: string;
	now?: () => Date;
	goals?: AgentGoal[];
};

export type ToolExecutionResult<TData = unknown> = {
	// This is the compact representation sent back to the model as a tool
	// message. Structured data remains available to API routes and metadata.
	content: string;
	data?: TData;
	outputs?: ToolOutput[];
	isError?: boolean;
};

export type AgentToolDefinition = {
	description: string;
	parameters: Record<string, unknown>;
};

export type AgentTool<TData = unknown> = ApiAgentTool & {
	definition: AgentToolDefinition;
	instructions?: string;
	execute(
		argumentsValue: unknown,
		context: ToolExecutionContext
	): Promise<ToolExecutionResult<TData>>;
};
