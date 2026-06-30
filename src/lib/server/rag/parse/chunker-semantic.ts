// File to build chunks by splitting text when semantic similarity falls below a provided threshold

// --- Specfic Chunk Work Flow ---

//  -Cleans page text lightly
//  -Splits cleaned text into sentence-ish spans with character offsets
//  -Embeds all sentences in one batch
//  -Builds chunks by walking sentences in order
//  -Keeps adding sentences until: the chunk would exceed maxChars, or the chunk is already long enough and adjacent sentence similarity drops below the threshold
//  -Adds small sentence overlap between chunks
//  -Stores metadata like startChar, endChar, wordCount, sentenceCount

// -------------------------------

import { embedTexts } from "../embedding-model";
import {
  buildChunkId,
  countWords,
  normalizeWhitespace,
  type ExtractedChunk,
  type ParsedChunk,
} from "./parse-shared";

export type ChunkerOptions = {
  maxChars?: number;
  minWords?: number;
  overlapSentences?: number;
};

// --- Chunk Params ---

// Chunk defaults, can be adjsuted
const DEFAULT_OPTIONS: Required<ChunkerOptions> = {
  maxChars: 1200, // Max size of a chunk. NOTE: 1200 chars about 10-15 sentences. 
  minWords: 5, // Minimum size of a chunk. TODO: Test to see if this should be increased
  overlapSentences: 1, //Allowed number of sentence overlaps between chunks. Default: 1
};

// Tunable Values --- TODO: expirement
const LONG_CHUNK_BREAK_THRESHOLD = 0.25; // Value to determine similarity chunk splits
// ie: If two neighboring sentence embeddings have similarity below 0.25, treat that as a weak join and split there
const LONG_BREAK_RATIO = 0.8; // Only consider a semantic split after the current chunk is at least x percent of maxChars

// ---------------------

// Offsets are based on the cleaned page text, not the original PDF byte positions
type SentenceSpan = {
  text: string;
  start: number;
  end: number;
};

type PreparedTextPage = {
  page: ExtractedChunk;
  content: string;
  spans: SentenceSpan[];
};

// Keep page cleanup light. Repeated headers/footers are already handled in extraction
// Really a safety net before building chunks
export function cleanPageText(text: string): string {
  return normalizeWhitespace(text 
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n"));
}

// Used to prevent obvious false splits. ex: "Dr. Evil" -> [Dr, Evil]
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

// Function to help ensure proper sentence splitting around periods
// Needed for now to ensure chunks are split on real sentences. Again acts as a safety net
function shouldSplitAtPeriod(text: string, index: number): boolean {
  const prevChar = text[index - 1] ?? "";
  const nextChar = text[index + 1] ?? "";

  if ( // Stops split on decimals. ex: "3.6" -> [3, 6]
    prevChar >= "0" &&
    prevChar <= "9" &&
    nextChar >= "0" &&
    nextChar <= "9"
  ) {
    return false;
  }
  // Find the word ending at this period by searching backward to the previous space or newline
  const tokenStart = 
    Math.max(text.lastIndexOf(" ", index - 1), text.lastIndexOf("\n", index - 1)) + 1;
  const token = text.slice(tokenStart, index + 1).toLowerCase();
  if (PROTECTED_ABBREVIATIONS.has(token)) { 
    return false;
  }

  const continuedAbbreviation = //Detects the middle of an initialism (ex: U.S. or U.S.A.)
    prevChar >= "A" &&
    prevChar <= "Z" &&
    nextChar >= "A" &&
    nextChar <= "Z" &&
    text[index + 2] === ".";
  if (continuedAbbreviation) {
    return false;
  }
  //Regex to handle the final period in abbreviations. ex: U.S.
  if (/[A-Z](?:\.[A-Z])+\.$/.test(text.slice(Math.max(0, index - 12), index + 1))) {
    return false;
  }

  return true;}

// Return sentenceish spans with character offsets so stored metadata points back to page text
export function splitSentencesWithOffsets(text: string): SentenceSpan[] {
  // Wider version of .trim(). Could use .trim() here but acts as saftey net incase of weird spacing after charecter offset calcs
  const normalized = normalizeWhitespace(text); 
  if (!normalized) return [];

  const spans: SentenceSpan[] = [];
  let sentenceStart = 0;

  // Scan the cleaned text directly. This keeps the function linear and preserves offsets.
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const nextChar = normalized[i + 1] ?? "";
    const hasSentenceBreak =
      nextChar === "" || nextChar === " " || nextChar === "\n" || nextChar === "\t";
    // Only splits when punctuation is followed by whitespace/end of text so mid word punctuation stays intact
    const isBoundary =
      ((char === "!" || char === "?") && hasSentenceBreak) ||
      (char === "." && hasSentenceBreak && shouldSplitAtPeriod(normalized, i));

    if (!isBoundary) continue;

    // Trim the returned text without letting leading/trailing spaces shift the stored span
    const raw = normalized.slice(sentenceStart, i + 1);
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

  // Anything after the final punctuation mark is still useful text and becomes the last span
  const tail = normalized.slice(sentenceStart);
  if (tail.trim()) {
    const leadingWhitespace = tail.length - tail.trimStart().length;
    const trailingWhitespace = tail.length - tail.trimEnd().length;
    spans.push({
      text: tail.trim(),
      start: sentenceStart + leadingWhitespace,
      end: normalized.length - trailingWhitespace,
    });}

  return spans;}

// Prepare one page before embedding so empty pages drop out early
function prepareTextPage(page: ExtractedChunk): PreparedTextPage | null {
  const content = cleanPageText(page.content);
  if (!content) {
    return null;}

  return {
    page,
    content,
    spans: splitSentencesWithOffsets(content),
  };}

// Embeddings are normalized, so uses cosine similarity (dot product) as a simple way to find weak sentence joins
function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) return 0;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const value of left) {
    leftNorm += value * value;}

  for (const value of right) {
    rightNorm += value * value;
  }

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)); // dot product
}

function chunkSemanticSpans(
  page: ExtractedChunk,
  spans: SentenceSpan[],
  embeddings: number[][],
  options: Required<ChunkerOptions>,
): ParsedChunk[] {
  if (spans.length === 0) return [];

  const chunks: ParsedChunk[] = [];
  let chunkIndex = 0;
  let cursor = 0;

  // Grow each chunk until it hits the char limit or a weak semantic join near the limit
  // Improved over the legacy Python PageRank Seed Sentence approach
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
        const currentVeryLong =
          currentLength >= Math.floor(options.maxChars * LONG_BREAK_RATIO);

        //Only use semantic breaks for long chunks so short related sentences stay together
        if (currentVeryLong && similarity < LONG_CHUNK_BREAK_THRESHOLD) {
          break;}}

      currentLength = candidateLength;
      end += 1;
    }

    const selected = spans.slice(cursor, end);
    const startChar = selected[0].start;
    const endChar = selected[selected.length - 1].end;
    // Build stored content from the selected span range so metadata offsets and content match
    const content = normalizeWhitespace(
      page.content.slice(startChar, endChar).split("\n").join(" "),
    );

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
          wordCount: countWords(content),
          sentenceCount: selected.length,
        },
      });
      chunkIndex += 1;
    }

    // Stop once the last sentence has been included
    if (end >= spans.length) {
      break;
    }

    // Keep a small sentence overlap so answers split across a boundary still have context
    // May not be necessary but acts as a good saftey net for RAG context
    cursor = Math.max(end - options.overlapSentences, cursor + 1);
  }

  // Drop tiny text chunks at the end so overlap and semantic splitting stay simple above
  return chunks.filter((chunk) => countWords(chunk.content) >= options.minWords);
}

function chunkPreparedTextPage(
  prepared: PreparedTextPage,
  options: Required<ChunkerOptions>,
  embeddings: number[][],
): ParsedChunk[] {
  const { page, content, spans } = prepared;

  // Fallback for pages where sentence splitting does not produce useful spans
  if (spans.length === 0) {
    // Keep a whole-page chunk only if it has enough text to be useful for retrieval
    return countWords(content) >= options.minWords
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
            content,
            metadata: {
              startChar: 0,
              endChar: content.length,
              wordCount: countWords(content),
              sentenceCount: 1,
            },
          },
        ]
      : [];
  }

  return chunkSemanticSpans(
    {
      ...page,
      content,
    },
    spans,
    embeddings,
    options,
  );
}

// Function to clean up Table and Image chunks
function chunkNonTextPage(page: ExtractedChunk): ParsedChunk[] {
  const content = normalizeWhitespace(page.content);
  if (!content) {
    return [];}

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
      content,
      metadata: {
        startChar: 0,
        endChar: content.length,
        wordCount: countWords(content),
        sentenceCount: 1,
      },
    },
  ];
}

export async function chunkPages(
  pages: ExtractedChunk[],
  options: ChunkerOptions = {},
): Promise<ParsedChunk[]> {
  const resolved = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const preparedPages = pages;
  // Only TEXT pages go through sentence splitting and semantic chunking
  const preparedTextPages = preparedPages
    .filter((page) => page.chunkType === "TEXT")
    .map((page) => prepareTextPage(page))
    .filter((entry): entry is PreparedTextPage => entry !== null);

  // Embeds all sentences in one batch, then slice vectors back to their pages
  const preparedTextPageMap = new Map<ExtractedChunk, PreparedTextPage>();
  for (const entry of preparedTextPages) {
    preparedTextPageMap.set(entry.page, entry);
  }

  const allSentences = preparedTextPages.flatMap((entry) =>
    entry.spans.map((span) => span.text),
  );
  const allEmbeddings = await embedTexts(allSentences);
  let cursor = 0;
  const textPageEmbeddings = new Map<ExtractedChunk, number[][]>();

  // Slice the flat embedding array back into the same page groups used before embedding
  for (const entry of preparedTextPages) {
    textPageEmbeddings.set(entry.page, allEmbeddings.slice(cursor, cursor + entry.spans.length));
    cursor += entry.spans.length;
  }

  return preparedPages.flatMap((page) => {
    if (page.chunkType !== "TEXT") {
      // Non-text chunks skip semantic grouping because they already represent one extracted unit
      return chunkNonTextPage(page);
    }

    const prepared = preparedTextPageMap.get(page);
    if (!prepared) return [];

    const embeddings = textPageEmbeddings.get(page) ?? [];
    return chunkPreparedTextPage(prepared, resolved, embeddings);
  });
}
