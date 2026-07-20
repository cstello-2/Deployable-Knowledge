import { json } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import type {
  ChatMessageRequest,
  ChatMessageStreamEvent,
} from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import {
  document_chunks,
  notebook_sources,
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
  ProviderChatMessage,
  ProviderChatOptions,
} from "$lib/server/providers/provider";
import { runAgent } from "$lib/server/agent/runner";
import type { RagRetrievalMode } from "$lib/server/rag/search/retrieve-rag-context";
import { toolRegistry } from "$lib/server/tools";
import {
  NOTEBOOK_SOURCE_CONTEXT_CHARACTER_LIMIT,
  RAG_CHUNK_CHARACTER_LIMIT,
} from "$lib/utils/contextLimits";
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

const AGENT_SYSTEM_PROMPT = `TOOL-USE POLICY (follow this even if another instruction says to guess or answer "I don't know"):
1. Before answering, decide whether you already have enough reliable information in the conversation.
2. If required information is missing or uncertain and an available tool can retrieve it, call the tool. Do not guess, assume, or finalize an uncertainty answer first.
3. Use structured tool calls only. Never imitate a tool call in normal text and never invent a tool result.
4. After every tool result, decide whether it is sufficient. If it failed or is insufficient, correct the arguments and make a focused follow-up tool call while turns remain.
5. Use the python tool for exact calculations, data transformations, statistics, or requested visualizations instead of doing substantial arithmetic manually. Python runs in the backend through Pyodide and includes NumPy and Matplotlib.
6. You can create visualizations with normal Pyodide/Matplotlib code. Any open Matplotlib figures are automatically sent to the user as images. A request for a chart, plot, graph, or data visualization is incomplete until you successfully create it with the python tool; do not substitute an ASCII chart or text-only table unless the user asks for one.
7. Do not narrate this decision process. Once the evidence is sufficient, stop using tools and give a direct, self-contained final answer.`;

const DOCUMENT_SEARCH_SYSTEM_PROMPT = `DOCUMENT SEARCH POLICY:
- The search tool is how document context is obtained; no search context exists until you call it.
- For any factual question that may relate to the user's documents, files, or knowledge base, call search in the current turn before answering.
- Never treat the initially empty context as proof that the documents lack an answer.
- Use a focused standalone query. If the first results are empty or insufficient, try a shorter query, different keywords, or a more specific query before giving up while turns remain.
- Base document-specific claims only on search results. Only after searching may you say that the available documents do not answer the question.
- Do not use search for synthetic data, creative work, calculations, time, or visualization requests unless the user also asks for facts from their documents. Use the tool that directly matches the task.
- Never use search as generic recovery for uncertainty or another tool's failure.`;

function createConversationalMessages(
  messages: SessionMessage[],
  userMessage: string,
  context = "",
): ProviderChatMessage[] {
  const chatMessages: ProviderChatMessage[] = [
    {
      role: "system",
      content: `${CONVERSATIONAL_SYSTEM_PROMPT}\n\n${AGENT_SYSTEM_PROMPT}`,
    },
  ];

  // We take the last 20 messages to feed into context, we may need to
  // expand upon this to avoid hitting the token limit ceiling
  for (const message of messages.slice(-20)) {
    if (message.role === "user" || message.role === "assistant") {
      chatMessages.push({ role: message.role, content: message.content });
    }
  }

  if (context) {
    // Reference material goes immediately before the request, and the grounding
    // instruction is co-located with it small models attend most strongly to
    // text right at the point of generation. The instruction is deliberately
    // balanced: use the material as source data, but still perform the task
    // rather than copying the material back.
    chatMessages.push({
      role: "user",
      content:
        `Reference material (background knowledge — do not reprint it):\n\n${context}\n\n` +
        `Use the reference material above as background knowledge. Then respond to the request below in your own words:\n` +
        `- Answer or complete the request, adding explanation, detail, and reasoning that go beyond what the material literally says.\n` +
        `- If the request asks you to expand, elaborate, or "go deeper" on a point, give NEW information, examples, and specifics about it — do not restate the point or repeat sentences already shown above.\n` +
        `- Never copy or reprint the material or earlier answers. If you catch yourself repeating the source, stop and instead explain it, give an example, or add detail.\n\n` +
        `Request: ${userMessage}`,
    });
  } else {
    chatMessages.push({ role: "user", content: userMessage });
  }

  return chatMessages;
}

function createDocumentMessages(
  messages: SessionMessage[],
  userMessage: string,
  systemPrompt = "",
  persona = "",
): ProviderChatMessage[] {
  const personaBlock = persona.trim() ? `Persona: ${persona.trim()}` : "";
  const systemParts = [
    systemPrompt,
    personaBlock,
    AGENT_SYSTEM_PROMPT,
    DOCUMENT_SEARCH_SYSTEM_PROMPT,
  ]
    .map((part) => part.trim())
    .filter(Boolean);
  const chatMessages: ProviderChatMessage[] = [];

  if (systemParts.length) {
    chatMessages.push({ role: "system", content: systemParts.join("\n\n") });
  }

  // Only take top 20 messages
  for (const message of messages.slice(-20)) {
    if (message.role === "user" || message.role === "assistant") {
      chatMessages.push({ role: message.role, content: message.content });
    }
  }

  chatMessages.push({ role: "user", content: userMessage });
  return chatMessages;
}

// Chunks attached to a notebook via "Send to Notebook" — never shown in the
// notebook page text, but pulled in here so notebook-mode chat can use them.
async function getNotebookSourceExcerpts(notebookId: string): Promise<string> {
  const rows = await db
    .select({ content: document_chunks.content })
    .from(notebook_sources)
    .innerJoin(
      document_chunks,
      eq(document_chunks.id, notebook_sources.chunkId),
    )
    .where(eq(notebook_sources.notebookId, notebookId));

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
    storedRetrievalMode === "hybrid"
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
  const pageContext = body.conversational ? body.context : "";
  const notebookId = body.conversational ? body.notebook_id : null;

  // Notebook-mode context = the visible page text + the notebook's attached
  // sources (hidden from the notebook page, invisible to the user, but the
  // model sees the full excerpts).
  const sourceExcerpts =
    body.conversational && notebookId
      ? await getNotebookSourceExcerpts(notebookId)
      : "";

  const context = [pageContext, sourceExcerpts].filter(Boolean).join("\n\n");

  const chatMessages = body.conversational
    ? createConversationalMessages(messages, message, context)
    : createDocumentMessages(
        messages,
        message,
        promptTemplate?.systemPrompt || "",
        persona,
      );
  const toolNames = body.conversational
    ? ["get_datetime", "python"]
    : ["get_datetime", "search", "python"];
  const ragTopK = body.conversational
    ? (profile?.ragTopK ?? 5)
    : body.rag_top_k;
  const documentIds = body.conversational ? undefined : body.document_ids;

  const timestamp = new Date();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullResponse = "";
      let closed = false;
      const send = (event: ChatMessageStreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const agentResult = await runAgent({
          provider,
          model: modelId,
          messages: chatMessages,
          chatOptions: options,
          registry: toolRegistry,
          toolNames,
          maxToolTurns: body.agent_max_turns,
          toolContext: {
            documentIds,
            retrievalMode,
            ragTopK,
          },
          onProgress(progress) {
            send({ type: "agent", progress });
          },
          onFinalText(chunk) {
            fullResponse += chunk;
            send({ type: "text", delta: chunk });
          },
        });

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
              agent: {
                providerId,
                modelId,
                modelTurns: agentResult.modelTurns,
                toolTurns: agentResult.toolTurns,
                trace: agentResult.trace,
              },
              ...(agentResult.outputs.length
                ? { outputs: agentResult.outputs }
                : {}),
            },
            createdAt: timestamp,
          },
        ]);

        send({
          type: "complete",
          modelTurns: agentResult.modelTurns,
          toolTurns: agentResult.toolTurns,
          toolCalls: agentResult.toolExecutions.length,
          contextItems: agentResult.outputs.length,
        });
        controller.close();
        closed = true;

        void createTitle(message, provider, modelId, options)
          .then((title) =>
            db
              .update(sessions)
              .set({ title, updatedAt: new Date() })
              .where(eq(sessions.id, params.id)),
          )
          .catch((error) => console.error("Title generation error:", error));
      } catch (error) {
        console.error("Streaming error:", error);
        const message = error instanceof Error ? error.message : String(error);
        send({ type: "error", message });
      } finally {
        if (!closed) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
