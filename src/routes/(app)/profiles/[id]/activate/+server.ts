import { error, json } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { db } from "$lib/server/database/database";
import { seedLocalUser } from "$lib/server/database/seed";
import {
  profiles,
  users,
  type AssistantProfileActivationResponse,
} from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params }) => {
  const user = await seedLocalUser();
  const profile = await db
    .select()
    .from(profiles)
    .where(
      and(eq(profiles.id, params.id), eq(profiles.userId, user.id)),
    )
    .get();

  if (!profile) {
    throw error(404, "Profile not found");
  }

  await db
    .update(users)
    .set({ activeProfileId: profile.id })
    .where(eq(users.id, user.id));

  const response: AssistantProfileActivationResponse = {
    profile,
    activeProfileId: profile.id,
  };

  return json(response);
};
