import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  session_messages,
  sessions,
  type SessionMessage,
} from "$lib/server/database/schema";
import {
  createAssistantPrompt,
  getAssistantRuntime,
  type AssistantRuntime,
} from "$lib/server/assistant/runtime";
import { getProvider, type Provider } from "$lib/server/providers/provider";

const USER_ID = "default";

export async function ensureChatSession(sessionId: string) {
  const [existing] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (existing) return existing;

  const timestamp = new Date().toISOString();

  const [created] = await db
    .insert(sessions)
    .values({
      id: sessionId,
      userId: USER_ID,
      title: "New conversation",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();

  return created;
}

export async function listSessionMessages(sessionId: string) {
  return await db
    .select()
    .from(session_messages)
    .where(eq(session_messages.sessionId, sessionId))
    .orderBy(asc(session_messages.id));
}

export async function saveConversationTurn({
  sessionId,
  userMessage,
  assistantMessage,
  runtime,
  userCreatedAt,
}: {
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  runtime: AssistantRuntime;
  userCreatedAt: string;
}) {
  const assistantCreatedAt = new Date().toISOString();

  await db.insert(session_messages).values([
    {
      sessionId,
      role: "user",
      content: userMessage,
      metadata: null,
      createdAt: userCreatedAt,
    },
    {
      sessionId,
      role: "assistant",
      content: assistantMessage,
      metadata: {
        provider_id: runtime.providerId,
        model_id: runtime.modelId,
        prompt_template_id: runtime.promptTemplateId,
        temperature: runtime.temperature,
        top_k: runtime.topK,
        max_tokens: runtime.maxTokens,
      },
      createdAt: assistantCreatedAt,
    },
  ]);

  await db
    .update(sessions)
    .set({
      updatedAt: assistantCreatedAt,
    })
    .where(eq(sessions.id, sessionId));
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

async function updateTitleIfNeeded({
  sessionId,
  currentTitle,
  userMessage,
  provider,
  modelId,
}: {
  sessionId: string;
  currentTitle: string | null;
  userMessage: string;
  provider: Provider;
  modelId: string;
}) {
  if (currentTitle && currentTitle !== "New conversation") return;

  try {
    const title = await createTitle(userMessage, provider, modelId);

    await db
      .update(sessions)
      .set({
        title,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sessions.id, sessionId));
  } catch (error) {
    console.warn("Title generation failed after message save:", error);
  }
}
export async function renameChatSession({
  sessionId,
  title,
}: {
  sessionId: string;
  title: string;
}) {
  const cleanTitle = title.trim() || "Untitled chat";

  await db
    .update(sessions)
    .set({
      title: cleanTitle,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sessions.id, sessionId));

  return {
    status: "ok",
    session_id: sessionId,
    title: cleanTitle,
  };
}

export async function deleteChatSession(sessionId: string) {
  await db
    .delete(session_messages)
    .where(eq(session_messages.sessionId, sessionId));

  await db.delete(sessions).where(eq(sessions.id, sessionId));

  return {
    status: "ok",
    session_id: sessionId,
  };
}

export async function createChatResponseStream({
  sessionId,
  userMessage,
}: {
  sessionId: string;
  userMessage: string;
}) {
  const session = await ensureChatSession(sessionId);
  const runtime = await getAssistantRuntime();
  const messages: SessionMessage[] = await listSessionMessages(sessionId);
  const provider = await getProvider(runtime.providerId);

  const prompt = createAssistantPrompt({
    messages,
    userMessage,
    runtime,
  });

  const userCreatedAt = new Date().toISOString();

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullResponse = "";
      let saved = false;

      try {
        for await (const chunk of provider.chat(prompt, runtime.modelId, {
          temperature: runtime.temperature,
          topK: runtime.topK,
          maxTokens: runtime.maxTokens,
        })) {
          fullResponse += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        await saveConversationTurn({
          sessionId,
          userMessage,
          assistantMessage: fullResponse,
          runtime,
          userCreatedAt,
        });

        saved = true;

        await updateTitleIfNeeded({
          sessionId,
          currentTitle: session.title,
          userMessage,
          provider,
          modelId: runtime.modelId,
        });
      } catch (error) {
        console.error("Streaming error:", error);

        if (fullResponse.trim() && !saved) {
          try {
            await saveConversationTurn({
              sessionId,
              userMessage,
              assistantMessage: fullResponse,
              runtime,
              userCreatedAt,
            });
          } catch (saveError) {
            console.error("Failed to save partial streamed response:", saveError);
          }
        }

        if (!fullResponse.trim()) {
          controller.error(error);
          return;
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Stream may already be closed.
        }
      }
    },
  });
}