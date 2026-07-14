import { json } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";
import type { SessionTitleRequest } from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import { session_messages, sessions } from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.id))
    .limit(1);

  if (!session) return json(null);

  const messages = await db
    .select()
    .from(session_messages)
    .where(eq(session_messages.sessionId, params.id))
    .orderBy(asc(session_messages.id));

  return json(messages);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = (await request.json()) as SessionTitleRequest;
  const title = body.title.trim();
  if (!title) {
    return json({ error: "Session title is required" }, { status: 400 });
  }
  await db
    .update(sessions)
    .set({ title, updatedAt: new Date() })
    .where(eq(sessions.id, params.id));

  return json({ status: "ok", session_id: params.id, title });
};

export const DELETE: RequestHandler = async ({ params }) => {
  await db
    .delete(session_messages)
    .where(eq(session_messages.sessionId, params.id));

  await db.delete(sessions).where(eq(sessions.id, params.id));

  return json({ status: "ok", session_id: params.id });
};
