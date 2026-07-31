import { normalizeWhitespace } from "./parse-shared";

const MIN_OCR_CONFIDENCE = 60;
const MIN_IMAGE_WORDS = 5;
const MIN_IMAGE_LETTERS = 24;
const RICH_PAGE_WORDS = 20;
const RICH_PAGE_MIN_IMAGE_WORDS = 8;
const RICH_PAGE_MIN_IMAGE_LETTERS = 45;

type OcrTextOptions = {
  confidence: number;
  nativeText?: string;
};

function wordTokens(text: string): string[] {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) ?? [];
}

function letterCount(text: string): number {
  return text.match(/\p{L}/gu)?.length ?? 0;
}

function normalizedComparisonText(text: string): string {
  return wordTokens(text).map((token) => token.toLocaleLowerCase()).join(" ");
}

function duplicatesNativeText(ocrText: string, nativeText: string): boolean {
  const ocrTokens = wordTokens(ocrText).map((token) =>
    token.toLocaleLowerCase()
  );
  const nativeTokens = new Set(
    wordTokens(nativeText).map((token) => token.toLocaleLowerCase()),
  );
  const ocrComparison = normalizedComparisonText(ocrText);
  const nativeComparison = normalizedComparisonText(nativeText);

  if (
    ocrComparison.length >= 24 &&
    nativeComparison.includes(ocrComparison)
  ) {
    return true;
  }

  if (ocrTokens.length < MIN_IMAGE_WORDS) return false;
  const overlap = ocrTokens.filter((token) => nativeTokens.has(token)).length;
  return overlap / ocrTokens.length >= 0.85;
}

export function isUsefulImageText(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  const tokens = wordTokens(normalized);
  const letters = letterCount(normalized);
  const visibleCharacters = normalized.replace(/\s/g, "");
  const alphaNumericCharacters =
    visibleCharacters.match(/[\p{L}\p{N}]/gu)?.length ?? 0;

  if (
    tokens.length < MIN_IMAGE_WORDS ||
    letters < MIN_IMAGE_LETTERS ||
    visibleCharacters.length === 0
  ) {
    return false;
  }

  if (alphaNumericCharacters / visibleCharacters.length < 0.65) {
    return false;
  }

  const uniqueTokens = new Set(
    tokens.map((token) => token.toLocaleLowerCase()),
  );
  return uniqueTokens.size / tokens.length >= 0.45;
}

export function cleanOcrText(
  text: string,
  { confidence, nativeText = "" }: OcrTextOptions,
): string | null {
  const normalized = normalizeWhitespace(text);
  if (
    !normalized ||
    !Number.isFinite(confidence) ||
    confidence < MIN_OCR_CONFIDENCE ||
    !isUsefulImageText(normalized)
  ) {
    return null;
  }

  const nativeTokens = wordTokens(nativeText);
  if (nativeTokens.length >= RICH_PAGE_WORDS) {
    const imageTokens = wordTokens(normalized);
    if (
      imageTokens.length < RICH_PAGE_MIN_IMAGE_WORDS ||
      letterCount(normalized) < RICH_PAGE_MIN_IMAGE_LETTERS
    ) {
      return null;
    }
  }

  if (nativeText && duplicatesNativeText(normalized, nativeText)) {
    return null;
  }

  return normalized;
}
