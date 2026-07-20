import {
  Provider,
  type ProviderChatChunk,
  type ProviderChatMessage,
  type ProviderChatOptions,
} from "./provider";
import { readObject } from "$lib/server/utils/values";

const GITHUB_API_URL = "https://models.github.ai";

export class Github extends Provider {
  override id = "github";
  override name = "GitHub Models";
  override apiKeyRequired = true;

  override async *streamChat(
    messages: ProviderChatMessage[],
    model: string,
    options: ProviderChatOptions = {},
  ): AsyncGenerator<ProviderChatChunk> {
    const apiKey = await this.getApiKey();
    const tools = options.toolChoice === "none" ? undefined : options.tools;

    // No top_k for Github Models
    const req = new Request(`${GITHUB_API_URL}/inference/chat/completions`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${apiKey}`,
        "X-GitHub-Api-Version": "2026-03-10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: messages.map(toGithubMessage),
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        ...(tools?.length
          ? {
              tools,
              tool_choice: options.toolChoice ?? "auto",
              parallel_tool_calls: options.parallelToolCalls ?? true,
            }
          : {}),
        stream: true,
      }),
    });

    const resp = await fetch(req);

    if (!resp.ok) {
      throw new Error(
        `GitHub Models chat failed (${resp.status}): ${await resp.text()}`,
      );
    }

    yield* streamGithubChatResponse(resp);
  }

  override async listModels(): Promise<string[]> {
    return ["openai/gpt-4.1"];
  }
}

function toGithubMessage(message: ProviderChatMessage) {
  if (message.role === "assistant") {
    return {
      role: message.role,
      content: message.content,
      ...(message.reasoningContent
        ? { reasoning_content: message.reasoningContent }
        : {}),
      ...(message.toolCalls?.length
        ? {
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: call.type,
              function: call.function,
            })),
          }
        : {}),
    };
  }

  if (message.role === "tool") {
    return {
      role: message.role,
      content: message.content ?? "",
      tool_call_id: message.toolCallId,
      ...(message.name ? { name: message.name } : {}),
    };
  }

  return { role: message.role, content: message.content ?? "" };
}

function fromGithubDelta(data: unknown): ProviderChatChunk | null {
  const record = readObject(data);
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const choice = readObject(choices[0]);
  const delta = readObject(choice.delta);

  if (!Object.keys(delta).length) return null;

  const chunk: ProviderChatChunk = {};

  if (typeof delta.content === "string" && delta.content) {
    chunk.content = delta.content;
  }

  if (
    typeof delta.reasoning_content === "string" &&
    delta.reasoning_content
  ) {
    chunk.reasoningContent = delta.reasoning_content;
  }

  if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
    chunk.toolCalls = delta.tool_calls.map((value, fallbackIndex) => {
      const call = readObject(value);
      const fn = readObject(call.function);

      return {
        index: Number.isInteger(call.index) ? Number(call.index) : fallbackIndex,
        id: typeof call.id === "string" ? call.id : undefined,
        nameDelta: typeof fn.name === "string" ? fn.name : undefined,
        ...(typeof fn.arguments === "string"
          ? { argumentsDelta: fn.arguments }
          : { argumentsSnapshot: fn.arguments ?? {} }),
      };
    });
  }

  return chunk.content || chunk.reasoningContent || chunk.toolCalls
    ? chunk
    : null;
}

async function* streamGithubChatResponse(
  response: Response,
): AsyncGenerator<ProviderChatChunk> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) throw new Error("GitHub Models response body is unavailable.");

  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");

      for (const line of lines) {
        const event = parseServerSentEvent(line);
        if (event.done) return;
        if (event.chunk) yield event.chunk;
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseServerSentEvent(line: string): {
  done: boolean;
  chunk?: ProviderChatChunk;
} {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return { done: false };

  const payload = trimmed.slice(5).trim();
  if (!payload) return { done: false };
  if (payload === "[DONE]") return { done: true };

  const parsed = JSON.parse(payload) as unknown;
  const error = readObject(readObject(parsed).error);

  if (typeof error.message === "string" && error.message) {
    throw new Error(error.message);
  }

  return { done: false, chunk: fromGithubDelta(parsed) ?? undefined };
}
