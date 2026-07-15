// Shared normalization helpers keep graph IDs and query matching consistent.

const QUERY_STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "by", "does", "for",
  "from", "how", "in", "is", "it", "of", "on", "or", "the", "this", "to",
  "was", "what", "when", "where", "which", "who", "why", "with",
]);

export function normalizeLabel(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function sanitizeEntityLabel(input: string): string {
  const normalized = normalizeLabel(input);
  if (!normalized) return "";

  const lower = normalized.toLowerCase();
  if (/^(?:\d+|0+)$/.test(normalized)) return "";
  if (/^(?:sample|chunk|document|page|section|chapter)(?:[\s\-_]?\d+)?$/i.test(normalized)) return "";
  if (/^(?:\d+|0+)[\s\-_]?(?:sample|chunk|document|page|section|chapter)$/i.test(normalized)) return "";
  if (/(?:^|[\s\-_])(sample|chunk|document|page|section|chapter)(?:[\s\-_]?\d+)?$/i.test(normalized)) return "";

  const cleaned = normalized
    .replace(/(?:^|[\s\-_])(sample|chunk|document|page|section|chapter)(?:[\s\-_]?\d+)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  if (/^(?:\d+|0+)$/.test(cleaned)) return "";

  return cleaned;
}

export function graphId(kind: string, label: string): string {
  return `${kind}:${normalizeLabel(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export function queryTerms(text: string): string[] {
  return unique(tokenize(text).filter((term) => term.length > 1 && !QUERY_STOP_WORDS.has(term)));
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
