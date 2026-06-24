# Chunk Handoff

This file is for pass-off and testing.

Use [Chunk-Logic.md](/Users/matthewplambeck/Desktop/Deployable-Knowledge/Chunk-Logic.md:1) for the deeper logic and design notes.

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

Testing and analysis:
- [src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts)
- [output/jupyter-notebook/compare-chunking-outputs.ipynb](/Users/matthewplambeck/Desktop/Deployable-Knowledge/output/jupyter-notebook/compare-chunking-outputs.ipynb)

Migrations:
- [drizzle/0000_strange_saracen.sql](/Users/matthewplambeck/Desktop/Deployable-Knowledge/drizzle/0000_strange_saracen.sql)
- [drizzle/0001_overconfident_excalibur.sql](/Users/matthewplambeck/Desktop/Deployable-Knowledge/drizzle/0001_overconfident_excalibur.sql)
- [drizzle/0002_woozy_justice.sql](/Users/matthewplambeck/Desktop/Deployable-Knowledge/drizzle/0002_woozy_justice.sql)
- [drizzle/meta/_journal.json](/Users/matthewplambeck/Desktop/Deployable-Knowledge/drizzle/meta/_journal.json)

## Final Outputs To Know

- `outputs-test/chunker-semantic-raw.json`
  - pre-postprocessing chunk output
  - notebook label: `semantic_raw`

- `outputs-test/chunker-semantic.json`
  - final postprocessed chunk output
  - notebook label: `semantic_ts`
  - this is the version intended for embedding and DB storage
  - json file created for testing and examination 

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

Preferred migration command:

```bash
npm run db:migrate
```

If that hangs or does not create the chunk tables, apply SQL directly:

```bash
/opt/homebrew/Caskroom/miniforge/base/envs/Python-DS/bin/python - <<'PY'
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
CHUNK_OUTPUT_PATH=/Users/matthewplambeck/Desktop/Deployable-Knowledge/outputs-test/chunker-semantic.json \
node --import tsx/esm src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts
```

Expected outputs:

- `outputs-test/chunker-semantic-raw.json`
- `outputs-test/chunker-semantic.json`

Current handbook test shape:

- about `218` raw chunks
- about `218` final chunks

Important:

- first run may need `SEMANTIC_EMBED_ALLOW_REMOTE=1`
- later runs can use the local model cache if already warm

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

## Notebook Use

Notebook:
- [output/jupyter-notebook/compare-chunking-outputs.ipynb](/Users/matthewplambeck/Desktop/Deployable-Knowledge/output/jupyter-notebook/compare-chunking-outputs.ipynb)

Use it for:

- chunk-size distribution checks
- source coverage checks
- spot-checking individual pages
- comparing `semantic_raw` vs `semantic_ts`

Dataset meanings:

- `cleaned_source`
  - cleaned extracted page text baseline
- `semantic_raw`
  - pre-postprocessing output
- `semantic_ts`
  - final postprocessed output intended for RAG
- `python_legacy`
  - reference only

If the notebook kernel cannot find `node`, the setup cell now points to `/opt/homebrew/bin/node` first.

## Current Verification Notes

On the current handbook test:

- `semantic_raw` keeps `100%` of unique source words
- `semantic_ts` also keeps `100%` of unique source words
- final chunk count is currently about `218`
- page `127` is present in the final output

Remaining final drops are mainly all-caps figure-label pages because of the final all-caps filter.

## Common Failure Modes

- `Error: local_files_only=true ... file was not found locally`
  - the embedding model is not cached locally and remote download is disabled
  - run once with `SEMANTIC_EMBED_ALLOW_REMOTE=1`

- `no such table: documents`
  - migrations were not applied correctly

- `does not provide an export named 'document_chunks'`
  - schema/export mismatch in [schema.ts](/Users/matthewplambeck/Desktop/Deployable-Knowledge/src/lib/server/database/schema.ts)

- notebook `FileNotFoundError` for `node`
  - notebook kernel PATH did not include Node
  - the notebook now uses `/opt/homebrew/bin/node` first

## Files To Need For Pass Off Comit

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
- `src/lib/server/providers/parse_pipeline/text-extract.ts`
- `src/lib/server/providers/parse_pipeline/chunker-semantic.ts`
- `src/lib/server/providers/parse_pipeline/chunk-postprocess.ts`
- `src/lib/server/providers/parse_pipeline/chunker-semantic-test.ts`
- `src/lib/server/rag/embedding-model.ts`
- `src/lib/server/rag/embedding.ts`
- `Chunk.md`
- `Chunk-Logic.md`
- `output/jupyter-notebook/compare-chunking-outputs.ipynb`

Optional artifacts:

- `outputs-test/*`
