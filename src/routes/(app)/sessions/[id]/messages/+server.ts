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
import type { RequestHandler } from "./$types";

// This is where we construct the final prompt
function createPrompt(
  messages: SessionMessage[],
  userMessage: string,
  systemPrompt = "",
  persona = "",
) {
  const lines = [];
  const systemParts = [systemPrompt, persona].map((part) => part.trim());

  if (systemParts.length) lines.push(`system: ${systemParts.join("\n\n")}`);

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
  const prompt = createPrompt(
    messages,
    message,
    promptTemplate?.systemPrompt || "",
    persona,
  );

  // If you want to see the prompt getting sent this is it.
  // console.log(prompt);

  const timestamp = new Date();

  // Create a ReadableStream to stream chunks to the client
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullResponse = "";

      try {
        for await (const chunk of provider.chat(prompt, modelId, options)) {
          fullResponse += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        // After streaming completes, save to DB
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
            metadata: null,
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
