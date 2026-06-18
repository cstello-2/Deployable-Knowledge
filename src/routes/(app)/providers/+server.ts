import { json } from "@sveltejs/kit";
import { getProviders } from "$lib/server/providers/provider";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const providers = await getProviders();

  return json(providers);
};
