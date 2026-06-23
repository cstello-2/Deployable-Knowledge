import { json } from "@sveltejs/kit";

import { db } from "$lib/server/database/database";
import { apiKeys } from "$lib/server/database/schema";
import { getProviders } from "$lib/server/providers/registry";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const available = url.searchParams.get("available") === "true";

  let providers = getProviders();

  if (available) {
    const availableProviders = (
      await db.select({ providerId: apiKeys.providerId }).from(apiKeys)
    ).map((x) => x.providerId);

    providers = providers.filter(
      (x) => !x.apiKeyRequired || availableProviders.includes(x.id),
    );
  }

  return json(providers);
};
