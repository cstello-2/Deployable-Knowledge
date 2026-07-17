import { json } from "@sveltejs/kit";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { ChatMessageRequest } from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import {
  document_chunks,
  notebook_sources,
  notebooks,
  profiles,
  promptTemplates,
  type SessionMessage,
  sessions,
  session_messages,
} from "$lib/server/database/schema";
import { seedLocalUser } from "$lib/server/database/seed";
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
import {
  ensureKnowledgeGraph,
  ensureKnowledgeGraphForChunks,
  KnowledgeGraphNoDocumentsError,
  KnowledgeGraphNotBuiltError,
} from "$lib/server/knowledge-graph";
import {
  NOTEBOOK_SOURCE_CONTEXT_CHARACTER_LIMIT,
  RAG_CHUNK_CHARACTER_LIMIT,
} from "$lib/utils/contextLimits";
import {
  createNotebookContextMetadata,
  resolveNotebookContext,
} from "$lib/server/notebooks/context";
import { createConversationalPrompt } from "$lib/server/notebooks/prompt";
import type { RequestHandler } from "./$types";

const NOTEBOOK_USER_ID = "default";

function createPrompt(
  messages: SessionMessage[],
  userMessage: string,
  systemPrompt = "",
  persona = "",
  ragContext = "",
) {
  const lines = [];
  const ragInstruction = ragContext
    ? "You are a RAG helper. Only answer using the provided context. Do not add information that is not in context. If the answer is not in context, say 'I do not know the answer to that based off the context provided'."
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

// Chunks attached to a notebook via "Send to Notebook" — never shown in the
// notebook page text, but pulled in here so notebook-mode chat can use them.
async function getNotebookSourceExcerpts(
  notebookIds: readonly string[],
): Promise<string> {
  if (!notebookIds.length) return "";
  const rows = await db
    .select({ content: document_chunks.content })
    .from(notebook_sources)
    .innerJoin(
      document_chunks,
      eq(document_chunks.id, notebook_sources.chunkId),
    )
    .innerJoin(notebooks, eq(notebooks.id, notebook_sources.notebookId))
    .where(
      and(
        eq(notebooks.userId, NOTEBOOK_USER_ID),
        inArray(notebook_sources.notebookId, [...notebookIds]),
      ),
    );

  if (!rows.length) return "";

  const excerpts: string[] = [];
  let remaining = NOTEBOOK_SOURCE_CONTEXT_CHARACTER_LIMIT;

  for (const [index, row] of rows.entries()) {
    const prefix = `[${index + 1}] `;
    const separatorLength = excerpts.length ? 2 : 0;
    const available = remaining - prefix.length - separatorLength;
    if (available <= 0) break;

    const text = row.content
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, Math.min(RAG_CHUNK_CHARACTER_LIMIT, available));

    if (!text) continue;

    const excerpt = `${prefix}${text}`;
    excerpts.push(excerpt);
    remaining -= excerpt.length + separatorLength;
  }

  return excerpts.join("\n\n");
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

export const POST: RequestHandler = async ({ params, request }) => {
  const body = (await request.json()) as ChatMessageRequest;

  if (
    !body.message.trim() ||
    !body.model_id.trim() ||
    !body.provider_id.trim()
  ) {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

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

  const message = body.message.trim();
  const modelId = body.model_id.trim();
  const providerId = body.provider_id.trim();
  const storedRetrievalMode = profile?.retrievalMode;
  const retrievalMode: RagRetrievalMode =
    storedRetrievalMode === "semantic" ||
    storedRetrievalMode === "bm25" ||
    storedRetrievalMode === "hybrid" ||
    storedRetrievalMode === "graph"
      ? storedRetrievalMode
      : "hybrid";

  const options: ProviderChatOptions = {
    temperature: body.temperature,
    topK: body.top_k,
    maxTokens: body.max_tokens,
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

  if (messages.some((existingMessage) => existingMessage.role === "user")) {
    return json(
      {
        code: "SESSION_QUERY_LIMIT",
        message: "This chat already has a question. Start a new chat to ask another one.",
      },
      { status: 409 },
    );
  }

  const provider = getProvider(providerId);
  const promptTemplateId = body.conversational
    ? null
    : body.prompt_template_id;
  const promptTemplate =
    promptTemplateId
      ? await db
          .select()
          .from(promptTemplates)
          .where(
            and(
              eq(promptTemplates.id, promptTemplateId),
              eq(promptTemplates.userId, user.id),
            ),
          )
          .get()
      : null;
  const persona = body.conversational ? "" : body.persona;
  const notebookId = body.conversational ? body.notebook_id : null;
  const hasNotebookIdSelection = body.conversational &&
    (
      Boolean(notebookId) ||
      Boolean(body.notebook_context_notebook_ids?.length) ||
      Boolean(body.notebook_context_page_ids?.length)
    );
  const resolvedNotebookContext = body.conversational
    ? await resolveNotebookContext(
        body.notebook_context_notebook_ids,
        body.notebook_context_page_ids,
        notebookId,
      )
    : {
        context: "",
        notebookIds: [],
        pageIds: [],
        pages: [],
      };
  const pageContext = body.conversational
    ? hasNotebookIdSelection
      ? resolvedNotebookContext.context
      : body.context ?? ""
    : "";
  const documentIds =
    body.document_ids.map((value) => String(value).trim()).filter(Boolean);
  const ragTopK = body.rag_top_k;

  let ragContext: RagContextResult;
  try {
    ragContext = body.conversational
      ? { mode: retrievalMode, contextBlock: "", sources: [] }
      : await retrieveRagContext({
          question: message,
          documentIds,
          mode: retrievalMode,
          topK: ragTopK,
        });
  } catch (error) {
    if (
      error instanceof KnowledgeGraphNotBuiltError ||
      error instanceof KnowledgeGraphNoDocumentsError
    ) {
      return json(
        {
          code: error.code,
          message: error.message,
          graphStatus: error.graphStatus,
        },
        { status: 409 },
      );
    }
    throw error;
  }

  // When the user did not explicitly select documents, scope this query's
  // graph to the documents that retrieval actually matched. An empty graph
  // scope means the entire corpus and can turn a small query graph into a
  // multi-thousand-chunk rebuild.
  const graphScopeContext = body.conversational
    ? await retrieveRagContext({
        question: message,
        documentIds,
        mode: retrievalMode === "graph" ? "hybrid" : retrievalMode,
        topK: ragTopK,
      })
    : ragContext;
  const graphDocumentIds = documentIds.length
    ? [...new Set(documentIds)]
    : [...new Set(
        graphScopeContext.sources
          .map((source) => source.documentId)
          .filter(Boolean),
      )];
  const graphChunkIds = [...new Set(
    graphScopeContext.sources
      .map((source) => source.chunkId)
      .filter(Boolean),
  )];

  // Retrieval has now established the exact graph scope. Start construction
  // while the model is generating its answer; the client will request the
  // query-focused visual data after the streamed response is stored.
  const graphPreparation = graphChunkIds.length
    ? ensureKnowledgeGraphForChunks(graphChunkIds)
    : ensureKnowledgeGraph(graphDocumentIds);
  void graphPreparation.catch((error) => {
    console.error("Background Knowledge Graph preparation failed:", error);
  });

  // Notebook-mode context = the visible page text + the notebook's attached
  // sources (hidden from the notebook page, invisible to the user, but the
  // model sees the full excerpts).
  const sourceExcerpts =
    body.conversational && resolvedNotebookContext.notebookIds.length
      ? await getNotebookSourceExcerpts(resolvedNotebookContext.notebookIds)
      : "";

  const context = [pageContext, sourceExcerpts].filter(Boolean).join("\n\n");

  const prompt = body.conversational
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
            metadata: {
              retrievalMode: body.conversational ? "notebook" : ragContext.mode,
              sources: ragContext.sources,
              query: message,
              documentIds,
              graphDocumentIds,
              graphChunkIds,
              graphTopK: ragTopK,
              ...createNotebookContextMetadata(
                body.conversational,
                resolvedNotebookContext,
              ),
            },
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
