# Deployable Knowledge

Deployable Knowledge is a local-first retrieval-augmented generation workbench built with SvelteKit
and Svelte 5. Documents, search, notebooks, and chat all live in one windowed workspace. Chat runs
on bundled local models, or on Ollama or GitHub Models if you'd rather. There is a web version and
a packaged desktop app, and it is single-user, so there is no login.

## Features

### Supported file types

Whatever you add gets chunked, embedded with `nomic-ai/nomic-embed-text-v1.5`, and searched the
same way, no matter what it started as.

- PDF (`.pdf`): text extraction, with OCR for pages that need it
- Word and PowerPoint (`.docx`, `.pptx`): converted to PDF, then read as PDF
- Spreadsheets (`.xlsx`): cell data
- CSV (`.csv`): up to 25 MB
- Text and Markdown (`.txt`, `.md`, `.markdown`): up to 25 MB
- Audio (`.aac`, `.aif`, `.aiff`, `.flac`, `.m4a`, `.mp3`, `.oga`, `.ogg`, `.opus`, `.wav`,
  `.webm`, `.wma`): transcribed, up to 100 MB and 2 hours
- YouTube videos: the video's own captions, imported as a timestamped transcript
- Pasted text, typed straight into the library

### Documents and search

- Add files one at a time, pull them in from a folder, paste text, or import a YouTube video.
- Point it at a folder to sync it and it keeps watching. New and changed files are ingested, and
  deleted ones are dropped.
- Sort, filter, tag, and page through the library, and act on a selection in bulk.
- Documents can be switched active or inactive, which is how you decide what search and chat see.
- Search is semantic, BM25, or hybrid.
- Results link back to the source. PDFs open in a viewer, audio opens in a player that jumps to
  the chunk you clicked, and a YouTube chunk opens the video at the moment it was said.

### Chat

- Streams from a bundled local model, Ollama, or GitHub Models. Local models are downloaded from
  settings.
- Ask against the active documents, or against the sources collected in a notebook.
- The assistant can call tools over several turns: document search, reading a range of chunks,
  corpus details, goal tracking, Python, and the current date and time.
- Tool calls, citations, generated data, and images show up inline while it works.
- A goal checklist tracks multi-part requests, and a context meter shows how much room is left in
  the window before you send.

### Notebooks and workspace

- Notebooks hold Markdown pages, autosaved as you type, with a rendered preview.
- Chat responses, search results, and single chunks can be sent to a notebook, either as a citation
  or as plain text.
- Import Markdown files, or a whole folder as a notebook. Export a page or the whole notebook.
- Pages can be moved between notebooks and reordered, and Ctrl+F searches inside one.
- Windows are arranged in browser-style layout tabs that stick around between sessions.
- Settings is one searchable dialog. Themes cover light, dark, a few accent colors, and high
  contrast.

## Getting Started

### Prerequisites

- Node.js matching [`.nvmrc`](.nvmrc)
- npm
- Ollama or a GitHub Models API key, if you want them. Neither is required, since the bundled local
  runtime can serve chat on its own.

### Install and run

```bash
npm install
npm run dev
```

`npm run dev` syncs the local SQLite schema before Vite starts. The first time you open the app it
downloads the embedding model that semantic and hybrid search need. Chat models come later, on
demand, from settings.

### Desktop app

```bash
npm run electron         # Run the desktop shell against an existing build
npm run electron:pack    # Build and package without an installer
npm run electron:win     # Build the Windows installer
```

The packaged app keeps its database, documents, models, and caches in a per-user data directory
rather than next to the install.

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

Schema changes need `npm run db:generate` and the resulting migration committed. Development syncs
with `drizzle-kit push`, but installed apps replay what is in `drizzle/`, so skipping the migration
ships an out-of-date database.

There is no automated test suite yet. Run the lint, check, and build gates above, then click
through whatever you touched.

## Tech Stack

| Layer               | Technology                                                |
| ------------------- | --------------------------------------------------------- |
| Application         | SvelteKit, Svelte 5 runes, TypeScript                     |
| Desktop             | Electron, adapter-node                                    |
| UI                  | Tailwind CSS 4, shadcn-svelte primitives, bits-ui, Lucide |
| Database            | SQLite/libSQL with Drizzle ORM                            |
| Retrieval           | Transformers.js embeddings, BM25, hybrid search           |
| Document processing | pdf-parse, Tesseract.js, Sharp, LibreOffice               |
| Audio               | FFmpeg, Whisper                                           |
| Model providers     | llama.cpp, Ollama, GitHub Models                          |
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
electron/             Desktop shell: main process, server child entry, app icon
drizzle/              Committed migrations replayed by installed apps
src/
├── lib/
│   ├── actions/          Svelte actions for workspace interactions
│   ├── components/
│   │   ├── app/
│   │   │   ├── chat/     Chat, history, messages, agent traces, and composer
│   │   │   ├── content/  Shared Markdown rendering
│   │   │   ├── dialogs/  Confirmation, progress, API key, and picker dialogs
│   │   │   ├── documents/, notebook/, search/, settings/, transcript/
│   │   │   ├── navigation/  Workspace toolbar, engine heartbeat, and startup overlay
│   │   │   └── workspace/   Layout tabs, window registry, columns, frames, and resizers
│   │   └── ui/           Reusable shadcn-svelte primitives
│   ├── constants/        Endpoints, defaults, and shared limits
│   ├── enums/            Shared string enums
│   ├── services/         Stateless API clients
│   ├── stores/           Singleton Svelte 5 runes stores
│   ├── server/           Database, repositories, ingestion, RAG, providers, tools, and agents
│   ├── types/            Domain and wire types
│   └── utils/            Shared pure utilities
├── routes/               Pages and SvelteKit API endpoints
└── app.css               Tailwind theme tokens and global styles
```

Deployable Knowledge is released under the [MIT License](LICENSE). It bundles third-party
components under their own terms, including copyleft and use-restricted ones; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
