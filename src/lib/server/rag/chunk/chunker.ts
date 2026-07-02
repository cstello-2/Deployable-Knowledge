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

// Offsets point into the cleaned page text, not the original PDF bytes
type SentenceSpan = {
  text: string;
  start: number;
  end: number;
};

export function cleanPageText(text: string): string {
  // Keep page cleanup light as extraction does most de-noising
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
  if (/\d/.test(prevChar) && /\d/.test(nextChar)) {
    return false;
  }

  // Check the token before this period for common abbreviations like "Dr."
  const tokenStart =
    Math.max(text.lastIndexOf(" ", index - 1), text.lastIndexOf("\n", index - 1)) + 1;
  const token = text.slice(tokenStart, index + 1).toLowerCase();

  if (PROTECTED_ABBREVIATIONS.has(token)) {
    return false;
  }

  // Avoid splitting after initialisms like "U.S.A."
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
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1] ?? "";
    const hasSentenceBreak = nextChar === "" || /\s/.test(nextChar);
    const isBoundary =
      ((char === "!" || char === "?") && hasSentenceBreak) ||
      (char === "." && hasSentenceBreak && shouldSplitAtPeriod(normalized, index));

    if (!isBoundary) continue;

    const value = normalized.slice(sentenceStart, index + 1).trim();

    if (value) {
      spans.push({
        text: value,
        start: sentenceStart,
        end: index + 1,
      });
    }

    sentenceStart = index + 1;
  }

  const tail = normalized.slice(sentenceStart).trim();

  if (tail) {
    // PDF text may lack final punctuation, so keep the remaining tail
    spans.push({
      text: tail,
      start: sentenceStart,
      end: normalized.length,
    });
  }

  return spans;
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

function getChunkContent(content: string, startChar: number, endChar: number): string {
  return normalizeWhitespace(content.slice(startChar, endChar).replace(/\n/g, " "));
}

function chunkSentenceSpans(
  page: ExtractedChunk,
  content: string,
  spans: SentenceSpan[],
  options: Required<ChunkerOptions>,
): ParsedChunk[] {
  if (spans.length === 0) return [];

  const chunks: ParsedChunk[] = [];
  let chunkIndex = 0;
  let cursor = 0;

  while (cursor < spans.length) {
    let end = cursor + 1;

    while (end < spans.length) {
      const candidateLength = spans[end].end - spans[cursor].start;

      if (candidateLength > options.maxChars) {
        break;
      }

      end += 1;
    }

    const selected = spans.slice(cursor, end);
    const startChar = selected[0].start;
    const endChar = selected[selected.length - 1].end;
    const chunkContent = getChunkContent(content, startChar, endChar);

    if (chunkContent && countWords(chunkContent) >= options.minWords) {
      chunks.push(makeChunk(page, chunkIndex, chunkContent, startChar, endChar, selected.length));
      chunkIndex += 1;
    }

    if (end >= spans.length) {
      break;
    }

    // Keep a small overlap so answers split across chunk boundaries retain context
    cursor = Math.max(end - options.overlapSentences, cursor + 1);
  }

  return chunks;
}

function preparePageContent(page: ExtractedChunk): string {
  return page.chunkType === "TEXT"
    ? cleanPageText(page.content)
    : normalizeWhitespace(page.content);
}

function chunkPage(
  page: ExtractedChunk,
  options: Required<ChunkerOptions>,
): ParsedChunk[] {
  const content = preparePageContent(page);
  if (!content) return [];

  if (page.chunkType !== "TEXT") {
    // Tables/images are already extracted as standalone units, so they skip sentence grouping
    return [makeChunk(page, 0, content, 0, content.length, 1)];
  }

  const spans = splitSentencesWithOffsets(content);
  return chunkSentenceSpans(page, content, spans, options);
}

export function chunkPages(
  pages: ExtractedChunk[],
  options: ChunkerOptions = {},
): ParsedChunk[] {
  const resolved: Required<ChunkerOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return pages.flatMap((page) => chunkPage(page, resolved));
}
