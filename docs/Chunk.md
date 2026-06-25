# Chunk Handoff

This file is for pass-off and testing.

Use [Chunk-Logic.md](/Users/matthewplambeck/Desktop/Deployable-Knowledge/docs/Chunk-Logic.md:1) for the deeper logic and design notes.

## What This Pipeline Produces

- page-aware PDF extraction
- semantic chunking in TypeScript
- final postprocessed chunks for RAG
- embeddings stored in SQLite via Drizzle
- chunk storage in `documents` and `document_chunks`

## Main Files

Chunking:
- [src/lib/server/providers/parse_pipeline/text-extract.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/text-extract.ts)
- [src/lib/server/providers/parse_pipeline/chunker-semantic.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/chunker-semantic.ts)
- [src/lib/server/providers/parse_pipeline/chunk-postprocess.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/chunk-postprocess.ts)

Embedding and DB storage:
- [src/lib/server/rag/embedding-model.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/rag/embedding-model.ts)
- [src/lib/server/rag/embedding.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/rag/embedding.ts)
- [src/lib/server/database/schema.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/database/schema.ts)
- [src/lib/server/database/database.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/database/database.ts)

Testing:
- [src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts)

## Final Outputs To Know

- `chunker-semantic-raw.json`
  - pre-postprocessing chunk output
  - notebook label: `semantic_raw`

- `chunker-semantic.json`
  - final postprocessed chunk output
  - notebook label: `semantic_ts`
  - this is the version intended for embedding and DB storage
  - json file created wherever `CHUNK_OUTPUT_PATH` points

## Required Tables

The chunk/embed path writes to:

- `documents`
- `document_chunks`

## First-Time Setup

Run from:

```bash
cd /Users/matthewplambeck/Desktop/Deployable-Knowledge
```

Install JS deps:

```bash
npm install
```

## Rebuild DB From Scratch

If starting clean:

```bash
rm -f app.db
```

Preferred schema command:

```bash
npm run db:push
```

Quick DB check:

```bash
/opt/homebrew/Caskroom/miniforge/base/envs/Python-DS/bin/python - <<'PY'
import sqlite3
conn = sqlite3.connect("app.db")
for row in conn.execute("select name from sqlite_master where type='table' order by name"):
    print(row[0])
PY
```

Expected chunk tables:

- `documents`
- `document_chunks`

## Run Chunking Test

Use this to regenerate both test JSON files.

```bash
SEMANTIC_EMBED_ALLOW_REMOTE=1 \
CHUNK_OUTPUT_PATH=/tmp/chunker-semantic.json \
node --import tsx/esm src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts /path/to/file.pdf
```


## Run End-to-End Ingest Test

This runs:

- extract
- chunk
- postprocess
- embed
- insert into DB

```bash
SEMANTIC_EMBED_ALLOW_REMOTE=1 \
node --import tsx/esm -e "
import { basename } from 'node:path';
import { TextExtract } from './src/lib/server/providers/parse_pipeline/text-extract.ts';
import { chunkPages } from './src/lib/server/providers/parse_pipeline/chunker-semantic.ts';
import { postprocessChunks } from './src/lib/server/providers/parse_pipeline/chunk-postprocess.ts';
import { storeDocumentChunks } from './src/lib/server/rag/embedding.ts';

const pdfPath = '/path/to/file.pdf';
const source = { title: basename(pdfPath), type: 'PDF', path: pdfPath };

const pages = await TextExtract(source);
const semanticChunks = await chunkPages(pages, { minWords: 3, overlapSentences: 1 });
const chunks = postprocessChunks(pages, semanticChunks, { filterChunks: true, minWords: 5 });
const result = await storeDocumentChunks(chunks);

console.log(JSON.stringify(result, null, 2));
"
```

Expected result shape For TCCC PDF:

```json
{
  "documentId": "...",
  "chunkCount": 218,
  "embeddingModel": "Xenova/all-MiniLM-L6-v2"
}
```

## Verify DB Rows

```bash
/opt/homebrew/Caskroom/miniforge/base/envs/Python-DS/bin/python - <<'PY'
import sqlite3
conn = sqlite3.connect("app.db")
print("documents", conn.execute("select count(*) from documents").fetchone()[0])
print("document_chunks", conn.execute("select count(*) from document_chunks").fetchone()[0])
PY
```

Expected:

- `documents` should increase or stay at `1` for the same source path
- `document_chunks` should match the final chunk count for that document


## Files To Need For Pass Off Comit

- `package.json`
- `package-lock.json`
- `src/lib/server/database/schema.ts`
- `src/lib/server/database/database.ts`
- `src/lib/server/providers/parse_pipeline/text-extract.ts`
- `src/lib/server/providers/parse_pipeline/chunker-semantic.ts`
- `src/lib/server/providers/parse_pipeline/chunk-postprocess.ts`
- `src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts`
- `src/lib/server/rag/embedding-model.ts`
- `src/lib/server/rag/embedding.ts`
- `docs/Chunk.md`
- `docs/Chunk-Logic.md`
