import { createHash } from "node:crypto";
import type { Chunk as ExtractedChunk, ChunkType, Source } from "./text-extract";
import { cleanPageText, stripInlineTables, type ChunkRecord } from "./chunker-semantic";

type PostprocessOptions = {
  filterChunks?: boolean;
  minWords?: number;
};

type SentenceSpan = {
  text: string;
  start: number;
  end: number;
};

const DEFAULT_OPTIONS: Required<PostprocessOptions> = {
  filterChunks: true,
  minWords: 5,};

const COVERAGE_MIN_WORDS = 20;
const COVERAGE_MIN_SENTENCES = 2;
const NOISE_MAX_WORDS = 12;

// Helper for word counts used by final keep/drop rules
function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

// Normalize whitespace in final chunk text
function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

// Normalize text for coverage checks so regrouped bullets do not look missing
function normalizeCoverageText(text: string): string {
  return cleanPageText(text)
    .replace(/(?:^|\s)[*•○♦]+/g, " ") //PDF bullet points/markers
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Token level normalization is less strict than exact sentence string matching
function normalizeCoverageTokens(text: string): string {
  return normalizeCoverageText(text)
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Deterministic ids for post processed chunks
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

// Same text filter used by the Python pipeline
function isAllCaps(text: string, threshold: number = 0.8): boolean {
  const cleaned = text.replace(/[\W\d_]+/g, "");
  if (!cleaned) return false;

  let upperCount = 0;
  for (const char of cleaned) {
    if (char === char.toUpperCase()) {
      upperCount += 1;
    }}
  return upperCount / cleaned.length >= threshold;}

// Final keep/drop rule from the legacy Python retriever flow
function keepChunk(text: string, filterChunks: boolean, minWords: number): boolean {
  // Keep tables as standalone chunks
  if (text.trimStart().startsWith("[Table:")) return true;
  // Keep short reference anchors like Figure/Table labels
  if (/^(?:figure|table|appendix|chapter|phase|step)\b/i.test(text.trim())) return true;
  if (filterChunks) {
    const words = wordCount(text);
    // Some figure/table/appendix labels can still be useful for LLM context
    const hasReferenceLabel = /\b(?:figure|table|appendix)\b/i.test(text);
    // Catch obvious visual noise (ex: ellipses & dashes)
    const hasVisualNoise = /\.{3,}|-{3,}|_{3,}/.test(text.replace(/\s+/g, ""));

    if (isAllCaps(text) && words < minWords && !hasReferenceLabel) {
      return false;}

    if (hasVisualNoise && words <= NOISE_MAX_WORDS) {
      return false;}}
  return wordCount(text) >= minWords;}

// Keep coverage fallback limited so useful missing text returns without exploding chunk counts
function shouldKeepCoverageFallback(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return false;
  // Figure/table/appendix labels can still be useful even if they are loud.
  const hasReferenceLabel = /\b(?:figure|table|appendix)\b/i.test(normalized);
  // Catch obvious visual noise like ellipses or separator dashes.
  const hasVisualNoise = /\.{3,}|-{3,}|_{3,}/.test(normalized.replace(/\s+/g, ""));

  if (isAllCaps(normalized) && !hasReferenceLabel) return false;
  if (hasVisualNoise && wordCount(normalized) <= NOISE_MAX_WORDS) return false;
  if (/^(figure|table|step)\b/i.test(normalized)) return false;
  return wordCount(normalized) >= COVERAGE_MIN_WORDS;
}

// Pull inline table markers out as standalone chunks
function extractTableChunks(page: ExtractedChunk): ChunkRecord[] {
  const text = cleanPageText(page.content);
  const matches = text.matchAll(/\[Table: .*?\]/gs);
  const chunks: ChunkRecord[] = [];
  let chunkIndex = 0;

  for (const match of matches) {
    const content = normalizeWhitespace(match[0]);
    if (!content) continue;

    const startChar = match.index ?? 0;
    const endChar = startChar + match[0].length;
    chunks.push({
      chunkId: buildChunkId(page.source, Number(page.pageIndex), chunkIndex, page.chunkType, content),
      chunkType: page.chunkType,
      source: page.source,
      pageIndex: Number(page.pageIndex),
      chunkIndex,
      content,
      metadata: {
        startChar,
        endChar,
        wordCount: wordCount(content),
        sentenceCount: 1,
      },
    });
    chunkIndex += 1;
  }

  return chunks;}

// Recover meaningful extracted text that semantic seed selection skipped entirely
// Done as legacy Python missed important text.
// Acts as a safety net incase semantic chunking fails
function extractCoverageFallbackChunks(
  page: ExtractedChunk,
  semanticChunks: ChunkRecord[],
): ChunkRecord[] {
  const coverageText = normalizeCoverageTokens(semanticChunks.map((chunk) => chunk.content).join(" "));
  // Normalize page text before splitting it into sentence-like spans.
  const normalized = normalizeWhitespace(page.content);
  const spans: SentenceSpan[] = [];
  let start = 0;

  // Split on sentence-ending punctuation so fallback stays fairly readable.
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1] ?? "";
    const isBoundary =
      (char === "." || char === "!" || char === "?") &&
      (nextChar === "" || /\s/.test(nextChar));

    if (!isBoundary) continue;

    const value = normalized.slice(start, index + 1).trim();
    if (value) {
      spans.push({
        text: value,
        start,
        end: index + 1,
      });
    }

    start = index + 1;
  }

  // Keep any trailing text that did not end with punctuation.
  const tail = normalized.slice(start).trim();
  if (tail) {
    spans.push({
      text: tail,
      start,
      end: normalized.length,
    });
  }

  const chunks: ChunkRecord[] = [];
  let chunkIndex = 0;
  let activeSpans: SentenceSpan[] = [];

  const flushSpans = () => {
    if (activeSpans.length === 0) return;

    const content = normalizeWhitespace(activeSpans.map((span) => span.text).join(" "));
    const sentenceCount = activeSpans.length;
    if (
      !shouldKeepCoverageFallback(content) ||
      sentenceCount < COVERAGE_MIN_SENTENCES
    ) {
      activeSpans = [];
      return;
    }

    chunks.push({
      chunkId: buildChunkId(page.source, Number(page.pageIndex), chunkIndex, page.chunkType, content),
      chunkType: page.chunkType,
      source: page.source,
      pageIndex: Number(page.pageIndex),
      chunkIndex,
      content,
      metadata: {
        startChar: activeSpans[0].start,
        endChar: activeSpans[activeSpans.length - 1].end,
        wordCount: wordCount(content),
        sentenceCount: activeSpans.length,
      },
    });
    chunkIndex += 1;
    activeSpans = [];
  };

  for (const span of spans) {
    const normalizedSpan = normalizeCoverageTokens(span.text);
    if (!normalizedSpan) continue;

    if (coverageText.includes(normalizedSpan)) {
      flushSpans();
      continue;
    }

    activeSpans.push(span);
  }

  flushSpans();
  return chunks;
}

// Reindex chunks after filtering so ordering stays deterministic.
function reindexChunks(chunks: ChunkRecord[]): ChunkRecord[] {
  return chunks.map((chunk, index) => {
    const content = normalizeWhitespace(chunk.content);

    return {
      ...chunk,
      chunkId: buildChunkId(chunk.source, chunk.pageIndex, index, chunk.chunkType, content),
      chunkIndex: index,
      content,
      metadata: {
        ...chunk.metadata,
        wordCount: wordCount(content),
      },
    };
  });}

// Final retrieval prep matching the legacy Python combine/dedupe/filter flow
export function postprocessChunks(
  pages: ExtractedChunk[],
  semanticChunks: ChunkRecord[],
  options: PostprocessOptions = {},
): ChunkRecord[] {
  const resolved = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const semanticByPage = new Map<number, ChunkRecord[]>();
  for (const chunk of semanticChunks) {
    const pageChunks = semanticByPage.get(chunk.pageIndex) ?? [];
    pageChunks.push(chunk);
    semanticByPage.set(chunk.pageIndex, pageChunks);
  }

  const finalChunks: ChunkRecord[] = [];

  for (const page of pages) {
    if (page.chunkType !== "TEXT") continue;
    const cleanedPage = {
      ...page,
      content: cleanPageText(page.content),
    };
    const textOnlyPage = {
      ...cleanedPage,
      content: stripInlineTables(cleanedPage.content),
    };

    const pageIndex = Number(cleanedPage.pageIndex);
    const pageSemanticChunks = semanticByPage.get(pageIndex) ?? [];
    const pageCoverageChunks = textOnlyPage.content
      ? extractCoverageFallbackChunks(textOnlyPage, pageSemanticChunks)
      : [];
    const pageTableChunks = extractTableChunks(cleanedPage);
    if (!textOnlyPage.content && pageTableChunks.length === 0) continue;
    const combinedChunks = [...pageSemanticChunks, ...pageCoverageChunks, ...pageTableChunks];
    const seenPageChunks = new Set<string>();
    const dedupedChunks: ChunkRecord[] = [];

    for (const chunk of combinedChunks) {
      const content = normalizeWhitespace(chunk.content);
      if (!content || seenPageChunks.has(content)) continue;
      seenPageChunks.add(content);
      dedupedChunks.push({
        ...chunk,
        content,
      });
    }

    const keptChunks = dedupedChunks.filter((chunk) =>
      keepChunk(chunk.content, resolved.filterChunks, resolved.minWords),
    );

    finalChunks.push(...reindexChunks(keptChunks));}

  return finalChunks;}