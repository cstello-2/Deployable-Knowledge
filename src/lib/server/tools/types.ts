import type { ProviderToolDefinition } from "../providers/provider";
import type { RagRetrievalMode } from "../rag/search/retrieve-rag-context";
import type { ToolOutput } from "$lib/agentTypes";

export type ToolExecutionContext = {
  [key: string]: unknown;
  documentIds?: string[];
  retrievalMode?: RagRetrievalMode;
  ragTopK?: number;
  maxSearchTopK?: number;
  timeZone?: string;
  now?: () => Date;
};

export type ToolExecutionResult<TData = unknown> = {
  // This is the compact representation sent back to the model as a tool
  // message. Structured data remains available to API routes and metadata.
  content: string;
  data?: TData;
  outputs?: ToolOutput[];
  isError?: boolean;
};

export type AgentTool<TData = unknown> = {
  definition: ProviderToolDefinition;
  execute(
    argumentsValue: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<TData>>;
};
