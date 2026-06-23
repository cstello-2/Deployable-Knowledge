import { randomUUID } from "node:crypto";

import { error, json } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { db } from "$lib/server/database/database";
import { apiKeys } from "$lib/server/database/schema";
import { seedLocalUser } from "$lib/server/database/seed";
import { getProvider } from "$lib/server/providers/provider";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  if (!params.id) return json({ status: "error", provider_id: params.id });

  const provider = await getProvider(params.id);

  return json(await provider.listModels());
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const provider = await getProvider(params.id);

  if (!provider.apiKeyRequired) {
    throw error(400, `${provider.name} does not require an API key`);
  }

  const body = await request.json();
  const apiKey = String(body.apiKey ?? body.api_key ?? "").trim();

  if (!apiKey) {
    throw error(400, "API key is required");
  }

  const { settings } = await seedLocalUser();
  const existing = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.providerId, provider.id),
        eq(apiKeys.userId, settings.userId),
      ),
    )
    .get();

  const timestamp = new Date();

  if (existing) {
    await db
      .update(apiKeys)
      .set({ apiKey, updatedAt: timestamp })
      .where(eq(apiKeys.id, existing.id));
  } else {
    await db.insert(apiKeys).values({
      id: randomUUID(),
      providerId: provider.id,
      userId: settings.userId,
      apiKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return json({ providerId: provider.id, hasApiKey: true });
};

export const DELETE: RequestHandler = async ({ params }) => {
  const provider = await getProvider(params.id);
  const { settings } = await seedLocalUser();

  await db
    .delete(apiKeys)
    .where(
      and(
        eq(apiKeys.providerId, provider.id),
        eq(apiKeys.userId, settings.userId),
      ),
    );

  return json({ providerId: provider.id, hasApiKey: false });
};
