import { eq } from "drizzle-orm";

import { db } from "$lib/server/database/database";
import {
  sessions,
  settings,
  users,
  type User,
} from "$lib/server/database/schema";

export const localUsername = "local_user";

export async function seedLocalUser(): Promise<User> {
  await db
    .update(sessions)
    .set({ userId: localUsername })
    .where(eq(sessions.userId, "default"));

  let user = await db
    .select()
    .from(users)
    .where(eq(users.username, localUsername))
    .get();

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        username: localUsername,
        activeProfileId: null,
        lastLogin: new Date(),
      })
      .returning();
  }

  const userSettings = await db
    .select()
    .from(settings)
    .where(eq(settings.id, localUsername))
    .get();

  if (!userSettings) {
    await db.insert(settings).values({
      id: localUsername,
      userId: user.id,
      updatedAt: new Date(),
    });
  }

  return user;
}
