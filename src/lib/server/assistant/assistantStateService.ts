import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  assistant_profiles,
  assistant_settings,
  personas,
  prompt_templates,
} from "$lib/server/database/schema";
import {
  builtInTemplates,
  isProtectedPromptTemplateId,
} from "$lib/server/assistant/templates";
import {
  builtInPersonas,
  isProtectedPersonaId,
} from "$lib/server/assistant/personas";

const USER_ID = "default";
const SETTINGS_ID = "default";

function now() {
  return new Date().toISOString();
}

function asString(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asNullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function asNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asNullableNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asBoolean(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === "0" || value === "false") return false;
  if (value === 1 || value === "1" || value === "true") return true;
  return fallback;
}

export async function loadAssistantState() {
  const [settings] = await db
    .select()
    .from(assistant_settings)
    .where(eq(assistant_settings.id, SETTINGS_ID))
    .limit(1);

  const promptRows = await db
    .select()
    .from(prompt_templates)
    .where(eq(prompt_templates.userId, USER_ID))
    .orderBy(asc(prompt_templates.name));

  const personaRows = await db
    .select()
    .from(personas)
    .where(eq(personas.userId, USER_ID))
    .orderBy(asc(personas.name));

  const profileRows = await db
    .select()
    .from(assistant_profiles)
    .where(eq(assistant_profiles.userId, USER_ID))
    .orderBy(asc(assistant_profiles.name));

  const mergedTemplates = [
    ...builtInTemplates,
    ...promptRows
      .filter((template) => !isProtectedPromptTemplateId(template.id))
      .map((template) => ({
        ...template,
        builtIn: false,
      })),
  ];

  const mergedPersonas = [
    ...builtInPersonas,
    ...personaRows
      .filter((persona) => !isProtectedPersonaId(persona.id))
      .map((persona) => ({
        ...persona,
        builtIn: false,
      })),
  ];

  return {
    settings:
      settings ??
      ({
        id: SETTINGS_ID,
        userId: USER_ID,
        providerId: "ollama",
        modelId: "granite4:350m",
        promptTemplateId: "rag_chat",
        personaId: null,
        temperature: 0.2,
        topK: 8,
        maxTokens: 512,
        updatedAt: now(),
      } as const),
    templates: mergedTemplates,
    personas: mergedPersonas,
    profiles: profileRows,
    providers: [
      {
        id: "ollama",
        name: "Ollama",
        label: "Ollama",
        models: ["granite4:350m"],
      },
    ],
  };
}

export async function saveAssistantSettings(settings: unknown) {
  const input = (settings ?? {}) as Record<string, unknown>;
  const timestamp = now();

  const values = {
    id: SETTINGS_ID,
    userId: USER_ID,
    providerId: asString(input.providerId ?? input.provider_id, "ollama"),
    modelId: asString(input.modelId ?? input.model_id, "granite4:350m"),
    promptTemplateId: asString(
      input.promptTemplateId ?? input.prompt_template_id,
      "rag_chat",
    ),
    personaId: asNullableString(input.personaId ?? input.persona_id),
    temperature: asNumber(input.temperature, 0.2),
    topK: asNumber(input.topK ?? input.top_k, 8),
    maxTokens: asNumber(input.maxTokens ?? input.max_tokens, 512),
    updatedAt: timestamp,
  };

  await db
    .insert(assistant_settings)
    .values(values)
    .onConflictDoUpdate({
      target: assistant_settings.id,
      set: {
        userId: values.userId,
        providerId: values.providerId,
        modelId: values.modelId,
        promptTemplateId: values.promptTemplateId,
        personaId: values.personaId,
        temperature: values.temperature,
        topK: values.topK,
        maxTokens: values.maxTokens,
        updatedAt: timestamp,
      },
    });

  return await loadAssistantState();
}

export async function savePromptTemplate(template: unknown) {
  const input = (template ?? {}) as Record<string, unknown>;
  const templateId = asString(input.id, randomUUID());

  if (isProtectedPromptTemplateId(templateId)) {
    throw new Error(
      "Default prompt templates cannot be edited directly. Use Create Prompt → Copy Prompt to make an editable version.",
    );
  }

  const timestamp = now();

  await db
    .insert(prompt_templates)
    .values({
      id: templateId,
      userId: USER_ID,
      name: asString(input.name, "Custom Prompt"),
      description: asString(input.description, ""),
      system: asString(input.system, ""),
      includeHistory: asBoolean(input.includeHistory ?? input.include_history, true),
      temperature: asNullableNumber(input.temperature),
      topK: asNullableNumber(input.topK ?? input.top_k),
      maxTokens: asNullableNumber(input.maxTokens ?? input.max_tokens),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: prompt_templates.id,
      set: {
        name: asString(input.name, "Custom Prompt"),
        description: asString(input.description, ""),
        system: asString(input.system, ""),
        includeHistory: asBoolean(input.includeHistory ?? input.include_history, true),
        temperature: asNullableNumber(input.temperature),
        topK: asNullableNumber(input.topK ?? input.top_k),
        maxTokens: asNullableNumber(input.maxTokens ?? input.max_tokens),
        updatedAt: timestamp,
      },
    });

  return await loadAssistantState();
}

export async function deletePromptTemplate(id: unknown) {
  const templateId = asString(id);

  if (isProtectedPromptTemplateId(templateId)) {
    throw new Error(
      "Default prompt templates cannot be deleted. Use Create Prompt → Copy Prompt to make an editable version.",
    );
  }

  await db.delete(prompt_templates).where(eq(prompt_templates.id, templateId));

  return await loadAssistantState();
}

export async function savePersona(persona: unknown) {
  const input = (persona ?? {}) as Record<string, unknown>;
  const personaId = asString(input.id, randomUUID());

  if (isProtectedPersonaId(personaId)) {
    throw new Error(
      "Default personas cannot be edited directly. Use Create Persona → Copy Persona to make an editable version.",
    );
  }

  const timestamp = now();

  await db
    .insert(personas)
    .values({
      id: personaId,
      userId: USER_ID,
      name: asString(input.name, "Custom Persona"),
      text: asString(input.text, ""),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: personas.id,
      set: {
        name: asString(input.name, "Custom Persona"),
        text: asString(input.text, ""),
        updatedAt: timestamp,
      },
    });

  return await loadAssistantState();
}

export async function deletePersona(id: unknown) {
  const personaId = asString(id);

  if (isProtectedPersonaId(personaId)) {
    throw new Error(
      "Default personas cannot be deleted. Use Create Persona → Copy Persona to make an editable version.",
    );
  }

  await db.delete(personas).where(eq(personas.id, personaId));

  return await loadAssistantState();
}

export async function saveAssistantProfile(profile: unknown) {
  const input = (profile ?? {}) as Record<string, unknown>;
  const profileId = asString(input.id, randomUUID());
  const timestamp = now();

  await db
    .insert(assistant_profiles)
    .values({
      id: profileId,
      userId: USER_ID,
      name: asString(input.name, "Profile"),
      promptTemplateId: asString(
        input.promptTemplateId ?? input.prompt_template_id,
        "rag_chat",
      ),
      providerId: asString(input.providerId ?? input.provider_id, "ollama"),
      modelId: asString(input.modelId ?? input.model_id, "granite4:350m"),
      personaId: asNullableString(input.personaId ?? input.persona_id),
      personaText: asNullableString(input.personaText ?? input.persona_text),
      temperature: asNumber(input.temperature, 0.2),
      topK: asNumber(input.topK ?? input.top_k, 8),
      maxTokens: asNumber(input.maxTokens ?? input.max_tokens, 512),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: assistant_profiles.id,
      set: {
        name: asString(input.name, "Profile"),
        promptTemplateId: asString(
          input.promptTemplateId ?? input.prompt_template_id,
          "rag_chat",
        ),
        providerId: asString(input.providerId ?? input.provider_id, "ollama"),
        modelId: asString(input.modelId ?? input.model_id, "granite4:350m"),
        personaId: asNullableString(input.personaId ?? input.persona_id),
        personaText: asNullableString(input.personaText ?? input.persona_text),
        temperature: asNumber(input.temperature, 0.2),
        topK: asNumber(input.topK ?? input.top_k, 8),
        maxTokens: asNumber(input.maxTokens ?? input.max_tokens, 512),
        updatedAt: timestamp,
      },
    });

  return await loadAssistantState();
}

export async function deleteAssistantProfile(id: unknown) {
  const profileId = asString(id);

  await db.delete(assistant_profiles).where(eq(assistant_profiles.id, profileId));

  return await loadAssistantState();
}