import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  sessions,
  settings,
  users,
  type User,
  type UserSettings,
} from "$lib/server/database/schema";

const localUser = "local_user";

export async function seedLocalUser(): Promise<{
  user: User;
  settings: UserSettings;
}> {
  let user = await db
    .select()
    .from(users)
    .where(eq(users.username, localUser))
    .get();

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        username: localUser,
        lastLogin: new Date(),
      })
      .returning();
  }

  let userSettings = await db
    .select()
    .from(settings)
    .where(eq(settings.id, localUser))
    .get();

  if (!userSettings) {
    [userSettings] = await db
      .insert(settings)
      .values({
        id: localUser,
        userId: user.id,
        updatedAt: new Date(),
      })
      .returning();
  }

  await db
    .update(sessions)
    .set({ userId: localUser })
    .where(eq(sessions.userId, "default"));

  return { user, settings: userSettings };
}
