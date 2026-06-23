// CURRENTLY NO CHANGES FROM chunker.ts

// CHANGES NEEDED: Base chunks off page rank, follow core logic of pyhton version


// ----------------------------
// Typescript file for chunking extracted PDF/document text 
// ----------------------------

// Imports
import { createHash } from "node:crypto"; 
import { env, pipeline } from "@huggingface/transformers";
//Used for creating deterministic indexes to be used as primary keys in SQL database.
// Also prevents duplicate ids if document is reuploaded. 
import type { Chunk as ExtractedChunk, ChunkType, Source } from "./text-extract";


//Chunk Metadata (Start & End charecters, word & sentence counts)
export type ChunkMetadata = {
  startChar: number;
  endChar: number;
  wordCount: number;
  sentenceCount: number;
};

// chunker.ts output. Stores each chunk as one retrival record. 
export type ChunkRecord = {
  chunkId: string;  
  chunkType: ChunkType;
  source: Source;
  pageIndex: number;
  chunkIndex: number; 
  content: string;
  metadata: ChunkMetadata;
};


// Optional rules for chunking. Can set min/max charecters per chunk, allowed sentence overlap, keep/remove repeated lines
export type ChunkerOptions = {
  maxChars?: number;
  minWords?: number;
  overlapSentences?: number;
  removeRepeatedLines?: boolean;
  repeatedLineThreshold?: number;
};

// Deterministic ChunkOptions default settings
//Kept simple for testing purposes 
const DEFAULT_OPTIONS: Required<ChunkerOptions> = {
  maxChars: 1200,
  minWords: 5,
  overlapSentences: 1,
  removeRepeatedLines: true,
  repeatedLineThreshold: 0.9,
};

type SentenceSpan = {
  text: string;
  start: number;
  end: number;};

// Small defaults for semantic grouping
// Notes: EXPANSION_THRESHOLD started at 0.5, tried 0.4, trying 0.35, trying 0.45
const SIM_THRESHOLD = 0.5;
const EXPANSION_THRESHOLD = 0.40;
const PAGERANK_TOP_K = 5;
const PAGERANK_DAMPING = 0.85;
const PAGERANK_ITERATIONS = 30;
const PAGERANK_TOLERANCE = 1e-6;
const EMBEDDING_MODEL =
  process.env.SEMANTIC_EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DTYPE = process.env.SEMANTIC_EMBED_DTYPE ?? "q8";
const EMBEDDING_BATCH_SIZE = Number(process.env.SEMANTIC_EMBED_BATCH_SIZE ?? "32");
const ALLOW_REMOTE_MODELS = process.env.SEMANTIC_EMBED_ALLOW_REMOTE === "1";

env.cacheDir = "/Users/matthewplambeck/Desktop/Deployable-Knowledge/tmp_model/transformersjs";
env.allowRemoteModels = ALLOW_REMOTE_MODELS;

// Normalize all line endings & repeated spaces 
function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();}

// Helper function to track word counts
function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

// Rollover from python pipeline to remove very small chunks
function shouldKeepChunk(text: string, minWords: number): boolean {
  return wordCount(text) >= minWords;
}

//Small hard rule set to prevent broken sentence splitting. Can add to this list. 
// Attempts to prevent: "Dr. Evil" -> ["Dr.", "Evil"]
const PROTECTED_ABBREVIATIONS = new Set([
  "dr.",
  "mr.",
  "mrs.",
  "ms.",
  "prof.",
  "lt.",
  "col.",
  "capt.",
  "maj.",
  "gen.",
  "sgt.",
  "cpl.",
  "pfc.",
  "spc.",
]);

// Small helper to prevent obvious false sentence splits
function shouldSplitAtPeriod(text: string, index: number): boolean {
  const prevChar = text[index - 1] ?? "";
  const nextChar = text[index + 1] ?? "";

  if (/\d/.test(prevChar) && /\d/.test(nextChar)) {
    return false;
  }

  const tokenStart =
    Math.max(text.lastIndexOf(" ", index - 1), text.lastIndexOf("\n", index - 1)) + 1;
  const token = text.slice(tokenStart, index + 1).toLowerCase();
  if (PROTECTED_ABBREVIATIONS.has(token)) {
    return false;
  }

  const continuedAbbreviation =
    /[A-Z]/.test(prevChar) &&
    /[A-Z]/.test(nextChar) &&
    text[index + 2] === ".";
  if (continuedAbbreviation) {
    return false;
  }

  const repeatedCaps = /(?:^|[\s(])(?:[A-Z]\.){2,}$/.test(
    text.slice(Math.max(0, index - 12), index + 1),
  );
  if (repeatedCaps) {
    return false;}

  return true;}

// Split a page into sentence like spans while keeping character offsets. Offsets used for start/end data. 
function splitSentencesWithOffsets(text: string): SentenceSpan[] {
  const trimmed = normalizeWhitespace(text);
  if (!trimmed) return [];

  const spans: SentenceSpan[] = [];
  let sentenceStart = 0;

  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    const nextChar = trimmed[i + 1] ?? "";
    const hasSentenceBreak = nextChar === "" || /\s/.test(nextChar);
    const isBoundary =
      ((char === "!" || char === "?") && hasSentenceBreak) ||
      (char === "." && hasSentenceBreak && shouldSplitAtPeriod(trimmed, i));

    if (!isBoundary) continue;

    const raw = trimmed.slice(sentenceStart, i + 1);
    const leadingWhitespace = raw.length - raw.trimStart().length;
    const trailingWhitespace = raw.length - raw.trimEnd().length;
    const value = raw.trim();
    const start = sentenceStart + leadingWhitespace;
    const end = i + 1 - trailingWhitespace;

    if (value) {
      spans.push({
        text: value,
        start,
        end,
      });
    }

    sentenceStart = i + 1;
  }

  const tail = trimmed.slice(sentenceStart);
  if (tail.trim()) {
    const leadingWhitespace = tail.length - tail.trimStart().length;
    const trailingWhitespace = tail.length - tail.trimEnd().length;
    spans.push({
      text: tail.trim(),
      start: sentenceStart + leadingWhitespace,
      end: trimmed.length - trailingWhitespace,
    });
  }

  return spans;
}

let embeddingPipelinePromise: ReturnType<typeof pipeline> | null = null;

// Load one local JS embedding model and reuse it for all semantic runs.
async function getEmbeddingPipeline() {
  if (!embeddingPipelinePromise) {
    embeddingPipelinePromise = pipeline("feature-extraction", EMBEDDING_MODEL, {
      dtype: EMBEDDING_DTYPE as "q8" | "q4" | "fp32" | "fp16",
    });
  }

  return embeddingPipelinePromise;
}

// Create sentence embeddings using a local JS model.
async function vectorizeSentences(sentences: string[]): Promise<number[][]> {
  if (sentences.length === 0) return [];

  const extractor = await getEmbeddingPipeline();
  const embeddings: number[][] = [];

  for (let index = 0; index < sentences.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = sentences.slice(index, index + EMBEDDING_BATCH_SIZE);
    const output = await extractor(batch, {
      pooling: "mean",
      normalize: true,
    });

    embeddings.push(...(output.tolist() as number[][]));
  }

  return embeddings;
}

// Cosine similarity over numeric embedding vectors
function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) return 0;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const value of left) {
    leftNorm += value * value;
  }

  for (const value of right) {
    rightNorm += value * value;
  }

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

// Build pairwise similarity scores between sentence seed units
function buildSimilarityMatrix(vectors: number[][]): number[][] {
  const matrix = Array.from({ length: vectors.length }, () =>
    Array.from({ length: vectors.length }, () => 0),
  );

  for (let i = 0; i < vectors.length; i += 1) {
    matrix[i][i] = 1;

    for (let j = i + 1; j < vectors.length; j += 1) {
      const similarity = cosineSimilarity(vectors[i], vectors[j]);
      matrix[i][j] = similarity;
      matrix[j][i] = similarity;
    }
  }

  return matrix;
}

// Lightweight PageRank over similarity graph
function runPageRank(matrix: number[][], threshold: number): number[] {
  const count = matrix.length;
  if (count === 0) return [];

  const ranks = Array.from({ length: count }, () => 1 / count);
  const neighbors = matrix.map((row, index) =>
    row
      .map((weight, neighbor) => ({ weight, neighbor }))
      .filter(({ weight, neighbor }) => neighbor !== index && weight > threshold),
  );
  const outgoing = neighbors.map((row) =>
    row.reduce((sum, edge) => sum + edge.weight, 0),
  );

  for (let step = 0; step < PAGERANK_ITERATIONS; step += 1) {
    const next = Array.from({ length: count }, () => (1 - PAGERANK_DAMPING) / count);

    for (let i = 0; i < count; i += 1) {
      if (outgoing[i] === 0) {
        const shared = (PAGERANK_DAMPING * ranks[i]) / count;

        for (let j = 0; j < count; j += 1) {
          next[j] += shared;
        }
        continue;
      }

      for (const edge of neighbors[i]) {
        next[edge.neighbor] +=
          PAGERANK_DAMPING * ranks[i] * (edge.weight / outgoing[i]);
      }
    }

    const delta = next.reduce((sum, value, index) => sum + Math.abs(value - ranks[index]), 0);
    for (let i = 0; i < count; i += 1) {
      ranks[i] = next[i];
    }

    if (delta < PAGERANK_TOLERANCE) {
      break;
    }
  }

  return ranks;
}

// Rollover typescript version of Python's remove_frequent_lines().
// Tries to remove repeated lines like headers or footers 
function removeFrequentLines(
  pages: ExtractedChunk[],
  threshold: number,
): ExtractedChunk[] {
  const textPages = pages.filter((page) => page.chunkType === "TEXT");
  if (textPages.length < 2) return pages;

  const lineCounts = new Map<string, number>();

  for (const page of textPages) {
    const uniqueLines = new Set(
      normalizeWhitespace(page.content)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );

    for (const line of uniqueLines) {
      lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
    }
  }

  const commonLines = new Set<string>();
  for (const [line, count] of lineCounts.entries()) {
    if (count / textPages.length > threshold) {
      commonLines.add(line);
    }
  }

  if (commonLines.size === 0) return pages;

  return pages.map((page) => {
    if (page.chunkType !== "TEXT") return page;

    const filtered = page.content
      .split("\n")
      .filter((line) => !commonLines.has(line.trim()))
      .join("\n");

    return {
      ...page,
      content: filtered,
    };
  });
}

// Used to create deterministic ids.
// Needed if document is reprocessed and prevents duplicate chunks from occuring. 
function buildChunkId(
  source: Source,
  pageIndex: number,
  chunkIndex: number,
  chunkType: ChunkType,
  content: string,
): string {
  return createHash("sha256")
    .update(source.path)
    .update("\n")
    .update(String(pageIndex))
    .update("\n")
    .update(String(chunkIndex))
    .update("\n")
    .update(chunkType)
    .update("\n")
    .update(content)
    .digest("hex");
}


// Groups sentence spans by semantic similarity using PageRank seed selection.
// Also keeps final chunks the same as source order.
function chunkSemanticSpans(
  page: ExtractedChunk,
  spans: SentenceSpan[],
  embeddings: number[][],
  options: Required<ChunkerOptions>,
): ChunkRecord[] {
  if (spans.length === 0) return [];

  const matrix = buildSimilarityMatrix(embeddings);
  const ranks = runPageRank(matrix, SIM_THRESHOLD);
  const seedIndices = ranks
    .map((rank, index) => ({ rank, index }))
    .sort((left, right) => right.rank - left.rank)
    .slice(0, PAGERANK_TOP_K)
    .map((entry) => entry.index);

  const used = new Set<number>();
  const selectedChunks: number[][] = [];

  // Seed chunks from top ranked sentences, then expand locally.
  for (const seedIndex of seedIndices) {
    if (used.has(seedIndex)) continue;

    const chunk = [seedIndex];
    used.add(seedIndex);

    let left = seedIndex - 1;
    while (left >= 0 && !used.has(left)) {
      const similarity = matrix[left][chunk[0]];

      if (similarity <= EXPANSION_THRESHOLD) break;

      chunk.unshift(left);
      used.add(left);
      left -= 1;
    }

    let right = seedIndex + 1;
    while (right < spans.length && !used.has(right)) {
      const similarity = matrix[right][chunk[chunk.length - 1]];

      if (similarity <= EXPANSION_THRESHOLD) break;

      chunk.push(right);
      used.add(right);
      right += 1;
    }

    selectedChunks.push(chunk);
  }

  return selectedChunks
    .sort((left, right) => left[0] - right[0])
    .map((sentenceIndexes, chunkIndex) => {
      const startChar = spans[sentenceIndexes[0]].start;
      const endChar = spans[sentenceIndexes[sentenceIndexes.length - 1]].end;
      const content = normalizeWhitespace(
        page.content.slice(startChar, endChar).replace(/\n+/g, " "),
      );

      return {
        chunkId: buildChunkId(
          page.source,
          Number(page.pageIndex),
          chunkIndex,
          page.chunkType,
          content,
        ),
        chunkType: page.chunkType,
        source: page.source,
        pageIndex: Number(page.pageIndex),
        chunkIndex,
        content,
        metadata: {
          startChar,
          endChar,
          wordCount: wordCount(content),
          sentenceCount: sentenceIndexes.length,
        },
      };
    })
    .filter((chunk) => shouldKeepChunk(chunk.content, options.minWords));
}

//Funciton to turn extracted pages into chunks following the rules set above. 
// Keeps Images & Tables as existing.  

function chunkSinglePage(
  page: ExtractedChunk,
  options: Required<ChunkerOptions>,
  spans: SentenceSpan[] = [],
  embeddings: number[][] = [],
): ChunkRecord[] {
  const content = normalizeWhitespace(page.content); //Clean page
  if (!content) return [];

  //Skip over IMAGES & TABLES, keeping them as is
    if (page.chunkType !== "TEXT") {
    return [
      {
        chunkId: buildChunkId(
          page.source,
          Number(page.pageIndex),
          0,
          page.chunkType,
          content,
        ),
        chunkType: page.chunkType,
        source: page.source,
        pageIndex: Number(page.pageIndex),
        chunkIndex: 0,
        content, //Actaual Chunk Text
        metadata: {
          startChar: 0,
          endChar: content.length,
          wordCount: wordCount(content),
          sentenceCount: 1,
        },
      },
    ];
  }

  if (spans.length === 0) {
    return shouldKeepChunk(content, options.minWords)
      ? [
          {
            chunkId: buildChunkId(
              page.source,
              Number(page.pageIndex),
              0,
              page.chunkType,
              content,
            ),
            chunkType: page.chunkType,
            source: page.source,
            pageIndex: Number(page.pageIndex),
            chunkIndex: 0,
            content, //Actaual Chunk Text
            metadata: {
              startChar: 0,
              endChar: content.length,
              wordCount: wordCount(content),
              sentenceCount: 1,
            },
          },
        ]
      : [];
  }
  //Pass normalized text to semantic sentence based chunking:
  return chunkSemanticSpans(
    {
      ...page,
      content,
    },
    spans,
    embeddings,
    options,
  );}


// Main entry for parse_pipeline
//Input: page level extractions from text-extract.ts
//Output: retrieval ready chunk records with IDs and metadata attached
export async function chunkPages(
  pages: ExtractedChunk[],
  options: ChunkerOptions = {},
): Promise<ChunkRecord[]> {
  const resolved = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const preparedPages = resolved.removeRepeatedLines
    ? removeFrequentLines(pages, resolved.repeatedLineThreshold)
    : pages;
  const textPages = preparedPages
    .filter((page) => page.chunkType === "TEXT")
    .map((page) => {
      const content = normalizeWhitespace(page.content);
      const spans = content ? splitSentencesWithOffsets(content) : [];

      return {
        page,
        content,
        spans,
      };
    })
    .filter((entry) => entry.content);

  const allSentences = textPages.flatMap((entry) => entry.spans.map((span) => span.text));
  const allEmbeddings = await vectorizeSentences(allSentences);
  let cursor = 0;
  const textPageEmbeddings = new Map<ExtractedChunk, number[][]>();

  for (const entry of textPages) {
    textPageEmbeddings.set(entry.page, allEmbeddings.slice(cursor, cursor + entry.spans.length));
    cursor += entry.spans.length;
  }

  return preparedPages.flatMap((page) => {
    if (page.chunkType !== "TEXT") {
      return chunkSinglePage(page, resolved);
    }

    const content = normalizeWhitespace(page.content);
    if (!content) return [];

    const spans = splitSentencesWithOffsets(content);
    const embeddings = textPageEmbeddings.get(page) ?? [];
    return chunkSinglePage(page, resolved, spans, embeddings);
  });
}
