import { json, type RequestHandler } from "@sveltejs/kit";
import { patchProviderRecord } from "$lib/server/providers/provider";

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const providerId = params.providerId;

    if (!providerId) {
      return json({ error: "Missing provider id" }, { status: 400 });
    }
    const body = await request.json();

    const provider = await patchProviderRecord(providerId, {
      api_key: body.api_key,
    });

    return json(provider);
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
};