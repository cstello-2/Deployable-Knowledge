import { eq } from "drizzle-orm";

import { db } from "../database/database";
import { apiKeys } from "../database/schema";

export type ProviderChatOptions = {
  temperature?: number;
  topK?: number;
  maxTokens?: number;
  format?: "json" | Record<string, unknown>;
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
}
