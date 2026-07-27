# Deployable Knowledge

Deployable Knowledge is a local-first retrieval-augmented generation workbench built with
SvelteKit and Svelte 5. It keeps document ingestion, retrieval, notebooks, and agentic chat in a
single windowed workspace that can run against local Ollama models or GitHub Models.

## Features

### Document ingestion and retrieval

- Ingest PDFs with text extraction and OCR fallback.
- Create local embeddings with `nomic-ai/nomic-embed-text-v1.5`.
- Search with semantic, BM25, or hybrid retrieval.
- Organize documents with tags and select the corpus used by chat.

### Agentic chat

- Stream responses from Ollama or GitHub Models.
- Configure generation, retrieval, personas, profiles, and prompt templates.
- Run multi-turn tool calls for document search, Python analysis, and date/time lookup.
- Inspect live tool traces, source citations, generated data, and images.

### Notebooks and workspace

- Create notebooks and pages, edit with autosave, and preview rendered Markdown.
- Send chat output and document sources into a notebook.
- Arrange chat, history, documents, search, and notebooks in persistent browser-style layout tabs.
- Manage appearance and assistant configuration from a dedicated settings page.
- Choose light, dark, color-accent, and high-contrast themes.

### Audio transcription

- Add audio files to the document library; the transcript is chunked, embedded, and searchable like any other document
- Audio files up to 2 hours in length and 100 MB
- Utilizes OpenAI's whisper-tiny model for transcription
- Supports all FFMpeg supported audio files

## Getting Started

### Prerequisites

- Node.js matching [`.nvmrc`](.nvmrc)
- npm
- Ollama for local chat, or a GitHub Models API key

### Install and run

```bash
npm install
npm run dev
```

The development command synchronizes the local SQLite schema before starting Vite. On first use,
the setup screen can download the embedding model required for semantic and hybrid search. Ollama
is optional until you send a chat request through the Ollama provider.

## Development Workflow

```bash
npm run lint      # Check Prettier formatting and ESLint rules
npm run format    # Format the repository
npm run check     # Run Svelte and TypeScript diagnostics
npm run build     # Create a production build

npm run db:generate
npm run db:migrate
npm run db:push
```

There is currently no automated test suite. Use the lint, check, and build gates above, then smoke
test the affected workspace flows.

## Tech Stack

| Layer               | Technology                                                |
| ------------------- | --------------------------------------------------------- |
| Application         | SvelteKit, Svelte 5 runes, TypeScript                     |
| UI                  | Tailwind CSS 4, shadcn-svelte primitives, bits-ui, Lucide |
| Database            | SQLite/libSQL with Drizzle ORM                            |
| Retrieval           | Transformers.js embeddings, BM25, hybrid search           |
| Document processing | pdf-parse, Tesseract.js, Sharp                            |
| Model providers     | Ollama, GitHub Models                                     |
| Agent tools         | Local search, Pyodide Python, date/time                   |

## Architecture

The browser application uses a layered data flow:

```text
Routes and components → runes stores → services → SvelteKit endpoints
                                           ↓
                    SQLite repositories, retrieval, providers, agent tools
```

- Components render state and delegate user actions.
- Singleton runes stores own application state and business behavior.
- Stateless services own HTTP and streaming I/O.
- SvelteKit endpoints orchestrate the database, RAG pipeline, providers, and agent runner.

See [Architecture](docs/ARCHITECTURE.md), [API Reference](docs/API_REFERENCE.md),
[Backend Services](docs/BACKEND_SERVICES.md), and [Agent Tools](docs/TOOLS.md) for more detail.

## Project Structure

```text
src/
├── lib/
│   ├── actions/          Svelte actions for workspace interactions
│   ├── components/
│   │   ├── app/
│   │   │   ├── chat/     Chat, history, messages, agent traces, and composer
│   │   │   ├── content/  Shared Markdown rendering
│   │   │   ├── dialogs/  Confirmation, progress, API key, and picker dialogs
│   │   │   ├── documents/, notebook/, search/, settings/
│   │   │   ├── navigation/  Persistent tools, settings, and user sidebar
│   │   │   └── workspace/   Layout tabs, window registry, columns, frames, and resizers
│   │   └── ui/           Reusable shadcn-svelte primitives
│   ├── constants/        Endpoints, defaults, and shared limits
│   ├── enums/            Shared string enums
│   ├── services/         Stateless API clients
│   ├── stores/           Singleton Svelte 5 runes stores
│   ├── server/           Database, repositories, RAG, providers, tools, and agents
│   ├── types/            Domain and wire types
│   └── utils/            Shared pure utilities
├── routes/               Pages and SvelteKit API endpoints
└── app.css               Tailwind theme tokens and global styles
```

Deployable Knowledge is released under the [MIT License](LICENSE).
