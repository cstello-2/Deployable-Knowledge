import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { SettingsUpdateRequest } from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import { settings } from "$lib/server/database/schema";
import { localUsername, seedLocalUser } from "$lib/server/database/seed";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  await seedLocalUser();

  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.id, localUsername))
    .get();

  return json(row);
};

export const PATCH: RequestHandler = async ({ request }) => {
  await seedLocalUser();

  const body = (await request.json()) as SettingsUpdateRequest;

  const [row] = await db
    .update(settings)
    .set({
      provider: body.provider,
      model: body.model,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      topK: body.topK,
      retrievalMode: body.retrievalMode,
      ragTopK: body.ragTopK,
      agentMaxTurns: body.agentMaxTurns,
      promptTemplateId: body.promptTemplateId,
      persona: body.persona,
      updatedAt: new Date(),
    })
    .where(eq(settings.id, localUsername))
    .returning();

  return json(row);
};
