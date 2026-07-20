import { error, json } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { db } from "$lib/server/database/database";
import { seedLocalUser } from "$lib/server/database/seed";
import {
  profiles,
  users,
  type AssistantProfileUpdateValues,
} from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = (await request.json()) as AssistantProfileUpdateValues;
  const user = await seedLocalUser();
  const existing = await db
    .select()
    .from(profiles)
    .where(
      and(eq(profiles.id, params.id), eq(profiles.userId, user.id)),
    )
    .get();

  if (!existing) {
    throw error(404, "Profile not found");
  }

  const name = body.name ? body.name.trim() : existing.name;

  if (!name) {
    throw error(400, "Profile name is required");
  }

  const [row] = await db
    .update(profiles)
    .set({
      name,
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
      and(eq(profiles.id, params.id), eq(profiles.userId, user.id)),
    )
    .returning();

  return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
  const user = await seedLocalUser();

  await db
    .update(users)
    .set({ activeProfileId: null })
    .where(
      and(
        eq(users.id, user.id),
        eq(users.activeProfileId, params.id),
      ),
    );

  const [row] = await db
    .delete(profiles)
    .where(
      and(eq(profiles.id, params.id), eq(profiles.userId, user.id)),
    )
    .returning();

  if (!row) {
    throw error(404, "Profile not found");
  }

  return json(row);
};
