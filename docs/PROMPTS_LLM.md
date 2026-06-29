# Prompt and LLM Integration

Prompt templates are stored in SQLite and managed through the prompt template routes and UI.

Relevant files:

- [src/routes/(app)/prompt-templates/+server.ts](../src/routes/(app)/prompt-templates/+server.ts)
- [src/routes/(app)/prompt-templates/[id]/+server.ts](../src/routes/(app)/prompt-templates/[id]/+server.ts)
- [src/lib/server/providers/registry.ts](../src/lib/server/providers/registry.ts)
- [src/lib/server/providers/provider.ts](../src/lib/server/providers/provider.ts)
- [src/routes/(app)/sessions/[id]/messages/+server.ts](../src/routes/(app)/sessions/[id]/messages/+server.ts)

The chat message route is the main integration point. It loads session state, retrieves RAG context, selects the requested provider/model, and stores assistant metadata with the retrieval mode used for the response.

Return to [docs](README.md).
