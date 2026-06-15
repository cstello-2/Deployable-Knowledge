import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { provider_records } from "$lib/server/database/schema";
import { Ollama } from "./ollama";

export type ProviderChatOptions = {
  temperature?: number;
  topK?: number;
  maxTokens?: number;
};

export interface Provider {
  id: string;
  name: string;

  chat(
    prompt: string,
    model: string,
    options?: ProviderChatOptions,
  ): AsyncGenerator<string>;

  listModels(refresh?: boolean): Promise<string[]>;
}

type ProviderSpec = {
  id: string;
  label: string;
  apiKeyRequired: boolean;
  fallbackModels: string[];
};

type ProviderPublicRecord = {
  id: string;
  label: string;
  api_key_required: boolean;
  has_api_key: boolean;
  available: boolean;
  models: string[];
};

const DEFAULT_PROVIDER_SPECS: Record<string, ProviderSpec> = {
  ollama: {
    id: "ollama",
    label: "Ollama",
    apiKeyRequired: false,
    fallbackModels: [],
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    apiKeyRequired: true,
    fallbackModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    apiKeyRequired: true,
    fallbackModels: [
      "claude-3-5-haiku-latest",
      "claude-3-5-sonnet-latest",
      "claude-3-7-sonnet-latest",
    ],
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    apiKeyRequired: true,
    fallbackModels: [
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-2.0-flash",
    ],
  },
  github: {
    id: "github",
    label: "GitHub Models",
    apiKeyRequired: true,
    fallbackModels: ["openai/gpt-4.1"],
  },
};

function now() {
  return new Date().toISOString();
}

function getSpec(providerId: string) {
  const spec = DEFAULT_PROVIDER_SPECS[providerId];

  if (!spec) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return spec;
}

async function getStoredApiKey(providerId: string) {
  const spec = getSpec(providerId);

  if (!spec.apiKeyRequired) {
    return "";
  }

  const [record] = await db
    .select()
    .from(provider_records)
    .where(eq(provider_records.id, providerId))
    .limit(1);

  return record?.apiKey?.trim() ?? "";
}

async function providerAvailable(providerId: string) {
  const spec = getSpec(providerId);

  if (!spec.apiKeyRequired) return true;

  const apiKey = await getStoredApiKey(providerId);
  return Boolean(apiKey);
}

class OpenAICompatibleProvider implements Provider {
  id: string;
  name: string;

  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private fallbackModels: string[];
  private extraHeaders: Record<string, string>;

  constructor({
    id,
    name,
    apiKey,
    baseUrl,
    defaultModel,
    fallbackModels,
    extraHeaders = {},
  }: {
    id: string;
    name: string;
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
    fallbackModels: string[];
    extraHeaders?: Record<string, string>;
  }) {
    this.id = id;
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.defaultModel = defaultModel;
    this.fallbackModels = fallbackModels;
    this.extraHeaders = extraHeaders;
  }

  async *chat(
    prompt: string,
    model: string,
    options: ProviderChatOptions = {},
  ): AsyncGenerator<string> {
    if (!this.apiKey) {
      throw new Error(`${this.name} API key is not configured`);
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...this.extraHeaders,
      },
      body: JSON.stringify({
        model: model || this.defaultModel,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
    });

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `${this.name} request failed: ${response.status} ${response.statusText}\n${text}`,
      );
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error(`${this.name} response reader could not be created.`);
    }

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(Boolean);

      for (const line of lines) {
        const cleanLine = line.replace(/^data:\s*/, "").trim();

        if (!cleanLine || cleanLine === "[DONE]") continue;

        try {
          const data = JSON.parse(cleanLine);
          const content = data.choices?.[0]?.delta?.content;

          if (content) yield content;
        } catch {
          // Ignore partial stream chunks.
        }
      }
    }

    reader.releaseLock();
  }

  async listModels(): Promise<string[]> {
    return this.fallbackModels;
  }
}

class AnthropicProvider implements Provider {
  id = "anthropic";
  name = "Anthropic";

  constructor(
    private apiKey: string,
    private fallbackModels: string[],
  ) {}

  async *chat(
    prompt: string,
    model: string,
    options: ProviderChatOptions = {},
  ): AsyncGenerator<string> {
    if (!this.apiKey) {
      throw new Error("Anthropic API key is not configured");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "claude-3-5-haiku-latest",
        max_tokens: options.maxTokens ?? 512,
        temperature: options.temperature,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `Anthropic request failed: ${response.status} ${response.statusText}\n${text}`,
      );
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("Anthropic response reader could not be created.");
    }

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(Boolean);

      for (const line of lines) {
        const cleanLine = line.replace(/^data:\s*/, "").trim();

        if (!cleanLine || cleanLine === "[DONE]") continue;

        try {
          const data = JSON.parse(cleanLine);
          const text = data.delta?.text;

          if (text) yield text;
        } catch {
          // Ignore non-JSON event lines.
        }
      }
    }

    reader.releaseLock();
  }

  async listModels(): Promise<string[]> {
    return this.fallbackModels;
  }
}

class GeminiProvider implements Provider {
  id = "gemini";
  name = "Gemini";

  constructor(
    private apiKey: string,
    private fallbackModels: string[],
  ) {}

  async *chat(
    prompt: string,
    model: string,
    options: ProviderChatOptions = {},
  ): AsyncGenerator<string> {
    if (!this.apiKey) {
      throw new Error("Gemini API key is not configured");
    }

    const selectedModel = model || "gemini-1.5-flash";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        selectedModel,
      )}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: options.temperature,
            maxOutputTokens: options.maxTokens,
          },
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `Gemini request failed: ${response.status} ${response.statusText}\n${text}`,
      );
    }

    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((part: any) => part.text ?? "")
        .join("") ?? "";

    if (text) yield text;
  }

  async listModels(): Promise<string[]> {
    return this.fallbackModels;
  }
}

export async function getProvider(providerId: string): Promise<Provider> {
  const spec = getSpec(providerId);
  const apiKey = await getStoredApiKey(providerId);

  switch (providerId) {
    case "ollama":
      return new Ollama();

    case "openai":
      return new OpenAICompatibleProvider({
        id: "openai",
        name: "OpenAI",
        apiKey,
        baseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini",
        fallbackModels: spec.fallbackModels,
      });

    case "github":
      return new OpenAICompatibleProvider({
        id: "github",
        name: "GitHub Models",
        apiKey,
        baseUrl: "https://models.github.ai/inference",
        defaultModel: "openai/gpt-4.1",
        fallbackModels: spec.fallbackModels,
        extraHeaders: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

    case "anthropic":
      return new AnthropicProvider(apiKey, spec.fallbackModels);

    case "gemini":
      return new GeminiProvider(apiKey, spec.fallbackModels);

    default:
      throw new Error(`No provider found for "${providerId}"`);
  }
}

export async function listProviderPublicRecords({
  includeUnavailable = false,
  refresh = false,
}: {
  includeUnavailable?: boolean;
  refresh?: boolean;
} = {}): Promise<ProviderPublicRecord[]> {
  const output: ProviderPublicRecord[] = [];

  for (const spec of Object.values(DEFAULT_PROVIDER_SPECS)) {
    const apiKey = await getStoredApiKey(spec.id);
    const available = !spec.apiKeyRequired || Boolean(apiKey);

    if (!includeUnavailable && !available) {
      continue;
    }

    let models: string[] = [];

    if (available) {
      try {
        const provider = await getProvider(spec.id);
        models = await provider.listModels(refresh);
      } catch {
        models = spec.fallbackModels;
      }
    } else {
      models = spec.fallbackModels;
    }

    output.push({
      id: spec.id,
      label: spec.label,
      api_key_required: spec.apiKeyRequired,
      has_api_key: Boolean(apiKey),
      available,
      models,
    });
  }

  return output;
}

export async function patchProviderRecord(
  providerId: string,
  patch: { api_key?: string | null },
): Promise<ProviderPublicRecord> {
  const spec = getSpec(providerId);
  const apiKey = String(patch.api_key ?? "").trim();

  if (spec.apiKeyRequired && !apiKey) {
    throw new Error("API key is required");
  }

  if (apiKey) {
    await db
      .insert(provider_records)
      .values({
        id: spec.id,
        apiKey,
        updatedAt: now(),
      })
      .onConflictDoUpdate({
        target: provider_records.id,
        set: {
          apiKey,
          updatedAt: now(),
        },
      });
  }

  const [record] = await listProviderPublicRecords({
    includeUnavailable: true,
    refresh: false,
  });

  const provider = (
    await listProviderPublicRecords({
      includeUnavailable: true,
      refresh: false,
    })
  ).find((item) => item.id === providerId);

  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return provider;
}

export async function clearProviderApiKey(
  providerId: string,
): Promise<ProviderPublicRecord> {
  const spec = getSpec(providerId);

  await db.delete(provider_records).where(eq(provider_records.id, spec.id));

  const provider = (
    await listProviderPublicRecords({
      includeUnavailable: true,
      refresh: false,
    })
  ).find((item) => item.id === providerId);

  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return provider;
}