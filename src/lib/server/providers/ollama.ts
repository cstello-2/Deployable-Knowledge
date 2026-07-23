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
        format: options.json ? "json" : undefined,
        stream: true,
      }),
    });

    const resp = await fetch(req);
    if (!resp.ok) {
      throw new Error(
        `Ollama chat failed (${resp.status}): ${await resp.text()}`,
      );
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

        if (data.message?.content) yield data.message.content;
      }

      if (done) break;
    }

    if (buffer.trim()) {
      const data = JSON.parse(buffer);
      if (data.message?.content) yield data.message.content;
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
