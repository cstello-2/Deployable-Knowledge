import { json, type RequestHandler } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  assistant_profiles,
  assistant_settings,
  personas,
  prompt_templates,
  type AssistantProfile,
  type AssistantSettings,
  type NewAssistantProfile,
  type NewAssistantSettings,
  type NewPersona,
  type NewPromptTemplate,
  type Persona,
  type PromptTemplate,
} from "$lib/server/database/schema";
import { getProviderRecords } from "$lib/server/providers/provider";

const USER_ID = "default";
const SETTINGS_ID = "default";

type AssistantActionBody = {
  action?: string;
  settings?: Record<string, unknown>;
  template?: Record<string, unknown>;
  persona?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  id?: unknown;
};

async function loadAssistantData() {
  const [settings] = await db
    .select()
    .from(assistant_settings)
    .where(eq(assistant_settings.id, SETTINGS_ID))
    .limit(1);

  const fallbackSettings: AssistantSettings = {
    id: SETTINGS_ID,
    userId: USER_ID,
    providerId: "ollama",
    modelId: "granite4:350m",
    promptTemplateId: "rag_chat",
    personaId: null,
    temperature: 0.2,
    topK: 8,
    maxTokens: 512,
    updatedAt: new Date().toISOString(),
  };

  const templates: PromptTemplate[] = await db
    .select()
    .from(prompt_templates)
    .where(eq(prompt_templates.userId, USER_ID))
    .orderBy(asc(prompt_templates.name));

  const personaRows: Persona[] = await db
    .select()
    .from(personas)
    .where(eq(personas.userId, USER_ID))
    .orderBy(asc(personas.name));

  const profiles: AssistantProfile[] = await db
    .select()
    .from(assistant_profiles)
    .where(eq(assistant_profiles.userId, USER_ID))
    .orderBy(asc(assistant_profiles.name));

  const providers = await getProviderRecords();

  return {
    settings: settings ?? fallbackSettings,
    templates,
    personas: personaRows,
    profiles,
    providers,
  };
}

export const GET: RequestHandler = async () => {
  return json(await loadAssistantData());
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as AssistantActionBody;
    const action = String(body.action ?? "");

    if (action === "settings.save") {
      const input = body.settings ?? {};
      const timestamp = new Date().toISOString();

      const temperature = Number(input.temperature);
      const topK = Number(input.topK ?? input.top_k);
      const maxTokens = Number(input.maxTokens ?? input.max_tokens);

      const values: NewAssistantSettings = {
        id: SETTINGS_ID,
        userId: USER_ID,
        providerId: String(input.providerId ?? input.provider_id ?? "ollama").trim() || "ollama",
        modelId:
          String(input.modelId ?? input.model_id ?? "granite4:350m").trim() ||
          "granite4:350m",
        promptTemplateId:
          String(
            input.promptTemplateId ?? input.prompt_template_id ?? "rag_chat",
          ).trim() || "rag_chat",
        personaId:
          String(input.personaId ?? input.persona_id ?? "").trim() || null,
        temperature: Number.isFinite(temperature) ? temperature : 0.2,
        topK: Number.isFinite(topK) ? topK : 8,
        maxTokens: Number.isFinite(maxTokens) ? maxTokens : 512,
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

      return json(await loadAssistantData());
    }

    if (action === "template.save") {
      const input = body.template ?? {};
      const timestamp = new Date().toISOString();

      const templateId =
        String(input.id ?? "").trim() ||
        randomUUID();

      const temperature =
        input.temperature === null ||
        input.temperature === undefined ||
        String(input.temperature).trim() === ""
          ? null
          : Number(input.temperature);

      const topK =
        input.topK === null ||
        input.top_k === null ||
        (input.topK === undefined && input.top_k === undefined) ||
        String(input.topK ?? input.top_k).trim() === ""
          ? null
          : Number(input.topK ?? input.top_k);

      const maxTokens =
        input.maxTokens === null ||
        input.max_tokens === null ||
        (input.maxTokens === undefined && input.max_tokens === undefined) ||
        String(input.maxTokens ?? input.max_tokens).trim() === ""
          ? null
          : Number(input.maxTokens ?? input.max_tokens);

      const includeHistoryInput = input.includeHistory ?? input.include_history;

      const values: NewPromptTemplate = {
        id: templateId,
        userId: USER_ID,
        name: String(input.name ?? "Custom Prompt").trim() || "Custom Prompt",
        description: String(input.description ?? "").trim(),
        system: String(input.system ?? "").trim(),
        includeHistory:
          includeHistoryInput === false ||
          includeHistoryInput === 0 ||
          includeHistoryInput === "0" ||
          includeHistoryInput === "false"
            ? false
            : true,
        temperature: Number.isFinite(temperature) ? temperature : null,
        topK: Number.isFinite(topK) ? topK : null,
        maxTokens: Number.isFinite(maxTokens) ? maxTokens : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await db
        .insert(prompt_templates)
        .values(values)
        .onConflictDoUpdate({
          target: prompt_templates.id,
          set: {
            name: values.name,
            description: values.description,
            system: values.system,
            includeHistory: values.includeHistory,
            temperature: values.temperature,
            topK: values.topK,
            maxTokens: values.maxTokens,
            updatedAt: timestamp,
          },
        });

      return json(await loadAssistantData());
    }

    if (action === "template.delete") {
      const templateId = String(body.id ?? "").trim();

      if (!templateId) {
        return json({ error: "Missing prompt template id" }, { status: 400 });
      }

      await db
        .delete(prompt_templates)
        .where(eq(prompt_templates.id, templateId));

      return json(await loadAssistantData());
    }

    if (action === "persona.save") {
      const input = body.persona ?? {};
      const timestamp = new Date().toISOString();

      const personaId =
        String(input.id ?? "").trim() ||
        randomUUID();

      const values: NewPersona = {
        id: personaId,
        userId: USER_ID,
        name: String(input.name ?? "Custom Persona").trim() || "Custom Persona",
        text: String(input.text ?? "").trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await db
        .insert(personas)
        .values(values)
        .onConflictDoUpdate({
          target: personas.id,
          set: {
            name: values.name,
            text: values.text,
            updatedAt: timestamp,
          },
        });

      return json(await loadAssistantData());
    }

    if (action === "persona.delete") {
      const personaId = String(body.id ?? "").trim();

      if (!personaId) {
        return json({ error: "Missing persona id" }, { status: 400 });
      }

      await db.delete(personas).where(eq(personas.id, personaId));

      return json(await loadAssistantData());
    }

    if (action === "profile.save") {
      const input = body.profile ?? {};
      const timestamp = new Date().toISOString();

      const profileId =
        String(input.id ?? "").trim() ||
        randomUUID();

      const temperature = Number(input.temperature);
      const topK = Number(input.topK ?? input.top_k);
      const maxTokens = Number(input.maxTokens ?? input.max_tokens);

      const values: NewAssistantProfile = {
        id: profileId,
        userId: USER_ID,
        name: String(input.name ?? "Profile").trim() || "Profile",
        promptTemplateId:
          String(
            input.promptTemplateId ?? input.prompt_template_id ?? "rag_chat",
          ).trim() || "rag_chat",
        providerId: String(input.providerId ?? input.provider_id ?? "ollama").trim() || "ollama",
        modelId:
          String(input.modelId ?? input.model_id ?? "granite4:350m").trim() ||
          "granite4:350m",
        personaId:
          String(input.personaId ?? input.persona_id ?? "").trim() || null,
        personaText:
          String(input.personaText ?? input.persona_text ?? "").trim() || null,
        temperature: Number.isFinite(temperature) ? temperature : 0.2,
        topK: Number.isFinite(topK) ? topK : 8,
        maxTokens: Number.isFinite(maxTokens) ? maxTokens : 512,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await db
        .insert(assistant_profiles)
        .values(values)
        .onConflictDoUpdate({
          target: assistant_profiles.id,
          set: {
            name: values.name,
            promptTemplateId: values.promptTemplateId,
            providerId: values.providerId,
            modelId: values.modelId,
            personaId: values.personaId,
            personaText: values.personaText,
            temperature: values.temperature,
            topK: values.topK,
            maxTokens: values.maxTokens,
            updatedAt: timestamp,
          },
        });

      return json(await loadAssistantData());
    }

    if (action === "profile.delete") {
      const profileId = String(body.id ?? "").trim();

      if (!profileId) {
        return json({ error: "Missing profile id" }, { status: 400 });
      }

      await db
        .delete(assistant_profiles)
        .where(eq(assistant_profiles.id, profileId));

      return json(await loadAssistantData());
    }

    return json({ error: `Unknown assistant action: ${action}` }, { status: 400 });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
};