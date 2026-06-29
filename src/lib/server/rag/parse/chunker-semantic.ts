import { embedTexts } from "../embedding-model";
import {
  buildChunkId,
  countWords,
  normalizeWhitespace,
  type ChunkRecord,
  type ExtractedChunk,
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

type SentenceSpan = {
  text: string;
  start: number;
  end: number;
};

// Keeps cleaned text & sentence spans together for one text page
// This avoids recomputing cleanup/splitting later in chunkPages()
type PreparedTextPage = {
  page: ExtractedChunk;
  content: string;
  spans: SentenceSpan[];
};

// Small defaults for semantic grouping
// Keeps full coverage, then uses local similarity to decide where chunks should break from each other
const LONG_CHUNK_BREAK_THRESHOLD = 0.25;
const LONG_BREAK_RATIO = 0.8;

export function cleanPageText(text: string): string {
  return normalizeWhitespace(text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n"));
}

// Tables should be retrieved as their own chunks, not mixed into text chunks
export function stripInlineTables(text: string): string {
  return normalizeWhitespace(text.replace(/\[Table: .*?\]/gs, " "));}

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

function shouldSplitAtPeriod(text: string, index: number): boolean {
  const prevChar = text[index - 1] ?? "";
  const nextChar = text[index + 1] ?? "";

  if (
    prevChar >= "0" &&
    prevChar <= "9" &&
    nextChar >= "0" &&
    nextChar <= "9"
  ) {
    return false;
  }

  const tokenStart =
    Math.max(text.lastIndexOf(" ", index - 1), text.lastIndexOf("\n", index - 1)) + 1;
  const token = text.slice(tokenStart, index + 1).toLowerCase();
  if (PROTECTED_ABBREVIATIONS.has(token)) {
    return false;
  }

  const continuedAbbreviation =
    prevChar >= "A" &&
    prevChar <= "Z" &&
    nextChar >= "A" &&
    nextChar <= "Z" &&
    text[index + 2] === ".";
  if (continuedAbbreviation) {
    return false;
  }

  if (/[A-Z](?:\.[A-Z])+\.$/.test(text.slice(Math.max(0, index - 12), index + 1))) {
    return false;
  }

  return true;
}

export function splitSentencesWithOffsets(text: string): SentenceSpan[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const spans: SentenceSpan[] = [];
  let blockStart = -1;
  let blockEnd = -1;

  const flushBlock = () => {
    if (blockStart < 0 || blockEnd <= blockStart) return;

    const blockText = normalized.slice(blockStart, blockEnd);
    let sentenceStart = 0;

    for (let i = 0; i < blockText.length; i += 1) {
      const char = blockText[i];
      const nextChar = blockText[i + 1] ?? "";
      const hasSentenceBreak =
        nextChar === "" || nextChar === " " || nextChar === "\n" || nextChar === "\t";
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
        });
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
      });
    }

    blockStart = -1;
    blockEnd = -1;
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
    if (blockStart < 0) {
      blockStart = start;
    }
    blockEnd = end;
  }

  flushBlock();

  return spans;
}

// Shared text cleanup path so page prep stays consistent
function prepareTextContent(text: string): string {
  return stripInlineTables(cleanPageText(text));
}

// Builds the cleaned page payload used by both embeddings and chunking
function prepareTextPage(page: ExtractedChunk): PreparedTextPage | null {
  const content = prepareTextContent(page.content);
  if (!content) {
    return null;
  }

  return {
    page,
    content,
    spans: splitSentencesWithOffsets(content),
  };
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
        const currentVeryLong =
          currentLength >= Math.floor(options.maxChars * LONG_BREAK_RATIO);

        if (currentVeryLong && similarity < LONG_CHUNK_BREAK_THRESHOLD) {
          break;}}

      currentLength = candidateLength;
      end += 1;}

    const selected = spans.slice(cursor, end);
    const startChar = selected[0].start;
    const endChar = selected[selected.length - 1].end;
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

    if (end >= spans.length) {
      break;
    }

    cursor = Math.max(end - options.overlapSentences, cursor + 1);
  }

  return chunks.filter((chunk) => countWords(chunk.content) >= options.minWords);
}

//Funciton to turn extracted pages into chunks following the rules set above
// Keeps Images & Tables as existing 
function chunkPreparedTextPage(
  prepared: PreparedTextPage,
  options: Required<ChunkerOptions>,
  embeddings: number[][],
): ChunkRecord[] {
  const { page, content, spans } = prepared;

  // Fallback for pages where sentence splitting does not produce useful spans
  if (spans.length === 0) {
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
            content, //Actaual Chunk Text
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

function chunkNonTextPage(page: ExtractedChunk): ChunkRecord[] {
  const content = normalizeWhitespace(page.content);
  if (!content) {
    return [];
  }

  // Non-text extraction types stay as one retrieval record
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


// Main entry for document parsing/chunking
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

  const preparedPages = pages;
  const preparedTextPages = preparedPages
    .filter((page) => page.chunkType === "TEXT")
    .map((page) => prepareTextPage(page))
    .filter((entry): entry is PreparedTextPage => entry !== null);

  const preparedTextPageMap = new Map<ExtractedChunk, PreparedTextPage>();
  for (const entry of preparedTextPages) {
    preparedTextPageMap.set(entry.page, entry);
  }

  // Embeddings are created once across all TEXT sentence spans
  // Then each page gets its own slice back by cursor position
  const allSentences = preparedTextPages.flatMap((entry) =>
    entry.spans.map((span) => span.text),
  );
  const allEmbeddings = await embedTexts(allSentences);
  let cursor = 0;
  const textPageEmbeddings = new Map<ExtractedChunk, number[][]>();

  for (const entry of preparedTextPages) {
    textPageEmbeddings.set(entry.page, allEmbeddings.slice(cursor, cursor + entry.spans.length));
    cursor += entry.spans.length;
  }

  return preparedPages.flatMap((page) => {
    if (page.chunkType !== "TEXT") {
      return chunkNonTextPage(page);
    }

    const prepared = preparedTextPageMap.get(page);
    if (!prepared) return [];

    const embeddings = textPageEmbeddings.get(page) ?? [];
    return chunkPreparedTextPage(prepared, resolved, embeddings);
  });
}
