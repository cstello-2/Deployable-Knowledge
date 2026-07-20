# API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/{provider_id}/{model_id}/chat` | POST | Single chat turn; form fields `message`, `session_id`, optional `persona`, `template_id`, `top_k`, `stream` |
| `/{provider_id}/{model_id}/chat-stream` | POST | Same as provider/model chat but always streams Server Sent Events |
| `/providers` | GET/PATCH | List providers and update provider API keys or current model |
| `/{provider_id}/models` | GET | List models for a provider |
| `/search` | GET | Query documents through the registered `search` tool with `query`, optional `topK`, and repeated `documentIds` |
| `/upload` | POST | Multipart upload of one or more documents |
| `/remove` | POST | Remove an uploaded document by filename |
| `/ingest` | POST | Parse PDFs and schedule background embedding |
| `/clear_db` | POST | Delete all vectors from ChromaDB |
| `/sessions` | GET | List stored chat sessions |
| `/sessions/{id}` | GET | Retrieve a session's history |
| `/sessions/{id}/messages` | POST | Run an agent turn and stream model/tool progress plus the final answer as newline-delimited JSON |
| `/session` | GET/POST | Fetch or create a session cookie |
| `/segments` | GET | List stored text segments |
| `/segments/{id}` | GET/DELETE | Retrieve or delete a segment |
| `/settings/{user}` | GET/PATCH | Retrieve or partially update user settings |
| `/prompt-templates` | GET/PUT | List or create prompt templates |
| `/corpus/tags` | GET | List approved corpus tags |
| `/corpus/tags` | PUT | JSON `{ "tags": ["engines", "fuels", ...] }` — replace approved tag list |
| `/corpus/document` | PATCH | JSON `{ "source": "<filename>", "tags"?: [...], "active"?: bool }` |
| `/corpus/bulk` | POST | JSON `{ "sources": [...], "add_tags"?, "remove_tags"?, "active"? }` |
| `/corpus/activate-by-tags` | POST | JSON `{ "tags": [...] }` — set **active** for every source that contains **all** listed tags; other sources’ `active` flags are unchanged |
| `/corpus/deactivate-all` | POST | Mark every ingested source inactive for RAG |
| `/corpus/clear-all` | POST | Clear ChromaDB collection, registry source entries, and uploaded files under `documents/` |

`GET /documents` returns each source with `segments`, `tags`, and `active` from the SQL-backed corpus registry.

Most endpoints return JSON. `/{provider_id}/{model_id}/chat-stream` emits
`meta`, `delta`, and `done` server-sent events. `/sessions/{id}/messages`
returns `application/x-ndjson` with one event per line:

- `agent` reports model-turn and tool-call start/completion events;
- `text` carries final-answer deltas;
- `complete` reports model-turn, tool-turn, tool-call, and context-item counts;
- `error` reports a failed run.

After `complete`, the stored assistant message contains an ordered agent trace
whose entries expose a `title` and `output` for tool results and provider
reasoning. Its metadata also contains a typed `outputs` list for source, image,
text, or structured data context.

The session message request includes `agent_max_turns`. Document-mode requests
also include `document_ids` and `rag_top_k`; these values scope/default the
agent's `search` calls rather than triggering retrieval before inference.

Return to [docs](README.md).
