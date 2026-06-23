# Chunk / Embed TS Handoff

## What this work does

This branch adds a Typescript chunking + embedding flow for PDF text.

Main behavior:
- coverage-preserving semantic chunking
- post-processing for dedupe / table handling / fallback coverage
- chunk embeddings stored in SQLite via Drizzle
- `documents` and `document_chunks` tables used for storage

## Main files

Core chunking:
- [src/lib/server/providers/parse_pipeline/chunker-semantic.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/chunker-semantic.ts)
- [src/lib/server/providers/parse_pipeline/chunk-postprocess.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/chunk-postprocess.ts)
- [src/lib/server/providers/parse_pipeline/text-extract.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/text-extract.ts)

Embedding / DB storage:
- [src/lib/server/rag/embedding-model.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/rag/embedding-model.ts)
- [src/lib/server/rag/embedding.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/rag/embedding.ts)
- [src/lib/server/database/schema.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/database/schema.ts)
- [src/lib/server/database/database.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/database/database.ts)

Test / analysis:
- [src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts)
- [output/jupyter-notebook/compare-chunking-outputs.ipynb](/Users/matthewplambeck/Desktop/Deployable-Knowledge/output/jupyter-notebook/compare-chunking-outputs.ipynb)

Migration files:
- [drizzle/0000_strange_saracen.sql](/Users/matthewplambeck/Desktop/Deployable-Knowledge/drizzle/0000_strange_saracen.sql)
- [drizzle/0001_overconfident_excalibur.sql](/Users/matthewplambeck/Desktop/Deployable-Knowledge/drizzle/0001_overconfident_excalibur.sql)
- [drizzle/0002_woozy_justice.sql](/Users/matthewplambeck/Desktop/Deployable-Knowledge/drizzle/0002_woozy_justice.sql)
- [drizzle/meta/_journal.json](/Users/matthewplambeck/Desktop/Deployable-Knowledge/drizzle/meta/_journal.json)

## Required DB tables

The chunk/embed flow writes to:
- `documents`
- `document_chunks`

`document_chunks` stores:
- chunk text
- metadata JSON text
- embedding BLOB
- embedding model name

## First-time setup

Run from:

```bash
cd /Users/matthewplambeck/Desktop/Deployable-Knowledge
```

Install JS deps:

```bash
npm install
```

## Rebuild DB from scratch

If starting clean:

```bash
rm -f app.db
```

Preferred migration command:

```bash
npm run db:migrate
```

If `drizzle-kit migrate` hangs or does not create tables, apply the SQL files directly:

```bash
python3 - <<'PY'
import sqlite3
from pathlib import Path

conn = sqlite3.connect("app.db")
for path in [
    Path("drizzle/0000_strange_saracen.sql"),
    Path("drizzle/0001_overconfident_excalibur.sql"),
    Path("drizzle/0002_woozy_justice.sql"),
]:
    conn.executescript(path.read_text())
conn.commit()
print("Applied migrations manually.")
PY
```

Quick DB check:

```bash
python3 - <<'PY'
import sqlite3
conn = sqlite3.connect("app.db")
for row in conn.execute("select name from sqlite_master where type='table' order by name"):
    print(row[0])
PY
```

Expected chunk tables:
- `documents`
- `document_chunks`

## Run chunking test

Allow model download on first run:

```bash
SEMANTIC_EMBED_ALLOW_REMOTE=1 \
CHUNK_OUTPUT_PATH=/Users/matthewplambeck/Desktop/Deployable-Knowledge/outputs-test/chunker-semantic.json \
node --import tsx/esm src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts
```

Expected result:
- writes `outputs-test/chunker-semantic.json`
- writes `outputs-test/chunker-semantic-raw.json`
- current handbook run should be about `223` final chunks

## Run end-to-end ingest test

This tests:
- extract
- semantic chunk
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

const pdfPath = '/Users/matthewplambeck/Desktop/Deployable-Knowledge/documents/17-13-tactical-casualty-combat-care-handbook-v5-may-17-distro-a.pdf';
const source = { title: basename(pdfPath), type: 'PDF', path: pdfPath };

const pages = await TextExtract(source);
const semanticChunks = await chunkPages(pages, { minWords: 3, overlapSentences: 1 });
const chunks = postprocessChunks(pages, semanticChunks, { filterChunks: true, minWords: 5 });
const result = await storeDocumentChunks(chunks);

console.log(JSON.stringify(result, null, 2));
"
```

Expected result shape:

```json
{
  "documentId": "...",
  "chunkCount": 223,
  "embeddingModel": "Xenova/all-MiniLM-L6-v2"
}
```

## Verify rows were inserted

```bash
python3 - <<'PY'
import sqlite3
conn = sqlite3.connect("app.db")
print("documents", conn.execute("select count(*) from documents").fetchone()[0])
print("document_chunks", conn.execute("select count(*) from document_chunks").fetchone()[0])
PY
```

## Embedding model notes

Current default model:
- `Xenova/all-MiniLM-L6-v2`

Current behavior:
- local cache path is under `tmp_model/transformersjs`
- remote download is blocked unless:

```bash
SEMANTIC_EMBED_ALLOW_REMOTE=1
```

Use that env var on first run if the model is not cached yet.

## Important pass-off notes

- `schema.ts` must stay in sync with the Drizzle SQL migrations.
- If `embedding.ts` throws `does not provide an export named 'document_chunks'`, check [schema.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/database/schema.ts).
- If ingest throws `no such table: documents`, the DB was not migrated correctly.
- The chunk/embed flow depends on:
  - `documents/17-13-tactical-casualty-combat-care-handbook-v5-may-17-distro-a.pdf`
  - JS dependencies being installed
  - model access or a warm local cache

## Files most likely needed in a pass-off commit

- `.gitignore`
- `package.json`
- `package-lock.json`
- `drizzle.config.ts`
- `drizzle/0000_strange_saracen.sql`
- `drizzle/0001_overconfident_excalibur.sql`
- `drizzle/0002_woozy_justice.sql`
- `drizzle/meta/_journal.json`
- `drizzle/meta/0000_snapshot.json`
- `src/lib/server/database/schema.ts`
- `src/lib/server/database/database.ts`
- `src/lib/server/providers/parse_pipeline/chunk-postprocess.ts`
- `src/lib/server/providers/parse_pipeline/chunker-semantic.ts`
- `src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts`
- `src/lib/server/providers/parse_pipeline/chunker-test.ts`
- `src/lib/server/providers/parse_pipeline/chunker.ts`
- `src/lib/server/providers/parse_pipeline/text-extract.ts`
- `src/lib/server/rag/embedding-model.ts`
- `src/lib/server/rag/embedding.ts`
- `output/jupyter-notebook/compare-chunking-outputs.ipynb`

Optional artifacts:
- `outputs-test/*`

