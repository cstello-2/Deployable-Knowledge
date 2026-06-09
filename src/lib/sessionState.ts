import { get, writable } from "svelte/store";
import {
  dkClient,
  type SessionData,
  type SessionSummary,
  type UserResponse,
} from "./sdk";

export const currentSessionId = writable<string | null>(null);
export const currentSession = writable<SessionData | null>(null);
export const currentUser = writable<UserResponse | null>(null);
export const sessions = writable<SessionSummary[]>([]);
export const sessionError = writable<string | null>(null);

export async function initializeSessionState() {
  try {
    sessionError.set(null);
    await dkClient.ensureUserSession();
    const [sessionId, user] = await Promise.all([
      dkClient.getOrCreateChatSession(),
      dkClient.getUser(),
    ]);
    currentSessionId.set(sessionId);
    currentSession.set(null);
    currentUser.set(user);
    return { sessionId, user };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initialize session";
    sessionError.set(message);
    throw error;
  }
}

export async function refreshSessions() {
  const rows = await dkClient.listSessions();
  sessions.set(rows);
  return rows;
}

export async function loadSession(sessionId: string) {
  sessionError.set(null);
  const session = await dkClient.getSession(sessionId);
  currentSession.set(session);
  currentSessionId.set(session.session_id);
  return session;
}

export async function startNewSession() {
  const sessionId = await dkClient.startNewSession();
  currentSession.set(null);
  currentSessionId.set(sessionId);
  await refreshSessions();
  return sessionId;
}

export async function renameSession(sessionId: string, title: string) {
  const renamed = await dkClient.renameSession(sessionId, title);
  currentSession.update((session) =>
    session?.session_id === sessionId
      ? { ...session, title: renamed.title }
      : session,
  );
  await refreshSessions();
  return renamed;
}

export async function deleteSession(sessionId: string) {
  const deleted = await dkClient.deleteSession(sessionId);
  if (get(currentSessionId) === sessionId) {
    await startNewSession();
  } else {
    await refreshSessions();
  }
  return deleted;
}

export function logout() {
  window.location.href = "/logout";
}
