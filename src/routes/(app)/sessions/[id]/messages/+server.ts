import { and, asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  promptTemplates,
  type SessionMessage,
  sessions,
  session_messages,
  settings,
} from "$lib/server/database/schema";
import { getProvider } from "$lib/server/providers/registry";
import type {
  Provider,
  ProviderChatOptions,
} from "$lib/server/providers/provider";
import {
  retrieveRagContext,
  type RagRetrievalMode,
} from "$lib/server/rag/search/retrieve-rag-context";
import type { RequestHandler } from "./$types";

// This is where we construct the final prompt
function createPrompt(
  messages: SessionMessage[],
  userMessage: string,
  systemPrompt = "",
  persona = "",
  ragContext = "",
) {
  const lines = [];
  const ragInstruction = ragContext
    ? "You are a RAG helper. Only answer using the provided context. Do not add information that is not in context. If the answer is not in context, say you do not know."
    : "";
  const personaBlock = persona.trim() ? `Persona: ${persona.trim()}` : "";
  const systemParts = [systemPrompt, ragInstruction, personaBlock, ragContext]
    .map((part) => part.trim())
    .filter(Boolean);

  if (systemParts.length) lines.push(systemParts.join("\n\n"));

  // Only take top 20 messages
  for (const message of messages.slice(-20)) {
    lines.push(`${message.role}: ${message.content}`);
  }

  // Push in prompt
  lines.push(`user: ${userMessage}`, "assistant:");
  return lines.join("\n\n");
}

async function createTitle(
  userMessage: string,
  provider: Provider,
  modelId: string,
  options: ProviderChatOptions,
): Promise<string> {
  const prompt = `
    You write short, informative chat titles. Return only the title. Do not use quotation marks. 
    Do not add commentary. Keep the title under 7 words when possible. 
    Focus on the user's main task, not minor details.

    ${userMessage}
  `;

  let title = "";

  for await (const chunk of provider.chat(prompt, modelId, options)) {
    title += chunk;
  }

  return title.trim().split("\n")[0] || "New conversation";
}

function readRetrievalMode(value: unknown): RagRetrievalMode | undefined {
  if (value === "semantic" || value === "bm25" || value === "hybrid" || value === "graph") {
    return value;
  }

  return undefined;
}

export const POST: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const userSettings = (await db
    .select()
    .from(settings)
    .where(eq(settings.id, "local_user"))
    .get())!;

  const message = String(body.message).trim();
  const modelId = body.model_id || userSettings.model;
  const providerId = body.provider_id || userSettings.provider;
  const persona = body.persona || userSettings.persona || "";
  const documentIds = Array.isArray(body.document_ids)
    ? body.document_ids.map((value: unknown) => String(value).trim()).filter(Boolean)
    : [];
  const retrievalMode =
    readRetrievalMode(body.retrieval_mode) ??
    readRetrievalMode(userSettings.retrievalMode) ??
    "hybrid";
  const promptTemplateId =
    body.prompt_template_id ||
    body.promptTemplateId ||
    userSettings.promptTemplateId;
  const options = {
    temperature: body.temperature ?? userSettings.temperature,
    topK: body.top_k ?? userSettings.topK,
    maxTokens: body.max_tokens ?? userSettings.maxTokens,
  };

  const [existing] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.id))
    .limit(1);

  if (!existing) {
    const timestamp = new Date();
    await db.insert(sessions).values({
      id: params.id,
      userId: "local_user",
      title: "New Conversation",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  const messages: SessionMessage[] = await db
    .select()
    .from(session_messages)
    .where(eq(session_messages.sessionId, params.id))
    .orderBy(asc(session_messages.id));

  const provider = getProvider(providerId);
  const promptTemplate =
    typeof promptTemplateId === "string" && promptTemplateId.trim()
      ? await db
          .select()
          .from(promptTemplates)
          .where(
            and(
              eq(promptTemplates.id, promptTemplateId.trim()),
              eq(promptTemplates.userId, userSettings.userId),
            ),
          )
          .get()
      : null;
  const ragContext = await retrieveRagContext({
    question: message,
    documentIds,
    mode: retrievalMode,
    topK: body.rag_top_k ?? userSettings.ragTopK,
  });
  const prompt = createPrompt(
    messages,
    message,
    promptTemplate?.systemPrompt || "",
    persona,
    ragContext.contextBlock,
  );

  const timestamp = new Date();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullResponse = "";

      try {
        for await (const chunk of provider.chat(prompt, modelId, options)) {
          fullResponse += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        await db.insert(session_messages).values([
          {
            sessionId: params.id,
            role: "user",
            content: message,
            metadata: null,
            createdAt: timestamp,
          },
          {
            sessionId: params.id,
            role: "assistant",
            content: fullResponse,
            metadata: ragContext.sources.length
              ? {
                  retrievalMode: ragContext.mode,
                  sources: ragContext.sources,
                }
              : null,
            createdAt: timestamp,
          },
        ]);

        await db
          .update(sessions)
          .set({
            title: await createTitle(message, provider, modelId, options),
            updatedAt: new Date(),
          })
          .where(eq(sessions.id, params.id));
      } catch (error) {
        console.error("Streaming error:", error);
        controller.error(error);
      } finally {
        controller.close();
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
