import { randomUUID } from "node:crypto";

import { error, json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

import type { ProviderApiKeyRequest } from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import { apiKeys } from "$lib/server/database/schema";
import { getProvider } from "$lib/server/providers/registry";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, url }) => {
  const provider = getProvider(params.id);
  const availableOnly = url.searchParams.get("available") === "true";
  const apiKey = await provider.getApiKey();

  if (availableOnly && provider.apiKeyRequired && !apiKey) {
    return json([]);
  }

  try {
    return json(await provider.listModels());
  } catch (cause) {
    if (availableOnly) return json([]);

    const message = cause instanceof Error ? cause.message : String(cause);
    throw error(502, message);
  }
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const provider = getProvider(params.id);

  if (!provider.apiKeyRequired) {
    throw error(400, `${provider.name} does not require an API key`);
  }

  const body = (await request.json()) as ProviderApiKeyRequest;
  const apiKey = body.apiKey.trim();

  if (!apiKey) {
    throw error(400, "API key is required");
  }

  const existing = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.providerId, provider.id))
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
      apiKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return json({ providerId: provider.id, hasApiKey: true });
};

export const DELETE: RequestHandler = async ({ params }) => {
  const provider = getProvider(params.id);

  await db
    .delete(apiKeys)
    .where(eq(apiKeys.providerId, provider.id));

  return json({ providerId: provider.id, hasApiKey: false });
};
