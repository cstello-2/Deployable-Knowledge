import type { ImageArtifact } from "$lib/imageTypes";

export type SourceArtifact = {
  url?: string;
  title?: string;
  description?: string;
  documentId?: string;
  chunkId?: string;
  pageIndex?: number;
  chunkIndex?: number;
};

export type ToolOutput =
  | { id: string; type: "source"; data: SourceArtifact }
  | { id: string; type: "image"; data: ImageArtifact }
  | { id: string; type: "text"; label?: string; data: string }
  | { id: string; type: "data"; label?: string; data: unknown };

export type AgentOutput = ToolOutput & {
  toolCallId: string;
  toolName: string;
};

export type StoredToolCall = {
  id?: string;
  name: string;
  arguments?: unknown;
  isError?: boolean;
  error?: string;
  outputCount?: number;
};

export type AgentTraceItem = {
  id: string;
  kind: "reasoning" | "tool";
  title: string;
  output: string;
  status?: "running" | "complete" | "error";
  isError?: boolean;
};

export type StoredAgentRun = {
  providerId?: string;
  modelId?: string;
  modelTurns?: number;
  toolTurns?: number;
  trace?: AgentTraceItem[];
  // Older messages used this input-only representation. Keep it readable
  // while new runs store one title/output trace instead.
  toolCalls?: StoredToolCall[];
};

export type AssistantMessageMetadata = {
  agent?: StoredAgentRun;
  outputs?: AgentOutput[];
};
