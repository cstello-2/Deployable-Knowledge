import { Ollama } from "./ollama.ts";

export interface Provider {
  id: string;
  name: string;

  chat(prompt: string, model: string): AsyncGenerator<string>;
  listModels(): Promise<string[]>;
}
 
export async function getProvider(provider: string): Promise<Provider> {
  switch (provider) {
    case "ollama":
      return new Ollama();
    default:
      throw new Error("no provider found");
  }
}
