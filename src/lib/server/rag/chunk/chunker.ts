import {
  buildChunkId,
  countWords,
  normalizeWhitespace,
  type ExtractedChunk,
  type ParsedChunk,
} from "./parse-shared";
import { RAG_CHUNK_CHARACTER_LIMIT } from "$lib/utils/contextLimits";

const MIN_WORDS = 5;
const OVERLAP_SENTENCES = 1;

// Offsets point into the cleaned page text, not the original PDF bytes
type SentenceSpan = {
  text: string;
  start: number;
  end: number;
};

function splitRangeByLength(text: string, start: number, end: number): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let cursor = start;

  while (cursor < end) {
    while (cursor < end && /\s/.test(text[cursor])) {
      cursor += 1;
    }

    if (cursor >= end) break;

    let splitAt = Math.min(cursor + RAG_CHUNK_CHARACTER_LIMIT, end);

    if (splitAt < end) {
      const window = text.slice(cursor, splitAt + 1);
      const boundary = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));

      // Prefer a natural boundary, but hard-split unbroken text so the size limit is guaranteed.
      if (boundary > 0) {
        splitAt = cursor + boundary;
      }
    }

    const value = normalizeWhitespace(text.slice(cursor, splitAt));

    if (value) {
      spans.push({
        text: value,
        start: cursor,
        end: splitAt,
      });
    }

    cursor = splitAt;
  }

  return spans;
}

function splitOversizedSpans(text: string, spans: SentenceSpan[]): SentenceSpan[] {
  return spans.flatMap((span) => {
    if (span.end - span.start <= RAG_CHUNK_CHARACTER_LIMIT) {
      return span;
    }

    return splitRangeByLength(text, span.start, span.end);
  });
}

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

function getChunkContent(content: string, startChar: number, endChar: number): string {
  return normalizeWhitespace(content.slice(startChar, endChar).replace(/\n/g, " "));
}

function chunkSentenceSpans(
  page: ExtractedChunk,
  content: string,
  spans: SentenceSpan[],
): ParsedChunk[] {
  const boundedSpans = splitOversizedSpans(content, spans);
  if (boundedSpans.length === 0) return [];

  const chunks: ParsedChunk[] = [];
  let chunkIndex = 0;
  let cursor = 0;

  while (cursor < boundedSpans.length) {
    let end = cursor + 1;

    while (end < boundedSpans.length) {
      const candidateLength = boundedSpans[end].end - boundedSpans[cursor].start;

      if (candidateLength > RAG_CHUNK_CHARACTER_LIMIT) {
        break;
      }

      end += 1;
    }

    const selected = boundedSpans.slice(cursor, end);
    const startChar = selected[0].start;
    const endChar = selected[selected.length - 1].end;
    const chunkContent = getChunkContent(content, startChar, endChar);

    if (chunkContent && countWords(chunkContent) >= MIN_WORDS) {
      chunks.push({
        chunkId: buildChunkId(page, chunkIndex, chunkContent),
        chunkType: page.chunkType,
        source: page.source,
        pageIndex: page.pageIndex,
        chunkIndex,
        content: chunkContent,
      });
      chunkIndex += 1;
    }

    if (end >= boundedSpans.length) {
      break;
    }

    // Keep a small overlap so answers split across chunk boundaries retain context
    cursor = Math.max(end - OVERLAP_SENTENCES, cursor + 1);
  }

  return chunks;
}

function preparePageContent(page: ExtractedChunk): string {
  switch (page.chunkType) {
    case "TEXT":
      return cleanPageText(page.content);
    default:
      return normalizeWhitespace(page.content);
  }
}

function chunkPage(page: ExtractedChunk): ParsedChunk[] {
  const content = preparePageContent(page);
  if (!content) return [];

  if (page.chunkType !== "TEXT") {
    // Keep extracted media units together when possible, but still enforce the embedding size limit.
    return splitRangeByLength(content, 0, content.length).map((span, chunkIndex) => {
      const chunkContent = span.text;

      return {
        chunkId: buildChunkId(page, chunkIndex, chunkContent),
        chunkType: page.chunkType,
        source: page.source,
        pageIndex: page.pageIndex,
        chunkIndex,
        content: chunkContent,
      };
    });
  }

  const spans = splitSentencesWithOffsets(content);
  return chunkSentenceSpans(page, content, spans);
}

export function chunkPages(pages: ExtractedChunk[]): ParsedChunk[] {
  return pages.flatMap(chunkPage);
}
