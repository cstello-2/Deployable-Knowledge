import { json, type RequestHandler  } from "@sveltejs/kit";
import { listProviderPublicRecords } from "$lib/server/providers/provider";
 

export const GET: RequestHandler = async ({ url }) => {
  const includeUnavailable =
    url.searchParams.get("include_unavailable") === "true";

  const refresh = url.searchParams.get("refresh") === "true";

  const providers = await listProviderPublicRecords({
    includeUnavailable,
    refresh,
  });

  return json({ providers });
};