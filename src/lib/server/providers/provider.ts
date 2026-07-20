import { eq } from "drizzle-orm";

import { db } from "../database/database";
import { apiKeys } from "../database/schema";

export type ProviderChatOptions = {
  temperature?: number;
  topK?: number;
  maxTokens?: number;
  tools?: ProviderToolDefinition[];
  toolChoice?: "auto" | "none";
  parallelToolCalls?: boolean;
};

export type ProviderToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ProviderToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    // Provider wire protocols usually use a JSON string here. Some local
    // servers return an object, so providers normalize it before the agent.
    arguments: string;
  };
};

export type ProviderChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  reasoningContent?: string;
  toolCalls?: ProviderToolCall[];
  toolCallId?: string;
  name?: string;
};

export type ProviderToolCallDelta = {
  index: number;
  id?: string;
  nameDelta?: string;
  nameSnapshot?: string;
  argumentsDelta?: string;
  argumentsSnapshot?: unknown;
};

export type ProviderChatChunk = {
  content?: string;
  reasoningContent?: string;
  toolCalls?: ProviderToolCallDelta[];
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

  async *chat(
    prompt: string,
    model: string,
    options: ProviderChatOptions = {},
  ): AsyncGenerator<string> {
    for await (const chunk of this.streamChat(
      [{ role: "user", content: prompt }],
      model,
      options,
    )) {
      if (chunk.content) yield chunk.content;
    }
  }

  abstract streamChat(
    messages: ProviderChatMessage[],
    model: string,
    options?: ProviderChatOptions,
  ): AsyncGenerator<ProviderChatChunk>;

  abstract listModels(): Promise<string[]>;
}
