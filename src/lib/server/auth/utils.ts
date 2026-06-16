import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  type SafeUser,
  type UserSession,
  type NewUserSession,
  users,
  userSessions,
} from "$lib/server/database/schema";
// import type { Cookies } from "@sveltejs/kit";

// Alot of this is unnecessary code at the moment, but its a 
// good start for anything in the future, whenever it's decided
// to add authentication.

const sessionExpiresInSeconds = 60 * 60 * 24;

export function generateSecureRandomString(): string {
  // Human readable alphabet (a-z, 0-9 without l, o, 0, 1 to avoid confusion)
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";

  // Generate 24 bytes = 192 bits of entropy.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  let id = "";
  for (let i = 0; i < bytes.length; i++) {
    // >> 3 "removes" the right-most 3 bits of the byte
    id += alphabet[bytes[i] >> 3];
  }

  return id;
}

// export async function signOut(cookies: Cookies) {
//   let sessionId = cookies.get("session_token")!.split(".")[0];
//   deleteSession(sessionId);
//   cookies.delete("session_token", { path: "/" });
// }

// export async function updatePassword(id: number, password: string) {
//   let salt = generateSecureRandomString();
//   let hashedPassword = await hashSecret(password + salt);
//
//   console.log(password);
//   console.log(salt);
//   console.log(hashedPassword);
//
//   await db
//     .update(users)
//     .set({
//       password: hashedPassword,
//       salt,
//     })
//     .where(eq(users.id, id));
// }

export async function getUserById(id: number): Promise<SafeUser | undefined> {
  return await db
    .select({
      id: users.id,
      username: users.username,
    })
    .from(users)
    .where(eq(users.id, id))
    .get();
}

export async function getUserByName(
  username: string,
): Promise<SafeUser | undefined> {
  return await db
    .select({
      id: users.id,
      username: users.username,
    })
    .from(users)
    .where(eq(users.username, username))
    .get();
}

export async function createSession(username: string): Promise<NewUserSession> {
  const id = generateSecureRandomString();
  const secret = generateSecureRandomString();
  const secretHash = await hashSecret(secret);
  const token = `${id}.${secret}`;
  const user = await getUserByName(username);

  const session: NewUserSession = {
    id,
    userId: user?.id,
    secretHash: secretHash,
    createdAt: new Date(),
    token,
  };

  await db.insert(userSessions).values(session);

  return session;
}

export async function validateSessionToken(
  token: string,
): Promise<UserSession | undefined> {
  const tokenParts = token.split(".");
  if (tokenParts.length !== 2) {
    return undefined;
  }

  const sessionId = tokenParts[0];
  const sessionSecret = tokenParts[1];
  const session = await getSession(sessionId); // Retrieve session from the database

  if (!session) {
    return undefined;
  }

  const tokenSecretHash = await hashSecret(sessionSecret); // Hash the provided secret
  const validSecret = constantTimeEqual(tokenSecretHash, session.secretHash!); // Compare hashes

  return validSecret ? session : undefined;
}

export async function getSession(
  sessionId: string,
): Promise<UserSession | undefined> {
  const now = new Date();

  const session = await db
    .select()
    .from(userSessions)
    .where(eq(userSessions.id, sessionId))
    .get();

  if (!session) return undefined;

  // Check expiration
  if (
    now.getTime() - session.createdAt!.getTime() >=
    sessionExpiresInSeconds * 1000
  ) {
    await deleteSession(sessionId);
    return undefined;
  }

  return session;
}

async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(userSessions).where(eq(userSessions.id, sessionId));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  // all characters matched
  return result === 0;
}

export async function hashSecret(secret: string): Promise<string> {
  const secretBytes = new TextEncoder().encode(secret);
  const secretHashBuffer = await crypto.subtle.digest("SHA-256", secretBytes);

  const hashArray = Array.from(new Uint8Array(secretHashBuffer));
  const hexString = hashArray
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return hexString;
}
