import { randomUUID } from "node:crypto";
import { json } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { sessions, type NewSessionMessage } from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const userId = url.searchParams.get("user_id") ?? "default";
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.updatedAt));

  return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
  // const body = (await request.json()) as NewSessionMessage;
  const [row] = await db
    .insert(sessions)
    .values({
      id: randomUUID(),
      title: "New conversation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .returning();

  return json(row, { status: 201 });
};
