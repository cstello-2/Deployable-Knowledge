import { json } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { session_messages, sessions } from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  const sessionId = params.id;

  if (!sessionId) {
    return json({ error: "Missing session id" }, { status: 400 });
  }

  const messages = await db
    .select()
    .from(session_messages)
    .where(eq(session_messages.sessionId, sessionId))
    .orderBy(asc(session_messages.id));

  return json(messages);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const sessionId = params.id;

  if (!sessionId) {
    return json({ error: "Missing session id" }, { status: 400 });
  }

  const body = await request.json();
  const title = String(body.title ?? "").trim() || "Untitled chat";

  await db
    .update(sessions)
    .set({
      title,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sessions.id, sessionId));

  return json({
    status: "ok",
    session_id: sessionId,
    title,
  });
};

export const DELETE: RequestHandler = async ({ params }) => {
  const sessionId = params.id;

  if (!sessionId) {
    return json({ error: "Missing session id" }, { status: 400 });
  }

  await db
    .delete(session_messages)
    .where(eq(session_messages.sessionId, sessionId));

  await db.delete(sessions).where(eq(sessions.id, sessionId));

  return json({
    status: "ok",
    session_id: sessionId,
  });
};