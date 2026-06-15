import { randomUUID } from "node:crypto";
import { json } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { sessions } from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

const USER_ID = "default";

function now() {
  return new Date().toISOString();
}

export const GET: RequestHandler = async ({ url }) => {
  const userId = url.searchParams.get("user_id") ?? USER_ID;

  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.updatedAt));

  return json(rows);
};

export const POST: RequestHandler = async () => {
  const timestamp = now();

  const [row] = await db
    .insert(sessions)
    .values({
      id: randomUUID(),
      userId: USER_ID,
      title: "New conversation",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();

  return json(row, { status: 201 });
};