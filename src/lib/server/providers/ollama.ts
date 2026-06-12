import type { Provider } from "./provider";

const LLAMA_API_URL = "http://localhost:11434";

export class Ollama implements Provider {
  id = "ollama";
  name = "Ollama";

  async *chat(prompt: string, model: string): AsyncGenerator<string> {
    let req = new Request(`${LLAMA_API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
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

  async listModels(): Promise<string[]> {
    let req = new Request(`${LLAMA_API_URL}/api/tags`, {
      method: "GET",
    });

    const resp = await fetch(req);
    const data = await resp.json();

    return data.models.map((x: any) => x.model) ?? [];
  }
}

/// DEBUG ONLY `$ node ./ollama.ts llama3.1:8b` 
let provider = new Ollama();

for await (const chunk of provider.chat(
  "How far away is the sun from the earth?",
  process.argv[2],
)) {
  process.stdout.write(chunk);
}
