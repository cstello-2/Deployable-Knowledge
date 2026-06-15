import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  assistant_settings,
  personas,
  prompt_templates,
  type SessionMessage,
} from "$lib/server/database/schema";
import { builtInTemplates } from "$lib/server/assistant/templates";

const USER_ID = "default";
const SETTINGS_ID = "default";


export type AssistantRuntime = {
  providerId: string;
  modelId: string;
  promptTemplateId: string;
  system: string;
  persona: string;
  includeHistory: boolean;
  temperature: number;
  topK: number;
  maxTokens: number;
};

export async function ensureAssistantSettings() {
  const [existing] = await db
    .select()
    .from(assistant_settings)
    .where(eq(assistant_settings.id, SETTINGS_ID))
    .limit(1);

  if (existing) return existing;

  const timestamp = new Date().toISOString();

  const [created] = await db
    .insert(assistant_settings)
    .values({
      id: SETTINGS_ID,
      userId: USER_ID,
      providerId: "ollama",
      modelId: "granite4:350m",
      promptTemplateId: "rag_chat",
      personaId: null,
      temperature: 0.2,
      topK: 8,
      maxTokens: 512,
      updatedAt: timestamp,
    })
    .returning();

  return created;
}

export async function getAssistantRuntime(): Promise<AssistantRuntime> {
  const settings = await ensureAssistantSettings();

  let template =
    builtInTemplates.find((item) => item.id === settings.promptTemplateId) ??
    null;

  if (!template) {
    const [customTemplate] = await db
      .select()
      .from(prompt_templates)
      .where(eq(prompt_templates.id, settings.promptTemplateId))
      .limit(1);

    if (customTemplate) {
      template = {
        id: customTemplate.id,
        name: customTemplate.name,
        description: customTemplate.description ?? "",
        system: customTemplate.system,
        includeHistory: customTemplate.includeHistory,
        temperature: customTemplate.temperature ?? settings.temperature ?? 0.2,
        topK: customTemplate.topK ?? settings.topK ?? 8,
        maxTokens: customTemplate.maxTokens ?? settings.maxTokens ?? 512,
        builtIn: false,
        };
    }
  }

  template ??= builtInTemplates[1];

  let personaText = "";

  if (settings.personaId) {
    const [persona] = await db
      .select()
      .from(personas)
      .where(eq(personas.id, settings.personaId))
      .limit(1);

    personaText = persona?.text ?? "";
  }

  return {
    providerId: settings.providerId || "ollama",
    modelId: settings.modelId || "granite4:350m",
    promptTemplateId: template.id,
    system: template.system,
    persona: personaText,
    includeHistory: template.includeHistory,
    temperature: template.temperature ?? settings.temperature ?? 0.2,
    topK: template.topK ?? settings.topK ?? 8,
    maxTokens: template.maxTokens ?? settings.maxTokens ?? 512,
  };
}

export function createAssistantPrompt({
  messages,
  userMessage,
  runtime,
}: {
  messages: SessionMessage[];
  userMessage: string;
  runtime: AssistantRuntime;
}) {
  const lines: string[] = [];

  if (runtime.system.trim()) {
    lines.push(`System: ${runtime.system.trim()}`);
  }

  if (runtime.persona.trim()) {
    lines.push(`Persona: ${runtime.persona.trim()}`);
  }

  if (runtime.includeHistory) {
    for (const message of messages.slice(-20)) {
      lines.push(`${message.role}: ${message.content}`);
    }
  }

  lines.push(`user: ${userMessage}`, "assistant:");

  return lines.join("\n\n");
}