import {
  Provider,
  type ProviderChatChunk,
  type ProviderChatMessage,
  type ProviderChatOptions,
} from "./provider.ts";

const LLAMA_API_URL = "http://localhost:11434";

export class Ollama extends Provider {
  override id = "ollama";
  override name = "Ollama";
  override apiKeyRequired = false;

  override async *streamChat(
    messages: ProviderChatMessage[],
    model: string,
    options: ProviderChatOptions = {},
  ): AsyncGenerator<ProviderChatChunk> {
    const tools = options.toolChoice === "none" ? undefined : options.tools;
    const req = new Request(`${LLAMA_API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: messages.map(toOllamaMessage),
        ...(tools?.length ? { tools } : {}),
        options: {
          temperature: options.temperature,
          top_k: options.topK,
          num_predict: options.maxTokens,
        },
        stream: true,
      }),
    });

    const resp = await fetch(req);

    if (!resp.ok) {
      throw new Error(`Ollama chat failed (${resp.status}): ${await resp.text()}`);
    }

    const reader = resp.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error("reader could not be created.");

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const data = JSON.parse(line);
        const chunk = fromOllamaMessage(data.message);

        if (chunk) yield chunk;
      }

      if (done) break;
    }

    if (buffer.trim()) {
      const data = JSON.parse(buffer);
      const chunk = fromOllamaMessage(data.message);

      if (chunk) yield chunk;
    }

    reader.releaseLock();
  }

  override async listModels(): Promise<string[]> {
    let req = new Request(`${LLAMA_API_URL}/api/tags`, {
      method: "GET",
    });

    const resp = await fetch(req);
    const data = await resp.json();

    return data.models.map((x: any) => x.model) ?? [];
  }
}

function toOllamaMessage(message: ProviderChatMessage) {
  const base = {
    role: message.role,
    content: message.content ?? "",
  };

  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      ...base,
      ...(message.reasoningContent
        ? { thinking: message.reasoningContent }
        : {}),
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: call.type,
        function: {
          name: call.function.name,
          arguments: parseArguments(call.function.arguments),
        },
      })),
    };
  }

  if (message.role === "tool") {
    return {
      ...base,
      tool_call_id: message.toolCallId,
      tool_name: message.name,
    };
  }

  return base;
}

function fromOllamaMessage(message: any): ProviderChatChunk | null {
  if (!message) return null;

  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.map((call: any, index: number) => ({
        index,
        id: typeof call.id === "string" ? call.id : undefined,
        nameSnapshot:
          typeof call.function?.name === "string"
            ? call.function.name
            : undefined,
        argumentsSnapshot: call.function?.arguments ?? {},
      }))
    : undefined;
  const chunk: ProviderChatChunk = {};

  if (typeof message.content === "string" && message.content) {
    chunk.content = message.content;
  }

  if (typeof message.thinking === "string" && message.thinking) {
    chunk.reasoningContent = message.thinking;
  }

  if (toolCalls?.length) chunk.toolCalls = toolCalls;

  return chunk.content || chunk.reasoningContent || chunk.toolCalls
    ? chunk
    : null;
}

function parseArguments(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
