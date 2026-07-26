import { Provider, type ProviderChatOptions } from "./provider";

const GITHUB_API_URL = "https://models.github.ai";
const GITHUB_API_VERSION = "2026-03-10";

export class Github extends Provider {
  override id = "github";
  override name = "GitHub Models";
  override apiKeyRequired = true;

  override async *chat(
    prompt: string,
    model: string,
    options: ProviderChatOptions = {},
  ): AsyncGenerator<string> {
    const apiKey =
      process.env.GITHUB_TOKEN?.trim() ||
      process.env.GITHUB_MODELS_TOKEN?.trim() ||
      (await this.getApiKey());
    if (!apiKey) {
      throw new Error(
        "GitHub Models token missing. Add GITHUB_TOKEN to .env with models:read permission.",
      );
    }
    if (!options.format) {
      yield* streamChat(apiKey, prompt, model, options);
      return;
    }

    const attempts = positiveInteger(
      process.env.GITHUB_MODELS_MAX_ATTEMPTS,
      5,
    );
    const timeout = positiveInteger(
      process.env.GITHUB_MODELS_TIMEOUT_MS,
      120_000,
    );
    const responseFormat =
      options.format === "json"
        ? { type: "json_object" }
        : {
            type: "json_schema",
            json_schema: {
              name: "structured_response",
              strict: true,
              schema: options.format,
            },
          };

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(
          `${GITHUB_API_URL}/inference/chat/completions`,
          {
            method: "POST",
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${apiKey}`,
              "X-GitHub-Api-Version": GITHUB_API_VERSION,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: prompt }],
              temperature: options.temperature,
              max_tokens: options.maxTokens,
              response_format: responseFormat,
              stream: false,
            }),
            signal: AbortSignal.timeout(timeout),
          },
        );

        if (!response.ok) {
          const detail = (await response.text()).slice(0, 1_000);
          const error = new Error(
            `GitHub Models failed (${response.status}): ${detail}`,
          );
          if (!retryableStatus(response.status) || attempt === attempts) {
            throw error;
          }
          const delay = retryDelay(
            response.headers.get("retry-after"),
            attempt,
          );
          console.warn(
            `[github-models] request ${attempt}/${attempts} returned ${response.status}; retrying in ${formatDelay(delay)}`,
          );
          await wait(delay);
          continue;
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("GitHub Models returned no message content.");
        yield content;
        return;
      } catch (error) {
        if (attempt === attempts || !retryableError(error)) throw error;
        const delay = retryDelay(null, attempt);
        console.warn(
          `[github-models] request ${attempt}/${attempts} failed; retrying in ${formatDelay(delay)}`,
        );
        await wait(delay);
      }
    }
  }

  override async listModels(): Promise<string[]> {
    return ["openai/gpt-4.1"];
  }
}

async function* streamChat(
  apiKey: string,
  prompt: string,
  model: string,
  options: ProviderChatOptions,
): AsyncGenerator<string> {
  const response = await fetch(`${GITHUB_API_URL}/inference/chat/completions`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${apiKey}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
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
  if (!response.ok) {
    throw new Error(
      `GitHub Models failed (${response.status}): ${(await response.text()).slice(0, 1_000)}`,
    );
  }
  if (!response.body) throw new Error("GitHub Models returned no response body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const message = line.replace(/^data:\s*/, "").trim();
        if (!line.startsWith("data:") || !message || message === "[DONE]") {
          continue;
        }
        const data = JSON.parse(message) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function retryableError(error: unknown): boolean {
  return (
    !(error instanceof Error) ||
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    error instanceof TypeError
  );
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return Math.min(30_000, 1_000 * 2 ** (attempt - 1));
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatDelay(milliseconds: number): string {
  return milliseconds >= 60_000
    ? `${Math.round(milliseconds / 60_000)}m`
    : `${Math.round(milliseconds / 1_000)}s`;
}
