# Backend services overview

The TypeScript backend is organized under `src/lib/server`:

- `agent/` runs bounded multi-turn model/tool conversations.
- `tools/` registers and executes `search`, `get_datetime`, and future tools.
- `providers/` translates normalized chat messages and tool schemas to Ollama
  or GitHub Models, then normalizes their streamed responses.
- `rag/` ingests documents, computes embeddings, and implements semantic,
  BM25, and hybrid retrieval used by the search tool.
- `database/` defines the Drizzle schema and local database access.
- `auth/` handles local sessions.

SvelteKit route handlers under `src/routes/(app)` compose these services. The
session-message route builds structured prompt messages and invokes the agent;
the search route invokes the registered search tool directly.

Return to [docs](README.md).
