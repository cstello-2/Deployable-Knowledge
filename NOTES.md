# Personal Notes 


## Clean Up

Done:
- Removed extra md files, should add back chunker logic file and maybe search logic when done. 
- Reverted DOCS to cstello-2/Deployable-Knowledge - selvte rewrite

Reviewer feedback to address:
- "Misorganization, duplicated functions, unnecessary code, and overcomplicated in a way thats not very parse-able."
- Goal is not a broad rewrite. Goal is to make the codebase easier to review by removing dead/prototype code, grouping related code, and simplifying the unclear pieces we actually need.

Current cleanup boundaries:
- Do not touch `docs/` for now.
- Use `NOTES.md` for planning and recall.
- Keep active code TypeScript/Svelte; do not bring back Python pipeline files.
- Remove debug-only routes and harnesses from this pass-off version.

Proposed cleanup order:

1. Finish file organization.
   - Parse/chunk files should live under `src/lib/server/rag/parse/`.
   - Provider files should only be provider adapters/registry code.
   - RAG files should be retrieval, ingest, embedding, and parse support.
   - After moves, scan for stale imports and old folder names.

2. Remove obvious dead/prototype code.
   - Remove old `src/lib/server/providers/parse_pipeline/chunker.ts` if nothing imports it.
   - Removed `src/lib/server/rag/vectorSearch.ts`; it was only the old Voy prototype.
   - Remove commented-out auth/password code in `src/lib/server/auth/utils.ts` unless it is actively used.
   - Remove stray commented debug logs and TODOs that do not describe real future work.

3. Reduce duplication in RAG types and retrieval code.
   - `bm25.ts`, `bm25-search.ts`, `hybrid-search.ts`, and `mathRerank.ts` each define overlapping document/result shapes.
   - Create one small shared type module only if it reduces repeated local interfaces.
   - Keep the simpler path: do not build a large abstraction layer just to make types look unified.

4. Simplify noisy runtime logging.
   - Removed old startup `bm25.ts`; live BM25 search is DB-backed through `rag/search/bm25-search.ts`.
   - Keep errors useful, but remove routine startup chatter unless it is needed for debugging.
   - Removed `semantic-search-harness.ts` and the `search:semantic` package script for this pass-off version.

5. Review `chunker-semantic.ts` for readability without breaking coverage.
   - Keep coverage-first behavior.
   - Keep regex where it is the clearest way to handle OCR/PDF noise.
   - Prefer naming and grouping improvements over clever rewrites.
   - Avoid one-line helper sprawl.
   - Do not add corpus-specific cleanup rules.

6. Keep only the live app retrieval path.
   - Live chat should call `src/lib/server/rag/search/retrieve-rag-context.ts`.
   - Removed `/rag/debug` from this pass-off version.
   - Do not mix debug-only scoring displays into the main chat flow.

7. Verify after each small cleanup.
   - Run `npm run check`.
   - Run `npm run build` after larger moves/removals.
   - If chunking behavior changes, do a focused ingest/chunk validation before continuing.

Likely first implementation pass:
- Confirm old parse folder is fully removed/staged as a move.
- Remove search timing/debug fields from live retrieval results.
- Convert raw SQL in `rag/search/*` and `routes/(app)/documents/list/+server.ts` to Drizzle query builder usage.
- Remove unnecessary `.ts` suffixes from local imports as a small consistency cleanup.
- Run `npm run check` and `npm run build`.

Search/debug cleanup already done:
- Moved live search files into `src/lib/server/rag/search/`.
- Removed `src/routes/(app)/rag/debug/+server.ts`.
- Removed `src/lib/server/rag/semantic-search-harness.ts`.
- Removed `src/lib/server/rag/vectorSearch.ts`.
- Removed old startup `src/lib/server/rag/bm25.ts` and its hook import.
- Removed unused `voy-search` and `@xenova/transformers` package dependencies.

Deferred for later:
- Chat retrieval mode UI/plumbing can stay for now.
- `DocumentFilePickerPopup.svelte` can stay for now even though it looks unused/half-disabled.
- `auth/utils.ts` commented auth/password cleanup can wait.
- README and `docs/` stay untouched for now.
