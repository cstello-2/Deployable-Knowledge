import type { Provider, ProviderChatOptions } from "./provider";

const LLAMA_API_URL = "http://localhost:11434";

export class Ollama implements Provider {
  id = "ollama";
  name = "Ollama";

  async *chat(
    prompt: string,
    model: string,
    options: ProviderChatOptions = {},
  ): AsyncGenerator<string> {
    const resp = await fetch(`${LLAMA_API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        options: {
          temperature: options.temperature,
          top_k: options.topK,
          num_predict: options.maxTokens,
        },
      }),
    });

    if (!resp.ok) {
      throw new Error(`Ollama request failed: ${resp.status} ${resp.statusText}`);
    }

    const reader = resp.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error("reader could not be created.");

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(Boolean);

      for (const line of lines) {
        const data = JSON.parse(line);

        if (data.message?.content) yield data.message.content;
      }
    }

    reader.releaseLock();
  }

  async listModels(): Promise<string[]> {
    const resp = await fetch(`${LLAMA_API_URL}/api/tags`, {
      method: "GET",
    });

    if (!resp.ok) {
      return [];
    }

    const data = await resp.json();

    return data.models?.map((model: any) => model.model) ?? [];
  }
}