import { json, type RequestHandler } from "@sveltejs/kit";
import { clearProviderApiKey } from "$lib/server/providers/provider";

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const providerId = params.providerId;

    if (!providerId) {
      return json({ error: "Missing provider id" }, { status: 400 });
    }

    const provider = await clearProviderApiKey(providerId);

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