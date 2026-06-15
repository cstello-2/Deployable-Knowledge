import type { RequestHandler } from "./$types";
import { createChatResponseStream } from "$lib/server/chat/chatService";

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

  const stream = await createChatResponseStream({
    sessionId,
    userMessage: message,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};