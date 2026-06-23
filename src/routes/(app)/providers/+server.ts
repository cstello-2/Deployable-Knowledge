import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

import { db } from "$lib/server/database/database";
import { apiKeys } from "$lib/server/database/schema";
import { seedLocalUser } from "$lib/server/database/seed";
import { getProviders } from "$lib/server/providers/provider";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const { settings } = await seedLocalUser();
  const providers = await getProviders();
  const savedKeys = await db
    .select({ providerId: apiKeys.providerId })
    .from(apiKeys)
    .where(eq(apiKeys.userId, settings.userId));
  const providersWithKeys = new Set(
    savedKeys.map((key) => key.providerId),
  );

  return json(
    providers.map((provider) => {
      const hasApiKey = providersWithKeys.has(provider.id);

      return {
        id: provider.id,
        name: provider.name,
        apiKeyRequired: provider.apiKeyRequired,
        hasApiKey,
        available: !provider.apiKeyRequired || hasApiKey,
      };
    }),
  );
};
