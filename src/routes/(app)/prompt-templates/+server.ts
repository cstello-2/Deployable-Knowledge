import { randomUUID } from "node:crypto";

import { error, json } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";

import { db } from "$lib/server/database/database";
import {
  promptTemplates,
  settings,
} from "$lib/server/database/schema";
import { seedLocalUser } from "$lib/server/database/seed";
import type { RequestHandler } from "./$types";

async function getLocalUserId() {
  const row = await db
    .select({ userId: settings.userId })
    .from(settings)
    .where(eq(settings.id, "local_user"))
    .get();

  if (row) return row.userId;

  const seeded = await seedLocalUser();
  return seeded.settings.userId;
}

export const GET: RequestHandler = async () => {
  const userId = await getLocalUserId();
  const rows = await db
    .select()
    .from(promptTemplates)
    .where(eq(promptTemplates.userId, userId))
    .orderBy(asc(promptTemplates.name));

  return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const name = String(body.name ?? "").trim();

  if (!name) {
    throw error(400, "Prompt template name is required");
  }

  const timestamp = new Date();
  const [row] = await db
    .insert(promptTemplates)
    .values({
      id: randomUUID(),
      userId: await getLocalUserId(),
      name,
      description: String(body.description ?? ""),
      systemPrompt: String(body.systemPrompt ?? body.system_prompt ?? ""),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();

  return json(row, { status: 201 });
};

export const PUT = POST;
