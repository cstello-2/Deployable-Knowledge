import { and, asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  document_chunks,
  notebook_sources,
  profiles,
  promptTemplates,
  settings,
  type SessionMessage,
  sessions,
  session_messages,
} from "$lib/server/database/schema";
import { localUsername, seedLocalUser } from "$lib/server/database/seed";
import { getProvider } from "$lib/server/providers/registry";
import type {
  Provider,
  ProviderChatOptions,
} from "$lib/server/providers/provider";
import {
  retrieveRagContext,
  type RagContextResult,
  type RagRetrievalMode,
} from "$lib/server/rag/search/retrieve-rag-context";
import type { RequestHandler } from "./$types";

// Notebook mode (RAG off) uses this conversational prompt instead of the strict
// "answer only from context" instruction the user supplies their own context
// (their open notebook's content) rather than us retrieving it.
const CONVERSATIONAL_SYSTEM_PROMPT = `You are a helpful assistant that answers questions and completes tasks for the user.

The user may load reference material. Treat it as background knowledge — facts to draw on — not as a ready-made answer. Never copy, reprint, or restate the reference material or your earlier answers back to the user.
- If the user asks a question, answer it in your own words, adding explanation and detail beyond what the material literally says.
- If the user asks you to write, draft, summarize, or analyze something, do the task fully and originally.
- If the user asks you to expand, elaborate, explain further, or "go deeper" on a point, provide NEW detail, examples, and reasoning about that specific point. Do not repeat the point itself or reprint sentences already shown — assume the user has already read them and wants more.

If you notice you are about to repeat text that already appears above, stop and instead explain it, give an example, or add specifics. Always give a direct, helpful answer, and respond only to the user's most recent message.`;

function createConversationalPrompt(
  messages: SessionMessage[],
  userMessage: string,
  context = "",
): string {
  const lines = [`system: ${CONVERSATIONAL_SYSTEM_PROMPT}`];
  for (const message of messages.slice(-20)) {
    lines.push(`${message.role}: ${message.content}`);
  }

  if (context) {
    // Reference material goes immediately before the request, and the grounding
    // instruction is co-located with it small models attend most strongly to
    // text right at the point of generation. The instruction is deliberately
    // balanced: use the material as source data, but still perform the task
    // rather than copying the material back.
    lines.push(`Reference material (background knowledge — do not reprint it):\n\n${context}`);
    lines.push(
      `user: Use the reference material above as background knowledge. Then respond to the request below in your own words:\n` +
        `- Answer or complete the request, adding explanation, detail, and reasoning that go beyond what the material literally says.\n` +
        `- If the request asks you to expand, elaborate, or "go deeper" on a point, give NEW information, examples, and specifics about it — do not restate the point or repeat sentences already shown above.\n` +
        `- Never copy or reprint the material or earlier answers. If you catch yourself repeating the source, stop and instead explain it, give an example, or add detail.\n\n` +
        `Request: ${userMessage}`,
    );
  } else {
    lines.push(`user: ${userMessage}`);
  }

  lines.push("assistant:");
  return lines.join("\n\n");
}

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

const MAX_SOURCE_EXCERPT_CHARS = 1200;

// Chunks attached to a notebook via "Send to Notebook" — never shown in the
// notebook page text, but pulled in here so notebook-mode chat can use them.
async function getNotebookSourceExcerpts(notebookId: string): Promise<string> {
  const rows = await db
    .select({ content: document_chunks.content })
    .from(notebook_sources)
    .innerJoin(document_chunks, eq(document_chunks.id, notebook_sources.chunkId))
    .where(eq(notebook_sources.notebookId, notebookId));

  if (!rows.length) return "";

  return rows
    .map((row, index) => {
      const text = row.content.replace(/\s+/g, " ").trim().slice(0, MAX_SOURCE_EXCERPT_CHARS);
      return `[${index + 1}] ${text}`;
    })
    .join("\n\n");
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

function readRetrievalMode(value: unknown): RagRetrievalMode {
  if (value === "semantic" || value === "bm25" || value === "hybrid") {
    return value;
  }

  return "hybrid";
}

function readDocumentIds(body: Record<string, unknown>) {
  const values = Array.isArray(body.documentIds)
    ? body.documentIds
    : Array.isArray(body.document_ids)
      ? body.document_ids
      : [];

  return values.map((value: unknown) => String(value).trim()).filter(Boolean);
}

function readOptionalString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return undefined;
}

export const POST: RequestHandler = async ({ params, request }) => {
  const body = (await request.json()) as Record<string, unknown>;
  const user = await seedLocalUser();
  const profile = user.activeProfileId
    ? await db
        .select()
        .from(profiles)
        .where(
          and(
            eq(profiles.id, user.activeProfileId),
            eq(profiles.userId, user.id),
          ),
        )
        .get()
    : null;
  const userSettings = await db
    .select()
    .from(settings)
    .where(eq(settings.id, localUsername))
    .get();

  const message = String(body.message).trim();
  const modelId =
    readOptionalString(
      body.modelId,
      body.model_id,
      profile?.model,
      userSettings?.model,
    ) || "granite4:350m";
  const providerId =
    readOptionalString(
      body.providerId,
      body.provider_id,
      profile?.provider,
      userSettings?.provider,
    ) || "ollama";
  const persona =
    readOptionalString(body.persona, profile?.persona, userSettings?.persona) ||
    "";
  const documentIds = readDocumentIds(body);
  const retrievalMode = readRetrievalMode(
    profile?.retrievalMode || userSettings?.retrievalMode,
  );
  const promptTemplateId =
    readOptionalString(
      body.promptTemplateId,
      body.prompt_template_id,
      profile?.promptTemplateId,
      userSettings?.promptTemplateId,
    );
  const options = {
    temperature: Number(
      body.temperature ?? profile?.temperature ?? userSettings?.temperature ??
        0.2,
    ),
    topK: Number(
      body.topK ?? body.top_k ?? profile?.topK ?? userSettings?.topK ?? 8,
    ),
    maxTokens: Number(
      body.maxTokens ?? body.max_tokens ?? profile?.maxTokens ??
        userSettings?.maxTokens ?? 512,
    ),
  };
  const ragTopK = Number(
    body.ragTopK ?? body.rag_top_k ?? profile?.ragTopK ??
      userSettings?.ragTopK ?? 5,
  );

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
              eq(promptTemplates.userId, user.id),
            ),
          )
          .get()
      : null;
  const conversational = body.conversational === true;
  const pageContext = typeof body.context === "string" ? body.context.trim() : "";
  const notebookId = readOptionalString(body.notebookId, body.notebook_id) ?? "";

  const ragContext: RagContextResult = conversational
    ? { mode: retrievalMode, contextBlock: "", sources: [] }
    : await retrieveRagContext({
        question: message,
        documentIds,
        mode: retrievalMode,
        topK: ragTopK,
      });

  // Notebook-mode context = the visible page text + the notebook's attached
  // sources (hidden from the notebook page, invisible to the user, but the
  // model sees the full excerpts).
  const sourceExcerpts = conversational && notebookId
    ? await getNotebookSourceExcerpts(notebookId)
    : "";
  const context = [pageContext, sourceExcerpts].filter(Boolean).join("\n\n");

  const prompt = conversational
    ? createConversationalPrompt(messages, message, context)
    : createPrompt(
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
