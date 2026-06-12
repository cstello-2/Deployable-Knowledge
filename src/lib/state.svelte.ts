import type { Session } from "$lib/server/database/schema";

class AppState {
  currentSession = $state<Session | undefined>(undefined);
}

export function createAppState() {
  return new AppState();
}

export type { AppState };
