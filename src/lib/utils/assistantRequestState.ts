export type AssistantRequestState = {
  assistantRequestInFlight: boolean;
};

export async function withAssistantRequestLock<T>(
  state: AssistantRequestState,
  task: () => Promise<T>,
): Promise<T> {
  if (state.assistantRequestInFlight) {
    throw new Error("An assistant request is already in progress.");
  }

  state.assistantRequestInFlight = true;
  try {
    return await task();
  } finally {
    state.assistantRequestInFlight = false;
  }
}
