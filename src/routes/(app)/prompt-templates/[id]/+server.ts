import { error, json } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { db } from "$lib/server/database/database";
import {
  profiles,
  promptTemplates,
} from "$lib/server/database/schema";
import { seedLocalUser } from "$lib/server/database/seed";
import type { RequestHandler } from "./$types";

async function getLocalUserId() {
  const user = await seedLocalUser();
  return user.id;
}

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const name = String(body.name ?? "").trim();

  if (!name) {
    throw error(400, "Prompt template name is required");
  }

  const userId = await getLocalUserId();
  const [row] = await db
    .update(promptTemplates)
    .set({
      name,
      description: String(body.description ?? ""),
      systemPrompt: String(body.systemPrompt ?? ""),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(promptTemplates.id, params.id),
        eq(promptTemplates.userId, userId),
      ),
    )
    .returning();

  if (!row) {
    throw error(404, "Prompt template not found");
  }

  return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
  const userId = await getLocalUserId();
  await db
    .update(profiles)
    .set({ promptTemplateId: null, updatedAt: new Date() })
    .where(
      and(
        eq(profiles.userId, userId),
        eq(profiles.promptTemplateId, params.id),
      ),
    );

  const [row] = await db
    .delete(promptTemplates)
    .where(
      and(
        eq(promptTemplates.id, params.id),
        eq(promptTemplates.userId, userId),
      ),
    )
    .returning();

  if (!row) {
    throw error(404, "Prompt template not found");
  }

  return json(row);
};
