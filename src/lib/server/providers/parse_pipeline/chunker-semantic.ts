// ----------------------------
// Typescript file for chunking extracted PDF/document text 
// ----------------------------

// No longer follows Legacy Python Logic with PageRank as that left out too many sentences!

//Now senctences are embed and sorted through in order to do the following:
// - keep joining nearby pieces together
// - break when the chunk gets too big
// - also break when the topic/structure clearly shifts
// Additioanlly, small overlap added to help with chunk edges and overall context for LLM

// Embedding function moved to embedding-model.ts


// Imports
import { createHash } from "node:crypto"; 
//Used for creating deterministic indexes to be used as primary keys in SQL database.
// Also prevents duplicate ids if document is reuploaded. 
import type { Chunk as ExtractedChunk, ChunkType, Source } from "./text-extract";
import { embedTexts } from "../../rag/embedding-model";


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
  end: number;
  startsBlock: boolean;
};

// Small defaults for semantic grouping
// Keeps full coverage, then uses local similarity to decide where chunks should break.
const STRUCTURAL_BREAK_THRESHOLD = 0.35;
const LONG_CHUNK_BREAK_THRESHOLD = 0.25;
const MIN_BREAK_RATIO = 0.55;
const LONG_BREAK_RATIO = 0.8;
const RUNNING_TEXT_PREFIXES = [
  /^CENTER FOR ARMY LESSONS LEARNED(?:\s+|$)/i,
  /^TACTICAL COMBAT CASUALTY CARE HANDBOOK(?:\s+|$)/i,
];

// Normalize all line endings & repeated spaces 
function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();}

// Remove repeated running headers/footers but keep useful anchors like Table/Figure labels.
export function cleanPageText(text: string): string {
  const cleanedLines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      let cleaned = line.replace(/[ \t]+/g, " ").trim();
      if (!cleaned) return "";

      for (const prefix of RUNNING_TEXT_PREFIXES) {
        cleaned = cleaned.replace(prefix, "").trim();
      }

      if (!cleaned || /^\d{1,3}$/.test(cleaned)) {
        return "";
      }

      // Figure/table labels are useful, but trailing page numbers are not.
      if (/^(?:Figure|Table|Appendix|Chapter|Phase|Step)\b/i.test(cleaned)) {
        cleaned = cleaned.replace(/\s+\d{1,3}$/, "").trim();
      }

      return cleaned;
    })
    .filter(Boolean);

  return normalizeWhitespace(cleanedLines.join("\n"));
}

// Tables should be retrieved as their own chunks, not mixed into normal prose chunks.
export function stripInlineTables(text: string): string {
  return normalizeWhitespace(text.replace(/\[Table: .*?\]/gs, " "));
}

// Short figure/table labels can still be useful retrieval anchors.
function isReferenceAnchor(text: string): boolean {
  return /^(?:Figure|Table|Appendix|Chapter|Phase|Step)\b/i.test(text.trim());
}

// Helper function to track word counts
function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;}

// Rollover from python pipeline to remove very small chunks
function shouldKeepChunk(text: string, minWords: number): boolean {
  if (isReferenceAnchor(text)) return true;
  return wordCount(text) >= minWords;}

// Small hard rule set for lines that should start a fresh semantic unit.
function startsStructuralBlock(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  return /^(?:[*•○♦]\s*[*•○♦]*|\d+\.(?:\s|$)|(?:NOTE|CAUTION|WARNING|OBJECTIVE|REFERENCE|EVALUATION|MATERIALS|INDICATIONS)\s*:|(?:Figure|Table|Appendix|Phase|Step)\b)/i.test(
    trimmed,
  );
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
  "spc."]);

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

// Split a page into sentence like spans while keeping character offsets. 
// Offsets used for start/end data. 
function splitSentencesWithOffsets(text: string): SentenceSpan[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const spans: SentenceSpan[] = [];
  let blockStart = -1;
  let blockEnd = -1;
  let blockStartsStructural = false;

  const flushBlock = () => {
    if (blockStart < 0 || blockEnd <= blockStart) return;

    const blockText = normalized.slice(blockStart, blockEnd);
    let sentenceStart = 0;
    let emitted = 0;

    for (let i = 0; i < blockText.length; i += 1) {
      const char = blockText[i];
      const nextChar = blockText[i + 1] ?? "";
      const hasSentenceBreak = nextChar === "" || /\s/.test(nextChar);
      const isBoundary =
        ((char === "!" || char === "?") && hasSentenceBreak) ||
        (char === "." && hasSentenceBreak && shouldSplitAtPeriod(blockText, i));

      if (!isBoundary) continue;

      const raw = blockText.slice(sentenceStart, i + 1);
      const leadingWhitespace = raw.length - raw.trimStart().length;
      const trailingWhitespace = raw.length - raw.trimEnd().length;
      const value = raw.trim();
      const start = blockStart + sentenceStart + leadingWhitespace;
      const end = blockStart + i + 1 - trailingWhitespace;

      if (value) {
        spans.push({
          text: value,
          start,
          end,
          startsBlock: blockStartsStructural && emitted === 0,
        });
        emitted += 1;
      }

      sentenceStart = i + 1;
    }

    const tail = blockText.slice(sentenceStart);
    if (tail.trim()) {
      const leadingWhitespace = tail.length - tail.trimStart().length;
      const trailingWhitespace = tail.length - tail.trimEnd().length;
      spans.push({
        text: tail.trim(),
        start: blockStart + sentenceStart + leadingWhitespace,
        end: blockStart + blockText.length - trailingWhitespace,
        startsBlock: blockStartsStructural && emitted === 0,
      });
    }

    blockStart = -1;
    blockEnd = -1;
    blockStartsStructural = false;
  };

  let cursor = 0;
  for (const line of normalized.split("\n")) {
    const lineStart = cursor;
    const lineEnd = cursor + line.length;
    cursor = lineEnd + 1;

    const value = line.trim();
    if (!value) continue;

    const leadingWhitespace = line.length - line.trimStart().length;
    const trailingWhitespace = line.length - line.trimEnd().length;
    const start = lineStart + leadingWhitespace;
    const end = lineEnd - trailingWhitespace;
    const structural = startsStructuralBlock(value);

    if (blockStart >= 0 && structural) {
      flushBlock();
    }

    if (blockStart < 0) {
      blockStart = start;
      blockStartsStructural = structural;
    }
    blockEnd = end;
  }

  flushBlock();

  return spans;}
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
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));}

// Rollover typescript version of Python's remove_frequent_lines()
// Tries to remove repeated lines, ex: headers or footers 
function removeFrequentLines(
  pages: ExtractedChunk[],
  threshold: number,
): ExtractedChunk[] {
  const cleanedPages = pages.map((page) =>
    page.chunkType === "TEXT"
      ? {
          ...page,
          content: cleanPageText(page.content),
        }
      : page,
  );
  const textPages = cleanedPages.filter((page) => page.chunkType === "TEXT");
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

  if (commonLines.size === 0) return cleanedPages;

  return cleanedPages.map((page) => {
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

// Used to create deterministic ids
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
    .digest("hex");}

// Groups sentence like spans into full coverage chunks.
// Semantic similarity helps decide where to break the chunks
function chunkSemanticSpans(
  page: ExtractedChunk,
  spans: SentenceSpan[],
  embeddings: number[][],
  options: Required<ChunkerOptions>,
): ChunkRecord[] {
  if (spans.length === 0) return [];

  const chunks: ChunkRecord[] = [];
  let chunkIndex = 0;
  let cursor = 0;

  while (cursor < spans.length) {
    let end = cursor;
    let currentLength = 0;

    while (end < spans.length) {
      const candidateLength =
        spans[end].end - spans[cursor].start + (end > cursor ? 1 : 0);

      if (end > cursor && candidateLength > options.maxChars) {
        break;
      }

      if (end > cursor) {
        const similarity = cosineSimilarity(embeddings[end - 1], embeddings[end]);
        const currentLongEnough =
          currentLength >= Math.floor(options.maxChars * MIN_BREAK_RATIO);
        const currentVeryLong =
          currentLength >= Math.floor(options.maxChars * LONG_BREAK_RATIO);

        if (
          (spans[end].startsBlock &&
            currentLongEnough &&
            similarity < STRUCTURAL_BREAK_THRESHOLD) ||
          (currentVeryLong && similarity < LONG_CHUNK_BREAK_THRESHOLD)
        ) {
          break;}}

      currentLength = candidateLength;
      end += 1;}

    const selected = spans.slice(cursor, end);
    const startChar = selected[0].start;
    const endChar = selected[selected.length - 1].end;
    const content = normalizeWhitespace(
      page.content.slice(startChar, endChar).replace(/\n+/g, " "),);

    if (content) {
      chunks.push({
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
          sentenceCount: selected.length,
        },
      });
      chunkIndex += 1;
    }

    if (end >= spans.length) {
      break;
    }

    cursor = Math.max(end - options.overlapSentences, cursor + 1);
  }

  return chunks.filter((chunk) => shouldKeepChunk(chunk.content, options.minWords));}

//Funciton to turn extracted pages into chunks following the rules set above
// Keeps Images & Tables as existing 
function chunkSinglePage(
  page: ExtractedChunk,
  options: Required<ChunkerOptions>,
  spans: SentenceSpan[] = [],
  embeddings: number[][] = [],
): ChunkRecord[] {
  const content =
    page.chunkType === "TEXT"
      ? stripInlineTables(cleanPageText(page.content))
      : normalizeWhitespace(page.content);
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
      const content = stripInlineTables(cleanPageText(page.content));
      const spans = content ? splitSentencesWithOffsets(content) : [];

      return {
        page,
        content,
        spans,
      };
    })
    .filter((entry) => entry.content);

  const allSentences = textPages.flatMap((entry) => entry.spans.map((span) => span.text));
  const allEmbeddings = await embedTexts(allSentences);
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

    const content = stripInlineTables(cleanPageText(page.content));
    if (!content) return [];

    const spans = splitSentencesWithOffsets(content);
    const embeddings = textPageEmbeddings.get(page) ?? [];
    return chunkSinglePage(page, resolved, spans, embeddings);
  });}
