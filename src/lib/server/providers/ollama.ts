import { Provider, type ProviderChatOptions } from "./provider.ts";

const LLAMA_API_URL = "http://localhost:11434";

export class Ollama extends Provider {
  override id = "ollama";
  override name = "Ollama";
  override apiKeyRequired = false;

  override async *chat(
    prompt: string,
    model: string,
    options: ProviderChatOptions = {},
  ): AsyncGenerator<string> {
    let req = new Request(`${LLAMA_API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        options: {
          temperature: options.temperature,
          top_k: options.topK,
          num_predict: options.maxTokens,
        },
        stream: true,
      }),
    });

    const resp = await fetch(req);

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

  override async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${LLAMA_API_URL}/api/tags`);
      
      if (!response.ok) {
        console.error(`Api error, failed to fetch models. Status: ${response.status}`);
        return [];
      }

      const data = await response.json();

      if (data && Array.isArray(data.models)) {
        return data.models.map((model: { name: string }) => model.name);
      }
      
      return [];
    } catch (error) {
      console.error("Local ollama not connected.", error);
      return [];
    }
  }
}
