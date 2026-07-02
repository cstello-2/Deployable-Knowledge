// File to build chunks by splitting text when semantic similarity falls below a provided threshold

// --- Specfic Chunk Work Flow ---

//  -Cleans page text lightly
//  -Splits cleaned text into sentence-ish spans with character offsets
//  -Embeds all sentences in one batch
//  -Builds chunks by walking sentences in order
//  -Keeps adding sentences until: the chunk would exceed maxChars, or adjacent sentence similarity drops below the threshold
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

const DEFAULT_OPTIONS: Required<ChunkerOptions> = {
  maxChars: 1200,
  minWords: 5,
  overlapSentences: 1,
};

const LONG_CHUNK_BREAK_THRESHOLD = 0.25;
const LONG_BREAK_RATIO = 0.8;

// Offsets point into the cleaned page text, not the original PDF bytes
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

export function cleanPageText(text: string): string {
  // Keep page cleanup light so extraction, not chunking, owns document-specific noise
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join("\n");
}

// Prevents "Dr. Evil" --> [Dr, Evil]
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

function shouldSplitAtPeriod(text: string, index: number): boolean {
  const prevChar = text[index - 1] ?? "";
  const nextChar = text[index + 1] ?? "";

  // Decimal values like "3.6" should stay in one span
  if (
    prevChar >= "0" &&
    prevChar <= "9" &&
    nextChar >= "0" &&
    nextChar <= "9"
  ) {
    return false;
  }

  // Check the token before this period for common abbreviations like "Dr."
  const tokenStart =
    Math.max(text.lastIndexOf(" ", index - 1), text.lastIndexOf("\n", index - 1)) + 1;
  const token = text.slice(tokenStart, index + 1).toLowerCase();
  if (PROTECTED_ABBREVIATIONS.has(token)) {
    return false;
  }

  // Avoid splitting in the middle of initialisms like "U.S.A."
  const continuedAbbreviation =
    prevChar >= "A" &&
    prevChar <= "Z" &&
    nextChar >= "A" &&
    nextChar <= "Z" &&
    text[index + 2] === ".";
  if (continuedAbbreviation) {
    return false;
  }

  // Handles the final period in initialisms like "U.S."
  if (/[A-Z](?:\.[A-Z])+\.$/.test(text.slice(Math.max(0, index - 12), index + 1))) {
    return false;
  }

  return true;
}

export function splitSentencesWithOffsets(text: string): SentenceSpan[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const spans: SentenceSpan[] = [];
  let sentenceStart = 0;

  // Split only on sentence punctuation followed by whitespace/end so inline punctuation stays intact
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const nextChar = normalized[i + 1] ?? "";
    const hasSentenceBreak =
      nextChar === "" || nextChar === " " || nextChar === "\n" || nextChar === "\t";
    const isBoundary =
      ((char === "!" || char === "?") && hasSentenceBreak) ||
      (char === "." && hasSentenceBreak && shouldSplitAtPeriod(normalized, i));

    if (!isBoundary) continue;

    const value = normalized.slice(sentenceStart, i + 1).trim();

    if (value) {
      spans.push({
        text: value,
        start: sentenceStart,
        end: i + 1,
      });
    }

    sentenceStart = i + 1;
  }

  const tail = normalized.slice(sentenceStart);
  if (tail.trim()) {
    // Useful PDF text often lacks final punctuation, so keep the remaining tail
    spans.push({
      text: tail.trim(),
      start: sentenceStart,
      end: normalized.length,
    });
  }

  return spans;
}

function dotProduct(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) return 0;

  // embedTexts normalizes vectors, so dot product is cosine similarity here
  let score = 0;

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    score += left[index] * right[index];
  }

  return score;
}

function makeChunk(
  page: ExtractedChunk,
  chunkIndex: number,
  content: string,
  startChar: number,
  endChar: number,
  sentenceCount: number,
): ParsedChunk {
  // One chunk shape is used for text, table, and image chunks before DB storage
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
      wordCount: countWords(content),
      sentenceCount,
    },
  };
}

function chunkSemanticSpans(
  page: ExtractedChunk,
  content: string,
  spans: SentenceSpan[],
  embeddings: number[][],
  options: Required<ChunkerOptions>,
): ParsedChunk[] {
  if (spans.length === 0) return [];

  const chunks: ParsedChunk[] = [];
  let chunkIndex = 0;
  let cursor = 0;

  // Walk sentences in order. Chunks stop at maxChars, or at a weak semantic join once long enough
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
        const similarity = dotProduct(embeddings[end - 1], embeddings[end]);
        const currentVeryLong =
          currentLength >= Math.floor(options.maxChars * LONG_BREAK_RATIO);

        if (currentVeryLong && similarity < LONG_CHUNK_BREAK_THRESHOLD) {
          break;
        }
      }

      currentLength = candidateLength;
      end += 1;
    }

    const selected = spans.slice(cursor, end);
    const startChar = selected[0].start;
    const endChar = selected[selected.length - 1].end;
    const chunkContent = normalizeWhitespace(
      content.slice(startChar, endChar).split("\n").join(" "),
    );

    if (chunkContent) {
      chunks.push(makeChunk(page, chunkIndex, chunkContent, startChar, endChar, selected.length));
      chunkIndex += 1;
    }

    if (end >= spans.length) {
      break;
    }

    // Keep a small overlap so answers split across chunk boundaries retain context
    cursor = Math.max(end - options.overlapSentences, cursor + 1);
  }

  return chunks.filter((chunk) => countWords(chunk.content) >= options.minWords);
}

export async function chunkPages(
  pages: ExtractedChunk[],
  options: ChunkerOptions = {},
): Promise<ParsedChunk[]> {
  const resolved = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const preparedTextPages: PreparedTextPage[] = [];
  for (const page of pages) {
    if (page.chunkType !== "TEXT") continue;

    const content = cleanPageText(page.content);
    if (!content) continue;

    preparedTextPages.push({
      page,
      content,
      spans: splitSentencesWithOffsets(content),
    });
  }

  const allSentences = preparedTextPages.flatMap((entry) =>
    entry.spans.map((span) => span.text),
  );

  // Embed all sentences in one batch, then slice vectors back to their pages
  const allEmbeddings = await embedTexts(allSentences);
  let embeddingCursor = 0;
  const textChunksByPage = new Map<ExtractedChunk, ParsedChunk[]>();

  for (const entry of preparedTextPages) {
    const embeddings = allEmbeddings.slice(embeddingCursor, embeddingCursor + entry.spans.length);
    embeddingCursor += entry.spans.length;
    textChunksByPage.set(
      entry.page,
      chunkSemanticSpans(entry.page, entry.content, entry.spans, embeddings, resolved),
    );
  }

  return pages.flatMap((page) => {
    if (page.chunkType !== "TEXT") {
      // Tables/images are already extracted as standalone units, so they skip sentence grouping
      const content = normalizeWhitespace(page.content);
      return content ? [makeChunk(page, 0, content, 0, content.length, 1)] : [];
    }

    return textChunksByPage.get(page) ?? [];
  });
}
