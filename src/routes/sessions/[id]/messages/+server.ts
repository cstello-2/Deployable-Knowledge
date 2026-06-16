import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  assistant_settings,
  personas,
  prompt_templates,
  session_messages,
  sessions,
  type NewSession,
  type NewSessionMessage,
  type SessionMessage,
} from "$lib/server/database/schema";
import { getProvider, type Provider } from "$lib/server/providers/provider";
import type { RequestHandler } from "./$types";

const USER_ID = "default";
const SETTINGS_ID = "default";

function createPrompt({
  messages,
  userMessage,
  system,
  persona,
  includeHistory,
}: {
  messages: SessionMessage[];
  userMessage: string;
  system: string;
  persona: string;
  includeHistory: boolean;
}) {
  const lines: string[] = [];

  if (system.trim()) {
    lines.push(`System: ${system.trim()}`);
  }

  if (persona.trim()) {
    lines.push(`Persona: ${persona.trim()}`);
  }

  if (includeHistory) {
    for (const message of messages.slice(-20)) {
      lines.push(`${message.role}: ${message.content}`);
    }
  }

  lines.push(`user: ${userMessage}`, "assistant:");

  return lines.join("\n\n");
}

async function createTitle(
  userMessage: string,
  provider: Provider,
  modelId: string,
): Promise<string> {
  const prompt = `
You write short, informative chat titles. Return only the title.
Do not use quotation marks.
Do not add commentary.
Keep the title under 7 words when possible.
Focus on the user's main task, not minor details.

${userMessage}
`;

  let title = "";

  for await (const chunk of provider.chat(prompt, modelId, {
    temperature: 0.2,
    topK: 8,
    maxTokens: 40,
  })) {
    title += chunk;
  }

  return title.trim().split("\n")[0] || "New conversation";
}

export const POST: RequestHandler = async ({ params, request }) => {
  const sessionId = params.id;

  if (!sessionId) {
    return new Response("Missing session id", { status: 400 });
  }

  const body = await request.json();
  const message = String(body.message ?? "").trim();

  if (!message) {
    return new Response("Missing message", { status: 400 });
  }

  const [existingSession] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!existingSession) {
    const timestamp = new Date().toISOString();

    const newSession: NewSession = {
      id: sessionId,
      userId: USER_ID,
      title: "New conversation",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.insert(sessions).values(newSession);
  }

  const [settings] = await db
    .select()
    .from(assistant_settings)
    .where(eq(assistant_settings.id, SETTINGS_ID))
    .limit(1);

  const promptTemplateId = settings?.promptTemplateId || String(body.prompt_template_id || body.promptTemplateId || "rag_chat");

  const [customTemplate] = await db
    .select()
    .from(prompt_templates)
    .where(eq(prompt_templates.id, promptTemplateId))
    .limit(1);

  const [selectedPersona] = settings?.personaId
    ? await db
        .select()
        .from(personas)
        .where(eq(personas.id, settings.personaId))
        .limit(1)
    : [null];

  const providerId = settings?.providerId || String(body.provider_id || "ollama");
  const modelId =
    settings?.modelId || String(body.model_id || "granite4:350m");

  const system = customTemplate?.system || String(body.system || "");
  const persona = selectedPersona?.text || String(body.persona || "");
  const includeHistory =
    customTemplate?.includeHistory ??
    Boolean(body.include_history ?? body.includeHistory ?? true);

  const temperature = customTemplate?.temperature ?? settings?.temperature ?? Number(body.temperature ?? 0.2);

  const topK = customTemplate?.topK ?? settings?.topK ?? Number(body.top_k ?? body.topK ?? 8);

  const maxTokens = customTemplate?.maxTokens ?? settings?.maxTokens ?? Number(body.max_tokens ?? body.maxTokens ?? 512);

  const messages: SessionMessage[] = await db
    .select()
    .from(session_messages)
    .where(eq(session_messages.sessionId, sessionId))
    .orderBy(asc(session_messages.id));

  const provider = await getProvider(providerId);

  const prompt = createPrompt({
    messages,
    userMessage: message,
    system,
    persona,
    includeHistory,
  });

  const userCreatedAt = new Date().toISOString();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullResponse = "";

      try {
        for await (const chunk of provider.chat(prompt, modelId, {
          temperature,
          topK,
          maxTokens,
        })) {
          fullResponse += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        const assistantCreatedAt = new Date().toISOString();

        const newMessages: NewSessionMessage[] = [
          {
            sessionId,
            role: "user",
            content: message,
            metadata: null,
            createdAt: userCreatedAt,
          },
          {
            sessionId,
            role: "assistant",
            content: fullResponse,
            metadata: JSON.stringify({
              provider_id: providerId,
              model_id: modelId,
              prompt_template_id: promptTemplateId,
              persona_id: settings?.personaId ?? null,
              temperature,
              top_k: topK,
              max_tokens: maxTokens,
            }),
            createdAt: assistantCreatedAt,
          },
        ];

        await db.insert(session_messages).values(newMessages);

        const currentTitle = existingSession?.title;

        if (!currentTitle || currentTitle === "New conversation") {
          await db
            .update(sessions)
            .set({
              title: await createTitle(message, provider, modelId),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(sessions.id, sessionId));
        } else {
          await db
            .update(sessions)
            .set({
              updatedAt: new Date().toISOString(),
            })
            .where(eq(sessions.id, sessionId));
        }
      } catch (error) {
        console.error("Streaming error:", error);
        controller.error(error);
      } finally {
        try {
          controller.close();
        } catch {
          // Stream may already be closed.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};