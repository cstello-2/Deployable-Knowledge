import { Provider, type ProviderChatOptions } from "./provider";

const GITHUB_API_URL = "https://models.github.ai";

export class Github extends Provider {
  override id = "github";
  override name = "GitHub Models";
  override apiKeyRequired = true;

  override async *chat(
    prompt: string,
    model: string,
    options: ProviderChatOptions = {},
  ): AsyncGenerator<string> {
    const apiKey = await this.getApiKey();

    // No top_k for Github Models
    let req = new Request(`${GITHUB_API_URL}/inference/chat/completions`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${apiKey}`,
        "X-GitHub-Api-Version": "2026-03-10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: true,
      }),
    });

    const resp = await fetch(req);
    const reader = resp.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error("reader could not be created.");

    let buffer = "";
    let complete = false;

    while (!complete) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim().startsWith("data:")) continue;

        const message = line.replace("data:", "").trim();
        if (!message) continue;

        if (message === "[DONE]") {
          complete = true;
          break;
        }

        const data = JSON.parse(message);
        const content = data.choices?.[0]?.delta?.content;

        if (content) yield content;
      }
    }

    const message = buffer.replace("data:", "").trim();

    if (message && message !== "[DONE]" && !complete) {
      const data = JSON.parse(message);
      const content = data.choices?.[0]?.delta?.content;

      if (content) yield content;
    }

    reader.releaseLock();
  }

  override async listModels(): Promise<string[]> {
    return ["openai/gpt-4.1"];
  }
}
