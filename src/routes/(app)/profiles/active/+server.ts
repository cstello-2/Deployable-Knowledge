import { error, json } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { db } from "$lib/server/database/database";
import { seedLocalUser } from "$lib/server/database/seed";
import {
  profiles,
  type AssistantProfileValues,
} from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const user = await seedLocalUser();
  const profile = user.activeProfileId
    ? await db
        .select()
        .from(profiles)
        .where(
          and(
            eq(profiles.id, user.activeProfileId),
            eq(profiles.userId, user.id),
          ),
        )
        .get()
    : null;

  return json(profile);
};

export const PATCH: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as AssistantProfileValues;
  const user = await seedLocalUser();

  if (!user.activeProfileId) {
    throw error(404, "No active profile");
  }

  const [row] = await db
    .update(profiles)
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
    .where(
      and(eq(profiles.id, user.activeProfileId), eq(profiles.userId, user.id)),
    )
    .returning();

  if (!row) {
    throw error(404, "No active profile");
  }

  return json(row);
};
