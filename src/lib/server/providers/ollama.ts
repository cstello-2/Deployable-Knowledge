import type { Provider, ProviderChatOptions } from "./provider";
import process from "node:process";

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
        try{
          const data = JSON.parse(line);
          const content = data.message?.content ?? data.response ?? "";
          if (content) yield content;
        } catch {
          yield line;
        }
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
/// DEBUG ONLY `$ npx tsx src/lib/server/providers/ollama.ts llama3.1:8b`
if (process.argv[1]?.endsWith("ollama.ts")) {
  const provider = new Ollama();

  for await (const chunk of provider.chat(
    "How far away is the sun from the earth?",
    process.argv[2] ?? "granite4:350m",
  )) {
    process.stdout.write(chunk);
  }
}


  

