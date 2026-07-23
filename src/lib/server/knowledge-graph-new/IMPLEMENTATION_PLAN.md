# Knowledge Graph Extraction Implementation Plan

> Backend extraction only. Do not connect this to the UI, RAG, HippoRAG,
> ranking, or graph visualization yet.

## Goal

Build a trustworthy knowledge graph from the existing `document_chunks`.

The graph must contain specific, directed, evidence-backed relationships that
remain useful on unfamiliar technical and historical corpora. Generic concepts,
co-occurrence, and vague edges are not enough.

## Models

| Role                     | Model                                  | Runtime                    |
| ------------------------ | -------------------------------------- | -------------------------- |
| Schema-guided candidates | `knowledgator/gliner-relex-large-v0.5` | One batched Python process |
| Schema generation        | `gemma4:12b`                           | Existing Ollama provider   |
| Open triple extraction   | `gemma4:12b`                           | Existing Ollama provider   |
| Candidate verification   | `gemma4:12b`                           | Existing Ollama provider   |

Use the exact Ollama tag `gemma4:12b`.

### Portable runtime

Do not hard-code a developer's Python or model path. Resolve Python in this
order:

1. `KNOWLEDGE_GRAPH_PYTHON`
2. `PYTHON`
3. Project-local `.venv`
4. The platform's normal `python3` or `python`

The target laptop creates its own `.venv`, installs `requirements.txt`, installs
the Node dependencies, and pulls the Ollama model. Caches and model downloads
remain local to that laptop.

## Implementation requirements

- Reuse `document_chunks`; do not create another chunker.
- Keep SQLite; do not add a graph database.
- Keep orchestration, validation, caching, and persistence in TypeScript.
- Keep GLiNER in one small Python subprocess.
- Do not create edges from proximity or co-occurrence.
- Store evidence and chunk provenance for every accepted assertion.
- Prefer an empty result to an unsupported relationship.
- Cache successful work so interrupted builds resume.
- Keep failures visible.

### Simplification is required

The new flow must replace the old flow, not sit beside it.

- Delete old prompts, model settings, fallback extraction, unused types, unused
  helpers, duplicate validation, and obsolete persistence code.
- Do not retain the old implementation behind a flag or compatibility wrapper.
- Do not add service layers, registries, repositories, plugin systems, or generic
  abstractions.
- Prefer direct functions to abstractions with one caller.
- Every remaining function must be used by the final runtime path.
- Keep only essential checks: invalid model output, missing evidence, model
  failure, and cache persistence.
- Do not add test files or a test framework. Use the reviewed benchmark plus the
  existing type and formatting checks.

The implementation is not complete until a deletion pass confirms there is one
obvious path:

1. Load chunks and schema.
2. Run both extractors.
3. Ground, reconcile, and verify assertions.
4. Resolve entities.
5. Save the graph.

## Flow

```text
Representative sample of existing chunks
                |
                v
Load useful terms from one ontology library
                |
                v
Gemma selects terms and creates missing corpus categories
                |
                v
Freeze and cache compact schema
                |
                v
        Existing usable chunk
                |
        +-------+-------+
        |               |
        v               v
 GLiNER-Relex      Gemma 4 12B
 schema-guided     open extraction
 candidates        with exact evidence
        |               |
        +-------+-------+
                |
                v
Ground, compare, and verify assertions
                |
                v
Resolve entities and predicates
                |
                v
Persist graph and provenance
```

Schema generation happens once. After the schema is frozen, GLiNER and Gemma
extract independently. They may run concurrently or sequentially without
changing the acceptance rules.

## 1. Ontology seeds

Use the small N3 package to parse the official Schema.org and PROV-O Turtle
vocabularies. The initial `schema-org-adapter` experiment was removed because
its transitive JSON-LD stack failed under the project's Node runtime. RDF-Ext
also worked, but its umbrella dependency tree was unnecessary for two Turtle
files.

The ontology loader must only:

- Load a local or official vocabulary artifact.
- Return named classes and relationships with useful descriptions.
- Return domain/range constraints when present.
- Reduce the vocabulary to a bounded candidate set for Gemma.

Do not build an ontology framework. Do not send an entire ontology to Gemma.
Add specialized technical, historical, or medical sources only when the sampled
corpus needs them and their licensing permits local use.

### Universal fallback

These ten general entity types may remain directly in `extraction.ts`:

1. `person`
2. `organization`
3. `location`
4. `event`
5. `document`
6. `date`
7. `system`
8. `component`
9. `process`
10. `object`

They are categories, not dictionaries of entity names. Use them when ontology
packages are unavailable, unreliable, or not measurably useful.

## 2. Corpus schema

Select a bounded, diverse sample across documents and semantic regions.

Gemma receives the sample, the ten universal types, and a small set of
package-derived terms. It then:

1. Selects relevant established types and relationships.
2. Merges synonyms.
3. Adds genuinely missing corpus-specific categories.
4. Gives every relation a clear subject-to-object direction.
5. Rejects vague relations such as `related_to`.

Keep approximately 10-15 entity types and 10-20 relation types. Every type needs
a name, description, and source. Relations also need allowed subject and object
types.

Freeze the schema for the build. Gemma may still discover out-of-schema types
and predicates during extraction, but they are reviewed and promoted only in a
later build.

## 3. Input filter

Reject only empty text, formatting-only content, and broken OCR fragments with
no meaningful language.

Preserve short but meaningful captions, labels, equipment terms, names, and
historical references. Keep this KG-level guard because existing databases may
already contain noisy chunks.

## 4. Independent extraction

### GLiNER-Relex

Load `knowledgator/gliner-relex-large-v0.5` once and process chunks in batches.
Pin the GLiNER library to the commit in `requirements.txt`; the PyPI 0.2.27
release does not contain the joint relation-extraction `inference()` API.

Pass GLiNER:

- Entity names only.
- Relation names only.
- Optionally the special `other` entity type.

The selected model's pinned GLiNER API does not consume the descriptions or
subject/object constraints. Use those during Gemma extraction and validation.

Capture relation scores, head/tail offsets, and the entity, adjacency, and
relation thresholds used. Benchmark `other` both enabled and disabled.

GLiNER supplies endpoint offsets, not exact relation evidence. Derive the
smallest reasonable sentence or text window containing both endpoints and
retain the original offsets.

### Gemma

Gemma independently extracts open-ended assertions from the same chunk.

- The corpus schema is guidance, not a closed list.
- Do not show Gemma GLiNER's candidates during initial extraction.
- Use an actual JSON Schema through Ollama's `format` field.
- Require subject, type, directed predicate, object, type, exact evidence,
  dates, and asserted/negated/uncertain status.
- Both endpoints must appear in the evidence.
- Permit an empty result.

## 5. Reconciliation and verification

Before another model call, reject candidates when:

- Required fields are missing.
- Subject and object are identical.
- Evidence does not belong to the chunk.
- Both endpoints are not in the evidence window.
- Direction is meaningless.
- Schema endpoint constraints are violated.

Normalize only enough to compare candidates. Do not merge entities yet.

| Candidate                                  | Action                           |
| ------------------------------------------ | -------------------------------- |
| Both extractors agree and grounding passes | Accept with agreement provenance |
| Gemma only                                 | Send to strict verification      |
| GLiNER only                                | Send to strict verification      |
| Single-extractor candidate verifies        | Accept with verified provenance  |
| Verifier rejects or is uncertain           | Reject                           |
| Grounding fails                            | Reject                           |

Batch all single-extractor candidates for a chunk into one verification call.
The verifier receives only the chunk, candidates, and evidence—not the original
response or reasoning.

Gemma verifying a Gemma-only assertion is a consistency check, not independent
agreement. Record it accurately. Remove Gemma-only verification after the
benchmark if it does not measurably improve quality.

## 6. Entity resolution

Keep named entities and stable technical or historical concepts that participate
in meaningful relationships.

Reject formatting labels, page numbers, pronouns, transient references, and
generic roles unless the corpus treats them as stable concepts. Reject nodes
connected only by vague relationships.

Preserve original mentions as aliases. Normalize acronyms conservatively. Do not
merge same-name historical entities without sufficient context.

## 7. Cache and persistence

Cache the schema, raw GLiNER result, raw Gemma result, and final
reconciled/verified assertions. The final result already records verification,
so a separate verification cache is unnecessary.

Use one simple cache table—or the existing cache table—with a stage and hashed
input key. Do not create a table or class for every stage. Keys include content,
schema, model, prompt/contract, and relevant threshold versions. Changing one
extractor must not invalidate the other extractor's valid output.

Persist the build schema and assertions. Derive the entity list and aliases from
those assertions when the graph is loaded instead of maintaining a duplicate
entity table.

Each assertion retains:

- Canonical endpoints and original endpoint mentions.
- Directed assertions and raw predicates.
- Exact Gemma evidence or derived GLiNER evidence windows.
- Entity offsets and document/chunk IDs.
- Dates, negation, and uncertainty.
- Extractor and verifier provenance per assertion, plus schema, model, and
  contract versions at build level.

Never collapse assertions in a way that loses evidence or disagreement.

## Evaluation gate

Review approximately 30 representative chunks before a full build:

Use the build's `chunkLimit: 30` option; it samples across the selected
documents and uses the same resumable caches as a full run.

- Technical procedures and dense prose.
- Historical or organizational narrative.
- Tables, captions, acronyms, and OCR text.
- Chunks with no valid relationship.

Compare:

1. GLiNER alone.
2. Gemma alone.
3. Reconciled hybrid.
4. GLiNER with and without `other`.
5. Package-derived ontology seeds versus the universal fallback.

Measure entity and relationship precision/recall, direction accuracy, evidence
grounding, unsupported assertions, correct empty results, generic nodes,
verification acceptance, runtime, memory, and resume behavior.

Suggested full-build gate:

- At least 90% of accepted assertions are explicitly supported.
- At least 95% direction accuracy.
- At least 98% valid evidence grounding.
- No silent failures.
- Hybrid extraction measurably improves on Gemma alone.
- Ontology dependencies measurably improve extraction quality.

Delete GLiNER, ontology-package code, or extra verification if its value does not
justify its complexity.

## Files

```text
knowledge-graph-new/
  IMPLEMENTATION_PLAN.md
  extraction.ts
  gliner-extractor.py
  knowledge-graph.ts
  requirements.txt
```

- `extraction.ts`: schema, model calls, validation, reconciliation.
- `gliner-extractor.py`: model loading and batched inference only.
- `knowledge-graph.ts`: chunks, cache, resolution, persistence.

Do not add another backend file unless these remain unreadable after obsolete
code is removed.

## Implementation order

1. **Delete first:** remove the old model path, prompts, fallbacks, duplicate
   types, dead helpers, and unused persistence.
2. **Ontology loading:** load bounded Schema.org and PROV-O terms with N3.
3. **Model contracts:** pin models, add strict Gemma output, and return GLiNER
   scores, thresholds, and offsets.
4. **Extraction:** generate the schema, run both extractors, ground, reconcile,
   verify, resolve, cache, and persist.
5. **Benchmark:** compare extractors, `other`, verification, and ontology seeds.
6. **Final deletion pass:** remove experiments and components that did not earn
   their complexity; confirm there is only one extraction path.
7. **Full build:** run type/format checks, then build the full document and
   export raw JSON plus a readable Markdown assertion report.

## Out of scope

- UI or search integration.
- HippoRAG or query-time graph augmentation.
- Graph ranking or visualization.
- A separate graph database.

## References

- GLiNER-Relex:
  <https://huggingface.co/knowledgator/gliner-relex-large-v0.5>
- Gemma 4: <https://ai.google.dev/gemma/docs/core/model_card_4>
- Ollama structured outputs:
  <https://docs.ollama.com/capabilities/structured-outputs>
- Schema.org vocabulary: <https://schema.org/docs/developers.html>
- PROV-O: <https://www.w3.org/TR/prov-o/>
- N3: <https://github.com/rdfjs/N3.js>
