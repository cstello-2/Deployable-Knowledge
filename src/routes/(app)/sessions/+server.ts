import { randomUUID } from "node:crypto";
import { json } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { sessions } from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, "local_user"))
    .orderBy(desc(sessions.updatedAt));

  return json(rows);
};

export const POST: RequestHandler = async () => {
  const timestamp = new Date();
  const [row] = await db
    .insert(sessions)
    .values({
      id: randomUUID(),
      userId: "local_user",
      title: "New conversation",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();

  return json(row, { status: 201 });
};
