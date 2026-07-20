import type {
  Provider,
  ProviderChatMessage,
  ProviderChatOptions,
  ProviderToolCall,
  ProviderToolCallDelta,
} from "../providers/provider";
import type { ToolRegistry } from "../tools/registry";
import type { ToolExecutionContext, ToolExecutionResult } from "../tools/types";
import type { AgentOutput, AgentTraceItem } from "$lib/agentTypes";
import {
  createReasoningTrace,
  createToolTrace,
} from "$lib/agentTrace";
import type { AgentProgressEvent } from "$lib/requestTypes";
import { clampInteger, readObject } from "../utils/values";

export const DEFAULT_AGENT_MAX_TURNS = 4;
export const MAX_AGENT_MAX_TURNS = 10;

export type AgentToolExecution = {
  id: string;
  name: string;
  arguments: unknown;
  isError: boolean;
  error?: string;
  outputCount: number;
};

export type AgentRunResult = {
  content: string;
  modelTurns: number;
  toolTurns: number;
  toolExecutions: AgentToolExecution[];
  outputs: AgentOutput[];
  trace: AgentTraceItem[];
};

export async function runAgent({
  provider,
  model,
  messages,
  chatOptions,
  registry,
  toolNames,
  toolContext = {},
  maxToolTurns = DEFAULT_AGENT_MAX_TURNS,
  onProgress,
  onFinalText,
}: {
  provider: Provider;
  model: string;
  messages: ProviderChatMessage[];
  chatOptions: ProviderChatOptions;
  registry: ToolRegistry;
  toolNames: readonly string[];
  toolContext?: ToolExecutionContext;
  maxToolTurns?: number;
  onProgress?: (event: AgentProgressEvent) => void;
  onFinalText?: (text: string) => void;
}): Promise<AgentRunResult> {
  const transcript = [...messages];
  const definitions = registry.definitions(toolNames);
  const maxTurns = clampAgentMaxTurns(maxToolTurns);
  const executions: AgentToolExecution[] = [];
  const outputs = new Map<string, AgentOutput>();
  const trace: AgentTraceItem[] = [];
  let toolTurns = 0;
  let modelTurns = 0;

  while (true) {
    const toolsAvailable = toolTurns < maxTurns && definitions.length > 0;
    onProgress?.({
      kind: "model",
      status: "started",
      modelTurn: modelTurns + 1,
      toolTurn: toolTurns,
    });
    const turn = await collectTurn(
      provider,
      transcript,
      model,
      {
        ...chatOptions,
        tools: toolsAvailable ? definitions : undefined,
        toolChoice: toolsAvailable ? "auto" : "none",
        parallelToolCalls: true,
      },
      modelTurns,
    );
    modelTurns += 1;
    const reasoningTrace = turn.reasoningContent.trim()
      ? createReasoningTrace(`reasoning-${modelTurns}`, turn.reasoningContent)
      : undefined;
    if (reasoningTrace) trace.push(reasoningTrace);
    onProgress?.({
      kind: "model",
      status: "completed",
      modelTurn: modelTurns,
      toolTurn: toolTurns,
      requestedTools: turn.toolCalls.map((call) => call.function.name),
      ...(reasoningTrace ? { trace: reasoningTrace } : {}),
    });

    if (!turn.toolCalls.length || !toolsAvailable) {
      const finalContent =
        turn.content ||
        (turn.toolCalls.length
          ? "I couldn't produce a final response within the configured tool-turn limit."
          : "I couldn't produce a final response.");

      for (const chunk of turn.contentChunks.length
        ? turn.contentChunks
        : [finalContent]) {
        onFinalText?.(chunk);
      }

      return {
        content: finalContent,
        modelTurns,
        toolTurns,
        toolExecutions: executions,
        outputs: [...outputs.values()],
        trace,
      };
    }

    transcript.push({
      role: "assistant",
      content: turn.content || null,
      reasoningContent: turn.reasoningContent || undefined,
      toolCalls: turn.toolCalls,
    });

    for (const call of turn.toolCalls) {
      const parsedArguments = parseJson(call.function.arguments);
      const runningTrace = createToolTrace({
        id: call.id,
        name: call.function.name,
        argumentsValue: parsedArguments,
        status: "running",
      });
      onProgress?.({
        kind: "tool",
        status: "started",
        modelTurn: modelTurns,
        toolTurn: toolTurns + 1,
        callId: call.id,
        name: call.function.name,
        trace: runningTrace,
      });
      const result = await registry.executeCall(call, toolContext);
      const toolError = result.isError ? readToolError(result) : "";
      const callOutputs = result.outputs ?? [];
      const completedTrace = createToolTrace({
        id: call.id,
        name: call.function.name,
        argumentsValue: parsedArguments,
        resultValue: result.data ?? parseJson(result.content),
        status: result.isError ? "error" : "complete",
        isError: result.isError,
      });
      trace.push(completedTrace);

      executions.push({
        id: call.id,
        name: call.function.name,
        arguments: parsedArguments,
        isError: result.isError ?? false,
        outputCount: callOutputs.length,
        ...(toolError ? { error: toolError } : {}),
      });
      onProgress?.({
        kind: "tool",
        status: "completed",
        modelTurn: modelTurns,
        toolTurn: toolTurns + 1,
        callId: call.id,
        name: call.function.name,
        trace: completedTrace,
        isError: result.isError ?? false,
        ...(toolError ? { error: toolError } : {}),
      });

      for (const output of callOutputs) {
        outputs.set(`${output.type}:${output.id}`, {
          ...output,
          toolCallId: call.id,
          toolName: call.function.name,
        });
      }

      transcript.push({
        role: "tool",
        content: result.content,
        toolCallId: call.id,
        name: call.function.name,
      });
    }

    toolTurns += 1;
  }
}

export function clampAgentMaxTurns(value: unknown): number {
  return clampInteger(
    value,
    1,
    MAX_AGENT_MAX_TURNS,
    DEFAULT_AGENT_MAX_TURNS,
  );
}

async function collectTurn(
  provider: Provider,
  messages: ProviderChatMessage[],
  model: string,
  options: ProviderChatOptions,
  turnIndex: number,
) {
  const contentChunks: string[] = [];
  let content = "";
  let reasoningContent = "";
  const toolCalls = new Map<number, MutableToolCall>();

  for await (const chunk of provider.streamChat(messages, model, options)) {
    if (chunk.content) {
      content += chunk.content;
      contentChunks.push(chunk.content);
    }

    if (chunk.reasoningContent) reasoningContent += chunk.reasoningContent;

    for (const delta of chunk.toolCalls ?? []) {
      mergeToolCallDelta(toolCalls, delta, turnIndex);
    }
  }

  return {
    content,
    contentChunks,
    reasoningContent,
    toolCalls: [...toolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => call as ProviderToolCall),
  };
}

type MutableToolCall = ProviderToolCall;

function mergeToolCallDelta(
  calls: Map<number, MutableToolCall>,
  delta: ProviderToolCallDelta,
  turnIndex: number,
) {
  const current = calls.get(delta.index) ?? {
    id: delta.id || `call_${turnIndex + 1}_${delta.index + 1}`,
    type: "function" as const,
    function: { name: "", arguments: "" },
  };

  if (delta.id) current.id = delta.id;
  if (delta.nameSnapshot !== undefined) {
    current.function.name = delta.nameSnapshot;
  } else if (delta.nameDelta) {
    current.function.name += delta.nameDelta;
  }

  if (delta.argumentsSnapshot !== undefined) {
    current.function.arguments =
      typeof delta.argumentsSnapshot === "string"
        ? delta.argumentsSnapshot
        : JSON.stringify(delta.argumentsSnapshot);
  } else if (delta.argumentsDelta) {
    current.function.arguments += delta.argumentsDelta;
  }

  calls.set(delta.index, current);
}

function parseJson(value: string): unknown {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return value;
  }
}

function readToolError(result: ToolExecutionResult): string {
  const data = readObject(result.data);
  if (typeof data.error === "string" && data.error.trim()) {
    return data.error.trim().slice(0, 2_000);
  }

  const content = parseJson(result.content);
  const contentObject = readObject(content);
  if (typeof contentObject.error === "string" && contentObject.error.trim()) {
    return contentObject.error.trim().slice(0, 2_000);
  }

  return result.content.trim().slice(0, 2_000);
}
