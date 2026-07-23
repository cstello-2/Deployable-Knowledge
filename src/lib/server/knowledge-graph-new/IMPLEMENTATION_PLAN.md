# Knowledge Graph Extraction Implementation Plan

> Backend extraction plan only. Do not connect this work to the UI, RAG retrieval, HippoRAG, or graph visualization yet.

## Goal

Build a trustworthy knowledge graph from the application's existing document chunks.

The graph must contain specific, directed, evidence-backed relationships that remain useful across unfamiliar technical and historical corpora. If extraction only produces generic concepts, co-occurrence, or vague relationships, the result is not sufficiently different from semantic search.

## Fixed model choices

| Role                                         | Model                                  | Runtime                   |
| -------------------------------------------- | -------------------------------------- | ------------------------- |
| Schema-guided entity and relation candidates | `knowledgator/gliner-relex-large-v0.5` | Batched Python subprocess |
| Corpus schema generation                     | `gemma4:12b`                           | Existing Ollama provider  |
| Independent chunk-level triple extraction    | `gemma4:12b`                           | Existing Ollama provider  |
| Verification of GLiNER-only candidates       | `gemma4:12b`                           | Existing Ollama provider  |

Use the exact Ollama tag `gemma4:12b`.

The two extractors remain logically independent. They may run concurrently on a machine with enough memory or sequentially on constrained hardware without changing the acceptance rules.

## What the first experiment established

The first full-document experiment used Gemma 3 1B and GLiNER-Relex base.

- Gemma 3 1B produced entity mentions but zero usable relationships.
- The provisional graph contained 372 relationships.
- Nearly all graph content came from GLiNER.
- Many endpoints were generic nouns such as `patient`, `casualty`, `skin`, and `floor`.
- Several GLiNER relationships were grammatically possible but semantically wrong.
- Extractor agreement metadata was not reliable enough to use as confidence.

The next implementation must therefore improve relationship semantics, retain true extractor independence, and make provenance auditable.

## Non-negotiable constraints

- Reuse `document_chunks`; do not create another chunking pipeline.
- Use the existing SQLite database; do not add a graph database.
- Ensure code is simple, readable, anot overly complex. No test cases, saftety checks, or over engineered functions. 
- Keep orchestration, validation, caching, and persistence in TypeScript.
- Keep GLiNER isolated to one small, replaceable Python subprocess.
- Do not add hard-coded lists of people, organizations, equipment, battles, diseases, technologies, or other corpus-specific names. The General list of 10 is fine.
- Do not create edges from proximity, co-occurrence, or every possible entity pair.
- Store exact source evidence and chunk provenance for every accepted assertion.
- Prefer an empty result to an unsupported relationship.
- Cache every expensive stage so interrupted builds resume.
- Keep failures visible.

## Target flow

```text
Representative corpus sample
            |
            v
Load compact universal and relevant domain ontology seeds
            |
            v
Gemma 4 12B selects, refines, and minimally extends schema
            |
            v
Freeze and cache schema for this build
            |
            v
      Existing document chunk
            |
     +------+------+
     |             |
     v             v
GLiNER-Relex    Gemma 4 12B
schema-guided   open extraction
candidates      with evidence
     |             |
     +------+------+
            |
            v
Reconcile independent assertions
            |
            v
Gemma verifies GLiNER-only candidates
            |
            v
Resolve entities and predicates
            |
            v
Persist accepted assertions and provenance
```

## Stage 1: Filter unusable chunks

Do not send empty text, broken OCR fragments, or formatting-only chunks to either model.

The filter must be conservative. It should reject obvious OCR noise without removing short but meaningful labels, captions, anatomical terms, equipment names, or historical names.

This KG-level guard remains necessary even if ingestion later gains a broader OCR-quality filter because existing databases may already contain noisy chunks.

## Stage 2: Generate the corpus schema from ontology seeds

Use Gemma 4 12B once per corpus build or material corpus revision.

Select a bounded, diverse sample across documents and semantic regions. Do not use only the first or longest chunks.

The LLM must not invent the schema from nothing. Begin with compact catalogs of established semantic types and relationships:

- **Universal catalog:** a small subset of Schema.org-style types and relationships for people, organizations, places, events, documents, systems, components, products, dates, creation, participation, location, and part-whole structure.
- **Technical catalog:** a compact Schema.org/PROV-O-informed subset for systems, components, interfaces, protocols, software, hardware, materials, processes, methods, requirements, and measurements, with relationships such as `part_of`, `implements`, `uses`, `depends_on`, `produces`, `measures`, `complies_with`, and `supersedes`.
- **Medical catalog:** a compact UMLS Semantic Network-derived subset for procedures, anatomical structures, injuries, symptoms, drugs, materials, medical devices, patient groups, treatment, prevention, causation, administration, and contraindication.
- **Historical catalog:** a compact CIDOC CRM-derived subset for people, groups, events, periods, places, objects, documents, creation, participation, ownership, movement, location, and time.
- **Provenance catalog:** a small PROV-O-style subset for attribution, derivation, generation, and use.

These are dictionaries of reusable categories, not dictionaries of actual entity names. Do not bundle full ontology dumps. The initial catalogs should remain small enough to keep directly in `extraction.ts`; move them only if that file becomes genuinely difficult to read.

Gemma acts as an ontology adapter:

1. Select the relevant established types and relationships.
2. Merge overlapping or synonymous categories.
3. Refine descriptions and endpoint constraints for the corpus.
4. Add only genuinely missing corpus-specific categories.
5. Reject vague categories when a specific established relation is available.

Generate a compact schema:

```ts
type EntityType = {
  name: string;
  description: string;
  examples: string[];
  exclusions: string[];
  source: "universal" | "domain" | "llm";
  sourceId: string | null;
};

type RelationType = {
  name: string;
  description: string;
  subjectTypes: string[];
  objectTypes: string[];
  examples: string[];
  counterexamples: string[];
  source: "universal" | "domain" | "llm";
  sourceId: string | null;
};

type CorpusSchema = {
  entityTypes: EntityType[];
  relationTypes: RelationType[];
  sampledChunkIds: string[];
  model: "gemma4:12b";
  promptVersion: string;
};
```

### Schema rules

- Generate reusable types, never names of actual entities.
- Select no more than approximately 15 established entity types and 25 established relationship types.
- Add no more than 5 new corpus-specific entity types and 8 new corpus-specific relationship types.
- Preserve the ontology source identifier when an established category is selected.
- Treat seed catalogs as guidance rather than a closed ontology.
- Give every relationship an explicit direction.
- Include positive examples and counterexamples.
- Merge synonyms and reject vague relationships.
- Avoid `related_to`.
- Avoid broad labels such as `procedure_target` when a specific predicate is possible.
- Freeze the schema for the entire build.
- Promote recurring LLM-only predicates only between builds.

The schema guides GLiNER and helps normalize LLM output. It does not restrict the LLM to a closed ontology.

## Stage 3: Run independent extraction paths

### GLiNER-Relex path

Run `knowledgator/gliner-relex-large-v0.5` with the frozen corpus schema.

GLiNER should return:

- Entity spans and types.
- Directed relation candidates.
- Model scores.
- Exact source offsets.

GLiNER is a high-recall candidate generator. Its relationships are not automatically accepted.

Use one batched Python process per extraction run. Do not reload the model for every chunk.

### Gemma path

Gemma 4 12B independently extracts open-ended entities and assertions from each chunk.

It may use the corpus schema as guidance but must be allowed to produce a more precise new entity type or predicate.

Required assertion fields:

```ts
type ExtractedAssertion = {
  subject: string;
  subjectType: string;
  predicate: string;
  object: string;
  objectType: string;
  evidence: string;
  startDate: string | null;
  endDate: string | null;
  status: "asserted" | "negated" | "uncertain";
};
```

### Structured output

Pass an actual JSON Schema through Ollama's `format` field rather than requesting generic JSON.

Validate:

- Required fields and enums.
- Exact subject and object mentions.
- Exact evidence substring.
- Both endpoints occur in the evidence.
- Subject and object differ.
- Predicate direction is meaningful.
- Empty arrays are permitted.

Do not show GLiNER output to Gemma during independent extraction. Otherwise agreement would not be independent evidence.

## Stage 4: Reconcile and verify

Normalize endpoint text only enough to compare candidate assertions. Do not aggressively merge entities yet.

### Acceptance policy

| Candidate state                  | Action                                           |
| -------------------------------- | ------------------------------------------------ |
| Gemma and GLiNER agree           | Accept with high-confidence agreement provenance |
| Gemma only with valid evidence   | Accept as open-ended discovery                   |
| GLiNER only                      | Send to Gemma semantic verification              |
| GLiNER only and Gemma verifies   | Accept with verified-candidate provenance        |
| Verifier rejects or is uncertain | Reject                                           |
| Evidence is missing or ambiguous | Reject                                           |

Gemma verification must evaluate relationship meaning and direction, not merely whether both endpoint strings occur in the evidence.

Do not label an assertion as extractor agreement unless both raw extraction outputs independently contain the matching assertion.

## Stage 5: Entity and predicate resolution

The graph should contain named entities and stable technical or historical concepts, not every noun phrase.

### Keep

- People, organizations, locations, events, documents, systems, and named methods.
- Stable technical concepts such as devices, procedures, components, materials, and anatomical structures when they support meaningful relationships.
- Historical offices, units, treaties, campaigns, laws, and dated events.

### Reject or demote

- Generic roles such as `patient`, `personnel`, or `casualty` unless the corpus treats them as stable concepts.
- Formatting labels, page numbers, headings, and figure markers.
- Pronouns and transient references.
- Nodes that only participate in vague relationships.

Resolution should:

- Preserve original mentions as aliases.
- Normalize acronyms conservatively.
- Avoid merging same-name historical entities without context.
- Preserve type disagreements for review.
- Normalize predicate synonyms without losing raw wording.

## Stage 6: Cache every expensive stage

Cache keys must include:

- Chunk content hash.
- Corpus signature.
- Schema version.
- Prompt version.
- GLiNER model and thresholds.
- LLM model and generation settings.
- Output contract version.

Cache separately:

1. Corpus schema.
2. Raw GLiNER candidates.
3. Raw Gemma extraction.
4. Verification decisions.
5. Final reconciled result.

Write each successful chunk immediately.

If one chunk fails:

- Continue processing other chunks.
- Report all failures together.
- Preserve successful checkpoints.
- Retry only unfinished stages on the next run.

Changing only the GLiNER model must not invalidate valid Gemma extractions. Changing only the Gemma model must not invalidate valid GLiNER candidates.

## Stage 7: Persist the graph

Continue using SQLite.

Persist:

- Frozen corpus schema.
- Canonical entities and aliases.
- Directed assertions.
- Exact evidence.
- Document and chunk IDs.
- Raw and canonical predicates.
- Dates, negation, and uncertainty.
- Extractor provenance.
- Verification decision.
- Model and prompt versions.

A visible graph edge is a projection over one or more source assertions. Never collapse assertions in a way that loses evidence or disagreement.

## Evaluation before another full build

Do not immediately rerun all 264 chunks.

Create a reviewed set of approximately 30 representative chunks:

- Technical procedures.
- Dense explanatory prose.
- Historical or organizational narrative.
- Tables and captions.
- Acronym-heavy content.
- OCR text.
- Chunks with no valid relationship.

Compare:

1. GLiNER-Relex large alone.
2. Gemma 4 12B alone.
3. Hybrid reconciliation.

Measure:

- Entity precision and recall.
- Relationship precision and recall.
- Direction accuracy.
- Exact evidence rate.
- Unsupported assertion rate.
- Correct empty-result rate.
- Generic-node rate.
- GLiNER-only verification acceptance rate.
- Time and peak memory.
- Retry and resume behavior.

### Initial quality gate

Suggested minimums before a full corpus build:

- At least 90% of accepted assertions are explicitly supported.
- At least 95% direction accuracy.
- At least 98% exact evidence grounding.
- No silent extraction failures.
- Hybrid extraction provides measurable value over Gemma alone.

If the hybrid does not improve precision, recall, or consistency enough to justify its complexity, use Gemma 4 12B alone.

## Minimal implementation changes

Keep the existing file layout:

```text
knowledge-graph-new/
  IMPLEMENTATION_PLAN.md
  extraction.ts
  gliner-extractor.py
  knowledge-graph.ts
  requirements.txt
```

Expected changes:

- `extraction.ts`
  - Expand corpus schema definitions.
  - Add strict JSON Schema output.
  - Keep GLiNER and Gemma extraction independent.
  - Correct provenance and reconciliation.
  - Add targeted GLiNER-only verification.

- `gliner-extractor.py`
  - Pin `knowledgator/gliner-relex-large-v0.5`.
  - Return scores and offsets.
  - Preserve one-process batched inference.

- `knowledge-graph.ts`
  - Version caches independently by stage.
  - Persist accepted assertion provenance.
  - Keep resumable chunk checkpoints.

- Existing provider files
  - Allow an Ollama JSON Schema object, not only `format: "json"`.

Do not add new architecture files unless the existing modules become genuinely unreadable.

## Implementation order

### Phase 1: Model and contract update

- Pin both model identifiers.
- Add strict JSON Schema output for Gemma.
- Return GLiNER scores and offsets.
- Correct extractor provenance.

### Phase 2: Corpus schema generation

- Improve representative sampling.
- Load the compact universal catalog and the relevant medical, historical, technical, or provenance catalogs.
- Have Gemma select and refine established categories before proposing new ones.
- Enforce limits on both selected and newly generated categories.
- Preserve category source provenance.
- Generate definitions, type constraints, examples, and counterexamples.
- Freeze and cache the schema.

### Phase 3: Independent extraction

- Run GLiNER and Gemma independently.
- Cache raw outputs separately.
- Preserve exact evidence.

### Phase 4: Reconciliation

- Match candidate assertions.
- Verify GLiNER-only candidates.
- Reject unsupported or vague relationships.
- Resolve entities and predicates conservatively.

### Phase 5: Small benchmark

- Run the reviewed 30-chunk set.
- Inspect every accepted and rejected relationship.
- Compare GLiNER, Gemma, and hybrid quality.
- Adjust prompts, schema size, and thresholds.

### Phase 6: Full document build

- Run the full document only after the quality gate passes.
- Export raw JSON and a readable Markdown assertion report.
- Inspect entity quality, relation quality, provenance, and graph paths.

## Out of scope

Do not implement yet:

- UI integration.
- Hybrid-search integration.
- HippoRAG.
- PageRank or graph ranking.
- Graph visualization.
- Query-time graph augmentation.
- A separate graph database.

These only become useful after extraction quality is demonstrated.

## References

- GLiNER-Relex model: <https://huggingface.co/knowledgator/gliner-relex-large-v0.5>
- Gemma 4 model card: <https://ai.google.dev/gemma/docs/core/model_card_4>
- Ollama Gemma 4 tags: <https://ollama.com/library/gemma4>
- Ollama structured outputs: <https://docs.ollama.com/capabilities/structured-outputs>
- Schema.org schemas: <https://schema.org/docs/schemas.html>
- UMLS Semantic Network: <https://www.nlm.nih.gov/research/umls/knowledge_sources/semantic_network/index.html>
- CIDOC CRM classes and properties: <https://cidoc-crm.org/cidoc-crm/>
- W3C PROV-O: <https://www.w3.org/TR/prov-o/>
