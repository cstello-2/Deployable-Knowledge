import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { settings } from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.id, "local_user"))
    .get();

  return json(row);
};

export const PATCH: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const promptTemplateId =
    typeof body.promptTemplateId === "string" && body.promptTemplateId.trim()
      ? body.promptTemplateId.trim()
      : null;

  const [row] = await db
    .update(settings)
    .set({
      provider: body.provider,
      model: body.model,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      topK: body.topK,
      promptTemplateId,
      persona: body.persona,
      updatedAt: new Date(),
    })
    .where(eq(settings.id, "local_user"))
    .returning();

  return json(row);
};
