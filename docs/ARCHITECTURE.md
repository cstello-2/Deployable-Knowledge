# Architecture overview

Deployable Knowledge is a SvelteKit application with three main server-side
layers:

1. Route handlers under `src/routes/(app)` authenticate HTTP requests and map
   request/profile values into chat, search, document, and notebook operations.
2. Server libraries under `src/lib/server` own providers, the agent loop, the
   tool registry, retrieval/ingestion, and Drizzle database access.
3. Svelte components under `src/lib/components` render the browser workspace
   and consume the route APIs.

Chat follows this flow:

```text
Chat UI -> session message route -> agent runner -> provider stream
                                      |                 |
                                      | tool call       | structured messages
                                      v                 |
                                  tool registry <-------+
                                      |
                                  search tool -> hybrid / semantic / BM25 retrieval
                                      |
                                  tool result -> next model turn -> final answer
```

Providers normalize Ollama and GitHub Models streams into content, reasoning,
and tool-call deltas. The agent assembles those deltas, preserves
assistant/tool messages between turns, executes registered tools, and buffers
intermediate model content. The session route streams model-turn and tool-call
lifecycle events while the run is active, followed by final-answer text. It
persists one ordered title/output trace for provider reasoning and complete
tool results, plus one ordered, typed context-output list on the final assistant
message. The runner never synthesizes a specific tool call from an uncertainty
phrase.

The same registered `search` implementation serves interactive `/search`
requests, so direct search and model-initiated retrieval share validation and
execution behavior.

Return to [README](../README.md) or browse the [API reference](API_REFERENCE.md).
