import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  provider_records,
  type NewProviderRecord,
  type ProviderRecord,
} from "$lib/server/database/schema";
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

export type ProviderPublicRecord = {
  id: string;
  label: string;
  api_key_required: boolean;
  has_api_key: boolean;
  available: boolean;
  models: string[];
};

type ProviderDefinition = {
  id: string;
  label: string;
  apiKeyRequired: boolean;
  create: (apiKey: string) => Provider;
};

class OpenAICompatibleProvider implements Provider {
  id: string;
  name: string;

  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private modelOptions: string[];
  private extraHeaders: Record<string, string>;

  constructor({
    id,
    name,
    apiKey,
    baseUrl,
    defaultModel,
    modelOptions,
    extraHeaders = {},
  }: {
    id: string;
    name: string;
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
    modelOptions: string[];
    extraHeaders?: Record<string, string>;
  }) {
    this.id = id;
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.defaultModel = defaultModel;
    this.modelOptions = modelOptions;
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

    try {
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
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<string[]> {
    return this.modelOptions;
  }
}

class AnthropicProvider implements Provider {
  id = "anthropic";
  name = "Anthropic";

  private modelOptions = [
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-latest",
    "claude-3-7-sonnet-latest",
  ];

  constructor(private apiKey: string) {}

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
        model: model || this.modelOptions[0],
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

    try {
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
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<string[]> {
    return this.modelOptions;
  }
}

class GeminiProvider implements Provider {
  id = "gemini";
  name = "Gemini";

  private modelOptions = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.0-flash",
  ];

  constructor(private apiKey: string) {}

  async *chat(
    prompt: string,
    model: string,
    options: ProviderChatOptions = {},
  ): AsyncGenerator<string> {
    if (!this.apiKey) {
      throw new Error("Gemini API key is not configured");
    }

    const selectedModel = model || this.modelOptions[0];

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
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("") ?? "";

    if (text) yield text;
  }

  async listModels(): Promise<string[]> {
    return this.modelOptions;
  }
}

const providerDefinitions: ProviderDefinition[] = [
  {
    id: "ollama",
    label: "Ollama",
    apiKeyRequired: false,
    create: () => new Ollama(),
  },
  {
    id: "openai",
    label: "OpenAI",
    apiKeyRequired: true,
    create: (apiKey) =>
      new OpenAICompatibleProvider({
        id: "openai",
        name: "OpenAI",
        apiKey,
        baseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini",
        modelOptions: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
      }),
  },
  {
    id: "anthropic",
    label: "Anthropic",
    apiKeyRequired: true,
    create: (apiKey) => new AnthropicProvider(apiKey),
  },
  {
    id: "gemini",
    label: "Gemini",
    apiKeyRequired: true,
    create: (apiKey) => new GeminiProvider(apiKey),
  },
  {
    id: "github",
    label: "GitHub Models",
    apiKeyRequired: true,
    create: (apiKey) =>
      new OpenAICompatibleProvider({
        id: "github",
        name: "GitHub Models",
        apiKey,
        baseUrl: "https://models.github.ai/inference",
        defaultModel: "openai/gpt-4.1",
        modelOptions: ["openai/gpt-4.1"],
        extraHeaders: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }),
  },
];

function getProviderDefinition(providerId: string) {
  const definition = providerDefinitions.find(
    (provider) => provider.id === providerId,
  );

  if (!definition) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return definition;
}

async function getProviderApiKey(providerId: string) {
  const definition = getProviderDefinition(providerId);

  if (!definition.apiKeyRequired) {
    return "";
  }

  const records: ProviderRecord[] = await db
    .select()
    .from(provider_records)
    .where(eq(provider_records.id, providerId))
    .limit(1);

  return records[0]?.apiKey?.trim() ?? "";
}

export async function getProvider(providerId: string): Promise<Provider> {
  const definition = getProviderDefinition(providerId);
  const apiKey = await getProviderApiKey(providerId);

  return definition.create(apiKey);
}

export async function listProviderPublicRecords({
  includeUnavailable = false,
  refresh = false,
}: {
  includeUnavailable?: boolean;
  refresh?: boolean;
} = {}): Promise<ProviderPublicRecord[]> {
  const providers: ProviderPublicRecord[] = [];

  for (const definition of providerDefinitions) {
    const apiKey = await getProviderApiKey(definition.id);
    const available = !definition.apiKeyRequired || Boolean(apiKey);

    if (!includeUnavailable && !available) {
      continue;
    }

    const provider = definition.create(apiKey);

    let models: string[] = [];

    if (available || definition.id === "ollama") {
      try {
        models = await provider.listModels(refresh);
      } catch {
        models = [];
      }
    } else {
      models = await provider.listModels(refresh);
    }

    providers.push({
      id: definition.id,
      label: definition.label,
      api_key_required: definition.apiKeyRequired,
      has_api_key: Boolean(apiKey),
      available,
      models,
    });
  }

  return providers;
}

export async function getProviderRecords() {
  return listProviderPublicRecords({
    includeUnavailable: true,
    refresh: true,
  });
}

export async function patchProviderRecord(
  providerId: string,
  patch: { api_key?: string | null },
): Promise<ProviderPublicRecord> {
  const definition = getProviderDefinition(providerId);
  const apiKey = String(patch.api_key ?? "").trim();

  if (definition.apiKeyRequired && !apiKey) {
    throw new Error("API key is required");
  }

  const values: NewProviderRecord = {
    id: definition.id,
    apiKey,
    updatedAt: new Date().toISOString(),
  };

  await db
    .insert(provider_records)
    .values(values)
    .onConflictDoUpdate({
      target: provider_records.id,
      set: {
        apiKey: values.apiKey,
        updatedAt: values.updatedAt,
      },
    });

  const providers = await listProviderPublicRecords({
    includeUnavailable: true,
    refresh: false,
  });

  const provider = providers.find((item) => item.id === providerId);

  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return provider;
}

export async function clearProviderApiKey(
  providerId: string,
): Promise<ProviderPublicRecord> {
  const definition = getProviderDefinition(providerId);

  await db.delete(provider_records).where(eq(provider_records.id, definition.id));

  const providers = await listProviderPublicRecords({
    includeUnavailable: true,
    refresh: false,
  });

  const provider = providers.find((item) => item.id === providerId);

  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return provider;
}