import { eq } from "drizzle-orm";

import { db } from "../database/database";
import { apiKeys } from "../database/schema";

export type ProviderToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
};

export type ProviderToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ProviderToolCallDelta = {
  index: number;
  id?: string;
  nameSnapshot?: string;
  nameDelta?: string;
  argumentsSnapshot?: unknown;
  argumentsDelta?: string;
};

export type ProviderChatChunk = {
  content?: string;
  reasoningContent?: string;
  toolCalls?: ProviderToolCallDelta[];
};

export type ProviderChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      reasoningContent?: string;
      toolCalls?: ProviderToolCall[];
    }
  | {
      role: "tool";
      content: string;
      toolCallId: string;
      name: string;
    };

export type ProviderChatOptions = {
  temperature?: number;
  topK?: number;
  maxTokens?: number;
  tools?: ProviderToolDefinition[];
  toolChoice?: "auto" | "none";
  parallelToolCalls?: boolean;
};

export abstract class Provider {
  abstract id: string;
  abstract name: string;
  abstract apiKeyRequired: boolean;

  async getApiKey() {
    if (!this.apiKeyRequired) return null;

    const key = await db
      .select({ apiKey: apiKeys.apiKey })
      .from(apiKeys)
      .where(eq(apiKeys.providerId, this.id))
      .get();

    return key?.apiKey ?? null;
  }

  abstract chat(
    prompt: string,
    model: string,
    options?: ProviderChatOptions,
  ): AsyncGenerator<string>;

  abstract listModels(): Promise<string[]>;

  // No provider implements tool calling yet; this bridges the plain-text
  // `chat` generator so agent/runner.ts has something to stream against.
  async *streamChat(
    messages: ProviderChatMessage[],
    model: string,
    options: ProviderChatOptions = {},
  ): AsyncGenerator<ProviderChatChunk> {
    const prompt = messages
      .map((message) => `${message.role}: ${message.content ?? ""}`)
      .join("\n\n");

    for await (const content of this.chat(prompt, model, options)) {
      yield { content };
    }
  }
}
