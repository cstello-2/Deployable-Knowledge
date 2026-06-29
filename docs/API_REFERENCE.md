# API Reference

These are the main SvelteKit JSON endpoints currently used by the app.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/documents` | POST | Ingest an uploaded or selected document through the shared ingest pipeline |
| `/documents/list` | GET | List documents stored in SQLite |
| `/sessions` | GET/POST | List or create chat sessions |
| `/sessions/{id}` | GET | Read a chat session |
| `/sessions/{id}/messages` | POST | Add a user message and generate an assistant response |
| `/providers` | GET | List configured providers |
| `/providers/{id}` | PATCH | Update provider settings |
| `/settings` | GET/PATCH | Read or update app settings |
| `/prompt-templates` | GET/POST | List or create prompt templates |
| `/prompt-templates/{id}` | PATCH/DELETE | Update or delete a prompt template |
| `/notebooks` | GET/POST | List or create notebooks |
| `/notebooks/{id}` | PATCH/DELETE | Rename, select, or delete a notebook |
| `/notebooks/{id}/pages` | GET/POST | List or create notebook pages |
| `/rag/debug` | GET | Compare retrieval results without running the chat generation path |

Return to [docs](README.md).
