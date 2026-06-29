// ----------------------------
// Typescript file for chunking extracted PDF/document text 
// ----------------------------

// No longer follows Legacy Python Logic with PageRank as that left out too many sentences due to issues with PageRank

//Now senctences are embed and sorted through in order to do the following:
// - keep joining nearby pieces together
// - break when the chunk gets too big
// - also break when the topic/structure clearly shifts
// Additioanlly, small overlap added to help with chunk edges and overall context for LLM

// Embedding function moved to embedding-model.ts since it used twice (chunking & actual embedding)


// Imports
import { createHash } from "node:crypto"; 
//Used for creating deterministic indexes to be used as primary keys in SQL database
// Also prevents duplicate ids if document is reuploaded
import type { Chunk as ExtractedChunk, ChunkType, Source } from "./text-extract";
import { embedTexts } from "../../rag/embedding-model";


//Chunk Metadata (Start & End charecters, word & sentence counts)
export type ChunkMetadata = {
  startChar: number;
  endChar: number;
  wordCount: number;
  sentenceCount: number;
};

// chunker.ts output. Stores each chunk as one retrival record
export type ChunkRecord = {
  chunkId: string;  
  chunkType: ChunkType;
  source: Source;
  pageIndex: number;
  chunkIndex: number; 
  content: string;
  metadata: ChunkMetadata;
};


// Optional rules for chunking
// Can set min/max charecters per chunk, allowed sentence overlap, keep/remove repeated lines
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
  minWords: 5, //Should expirement later if this should be increased!
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

// Keeps cleaned text & sentence spans together for one text page
// This avoids recomputing cleanup/splitting later in chunkPages()
type PreparedTextPage = {
  page: ExtractedChunk;
  content: string;
  spans: SentenceSpan[];
};

// Small defaults for semantic grouping
// Keeps full coverage, then uses local similarity to decide where chunks should break from each other
const STRUCTURAL_BREAK_THRESHOLD = 0.35;
const LONG_CHUNK_BREAK_THRESHOLD = 0.25;
const MIN_BREAK_RATIO = 0.55;
const LONG_BREAK_RATIO = 0.8;
const BULLET_CHARS = new Set(["*", "•", "○", "♦"]); //

// Normalize all line endings & repeated spaces 
function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();}

// Small helper to keep line based cleanup generalized across PDFs
function isShortNumericText(text: string): boolean {
  if (!text || text.length > 3) return false;
  for (const char of text) {
    if (char < "0" || char > "9") {
      return false;}}
  return true;}

// Small helper to reuse simple word splitting in label detection
function splitWords(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed.split(" ").filter(Boolean);}

// Generalized heading/caption detector
// Replaces hard coded Figure/Table style anchor checks
function looksLikeLabelLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;}

  const lastChar = trimmed[trimmed.length - 1] ?? "";
  if (lastChar === "." || lastChar === "!" || lastChar === "?") {
    return false;}

  const words = splitWords(trimmed);
  if (words.length === 0 || words.length > 12) {
    return false;}

  const colonIndex = trimmed.indexOf(":");
  if (colonIndex > 0) {
    const prefixWords = splitWords(trimmed.slice(0, colonIndex));
    return prefixWords.length > 0 && prefixWords.length <= 4;}

  let titleishWords = 0;
  let digitCount = 0;

  for (const char of trimmed) {
    if (char >= "0" && char <= "9") {
      digitCount += 1;}}

  for (const word of words) {
    const firstChar = word[0] ?? "";
    if (firstChar >= "A" && firstChar <= "Z") {
      titleishWords += 1;
    }}

  return words.length <= 8 && (
    digitCount > 0 ||
    titleishWords >= Math.max(2, Math.ceil(words.length / 2)));}

// Removes short trailing page refs from label style lines
// ex: "Army Administration 67" -> "Army Administration"
function stripTrailingShortNumber(text: string): string {
  const parts = text.trim().split(/\s+/);
  const tail = parts.at(-1) ?? "";

  if (!isShortNumericText(tail)) {
    return text.trim();
  }

  return parts.slice(0, -1).join(" ").trim();}

// Small helper for generic bullet/step detection.
function startsWithBullet(text: string): boolean {
  const trimmed = text.trimStart();
  return BULLET_CHARS.has(trimmed[0] ?? "");
}

// Small helper for generic numbered step detection.
function startsWithNumberedStep(text: string): boolean {
  const trimmed = text.trimStart();
  let index = 0;

  while (index < trimmed.length) {
    const char = trimmed[index] ?? "";
    if (char < "0" || char > "9") {
      break;}
    index += 1;}

  if (index === 0 || trimmed[index] !== ".") {
    return false;}

  const nextChar = trimmed[index + 1] ?? "";
  return nextChar === "" || nextChar === " ";}

// Small helper to replace repeated-initial regex with plain code
function endsWithRepeatedInitials(text: string): boolean {
  const snippet = text.slice(Math.max(0, text.length - 12));
  let index = snippet.length - 1;
  let groups = 0;

  while (index >= 1) {
    if (snippet[index] !== ".") break;

    const letter = snippet[index - 1] ?? "";
    if (letter < "A" || letter > "Z") break;

    groups += 1;
    index -= 2;
  }

  if (groups < 2) return false;
  if (index < 0) return true;

  const boundary = snippet[index] ?? "";
  return boundary === " " || boundary === "(";}

// Remove repeated running headers/footers but try to keep useful anchors such as Table/Figure labels
export function cleanPageText(text: string): string {
  const cleanedLines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      let cleaned = line.replace(/[ \t]+/g, " ").trim();
      if (!cleaned) return "";

      if (!cleaned || isShortNumericText(cleaned)) {
        return "";}

      if (startsWithBullet(cleaned)) {
        let index = 0;

        while (index < cleaned.length) {
          const char = cleaned[index] ?? "";
          if (char === " ") {
            index += 1;
            continue;
          }

          if (!BULLET_CHARS.has(char)) {
            break;
          }

          index += 1;
        }

        const tail = cleaned.slice(index).trimStart();
        cleaned = tail ? `* ${tail}` : "*";
      }

      if (looksLikeLabelLine(cleaned)) {
        cleaned = stripTrailingShortNumber(cleaned);}

      return cleaned;})
    .filter(Boolean);

  return normalizeWhitespace(cleanedLines.join("\n"));}

// Tables should be retrieved as their own chunks, not mixed into text chunks
export function stripInlineTables(text: string): string {
  return normalizeWhitespace(text.replace(/\[Table: .*?\]/gs, " "));}

// Helper function to track word counts
function wordCount(text: string): number {
  let inWord = false;
  let count = 0;

  for (const char of text.trim()) {
    if (char === " " || char === "\n" || char === "\t") {
      inWord = false;
      continue;}

    if (!inWord) {
      count += 1;
      inWord = true;
    }}
  return count;}

// Rollover from python pipeline to remove very small chunks
function shouldKeepChunk(text: string, minWords: number): boolean {
  if (startsStructuralBlock(text)) {
    return true;
  }
  return wordCount(text) >= minWords;
}

// Small hard rule set for lines that should start a fresh semantic unit
export function startsStructuralBlock(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  return (
    startsWithBullet(trimmed) ||
    startsWithNumberedStep(trimmed) ||
    looksLikeLabelLine(trimmed)
  );
}

//Small hard rule set to prevent broken sentence splitting. Can add to this list
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

  if (endsWithRepeatedInitials(text.slice(0, index + 1))) {
    return false;
  }

  return true;
}

// Split a page into sentence like spans while keeping character offsets 
// Offsets used for start/end data
export function splitSentencesWithOffsets(text: string): SentenceSpan[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const spans: SentenceSpan[] = [];
  let blockStart = -1;
  let blockEnd = -1;
  let blockStartsStructural = false;

  // Flushes one gathered line block into sentence spans
  // Structural starts create a fresh block before sentence splitting happens
  const flushBlock = () => {
    if (blockStart < 0 || blockEnd <= blockStart) return;

    const blockText = normalized.slice(blockStart, blockEnd);
    let sentenceStart = 0;
    let emitted = 0;

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

    if (structural) {
      flushBlock();
      spans.push({
        text: value,
        start,
        end,
        startsBlock: true,
      });
      continue;
    }

    if (blockStart < 0) {
      blockStart = start;
      blockStartsStructural = structural;
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
    // Lines repeated across most pages are likely running headers/footers
    if (count / textPages.length > threshold) {
      commonLines.add(line);
    }
  }

  if (commonLines.size === 0) return cleanedPages;

  return cleanedPages.map((page) => {
    if (page.chunkType !== "TEXT") return page;

    const filtered = page.content
      .split("\n")
      .filter((line: string) => !commonLines.has(line.trim()))
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

        // Break on structural shifts once the chunk is already large enough
        // Also break very long chunks earlier when nearby sentence meaning drops
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

  return chunks.filter((chunk) => shouldKeepChunk(chunk.content, options.minWords));
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
        wordCount: wordCount(content),
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

  const preparedPages = resolved.removeRepeatedLines
    ? removeFrequentLines(pages, resolved.repeatedLineThreshold)
    : pages;
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
