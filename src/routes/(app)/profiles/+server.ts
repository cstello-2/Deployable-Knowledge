import { randomUUID } from "node:crypto";

import { error, json } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";

import { db } from "$lib/server/database/database";
import { seedLocalUser } from "$lib/server/database/seed";
import {
  profiles,
  type AssistantProfileCreateValues,
  type AssistantProfileListResponse,
} from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const user = await seedLocalUser();
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .orderBy(asc(profiles.name));
  const response: AssistantProfileListResponse = {
    profiles: rows,
    activeProfileId: user.activeProfileId,
  };

  return json(response);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as AssistantProfileCreateValues;
  const name = body.name.trim();

  if (!name) {
    throw error(400, "Profile name is required");
  }

  const user = await seedLocalUser();
  const timestamp = new Date();
  const [row] = await db
    .insert(profiles)
    .values({
      id: randomUUID(),
      userId: user.id,
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
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();

  return json(row, { status: 201 });
};
