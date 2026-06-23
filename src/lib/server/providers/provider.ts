import { Ollama } from "./ollama.ts";

export type ProviderChatOptions = {
  temperature?: number;
  topK?: number;
  maxTokens?: number;
};

export interface Provider {
  id: string;
  name: string;
  apiKeyRequired: boolean;

  chat(
    prompt: string,
    model: string,
    options?: ProviderChatOptions,
  ): AsyncGenerator<string>;
  listModels(): Promise<string[]>;
}

export async function getProviders(): Promise<Provider[]> {
  return [new Ollama()];
}

export async function getProvider(provider: string): Promise<Provider> {
  switch (provider) {
    case "ollama":
      return new Ollama();
    default:
      throw new Error("no provider found");
  }
}
