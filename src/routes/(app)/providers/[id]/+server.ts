import { json } from "@sveltejs/kit";
import { getProvider } from "$lib/server/providers/provider";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  if (!params.id) return json({ status: "error", provider_id: params.id });

  const provider = await getProvider(params.id);

  return json(await provider.listModels());
};
