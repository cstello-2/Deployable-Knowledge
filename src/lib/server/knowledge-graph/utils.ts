// Shared normalization helpers keep graph IDs and query matching consistent.

const QUERY_STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "by", "does", "for",
  "from", "how", "in", "is", "it", "of", "on", "or", "the", "this", "to",
  "was", "what", "when", "where", "which", "who", "why", "with",
]);

const MONTH_LABELS = new Set([
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
]);

const RELATIONAL_LABEL_TERMS = new Set([
  "authorized", "authorizes", "authorize", "authorization",
  "prohibited", "prohibits", "prohibit",
  "required", "requires", "require",
  "permitted", "permits", "permit",
  "assigned", "applies", "apply",
  "wear", "wears", "wearing", "worn",
  "must", "shall", "should", "may", "will",
]);

const NOISY_LABEL_PRONOUNS = new Set([
  "i", "me", "my", "mine", "you", "your", "yours", "we", "our", "ours",
  "they", "them", "their", "theirs", "he", "him", "his", "she", "her", "hers",
]);

const NOISY_LABEL_STARTERS = new Set([
  "as", "because", "before", "during", "for", "from", "if", "of", "since",
  "that", "the", "these", "this", "those", "though", "unless", "when", "while",
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

export function isNoisyEntityLabel(input: string, entityKind?: string | null): boolean {
  const label = sanitizeEntityLabel(input);
  if (!label) return true;

  const words = tokenize(label);
  if (!words.length) return true;
  if (NOISY_LABEL_STARTERS.has(words[0])) return true;
  if (words.some((word) => NOISY_LABEL_PRONOUNS.has(word))) return true;
  if (hasSingularPluralDuplicate(words)) return true;
  const kind = entityKind?.toLowerCase() ?? "";
  if (
    words.length === 1 &&
    MONTH_LABELS.has(words[0]) &&
    !["protocol", "condition", "treatment", "concept"].includes(kind)
  ) return true;

  const relationWords = words.filter((word) => RELATIONAL_LABEL_TERMS.has(word)).length;
  if (relationWords >= 2) return true;
  if (relationWords === 1 && words.length <= 3) return true;

  const numericWords = words.filter((word) => /\d/.test(word)).length;
  const alphabeticWords = words.filter((word) => /[a-z]/.test(word)).length;
  if (words.length > 1 && numericWords > alphabeticWords) return true;

  return false;
}

function hasSingularPluralDuplicate(words: string[]): boolean {
  if (words.length !== 2) return false;
  const [left, right] = words;
  return singularize(left) === singularize(right);
}

function singularize(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && word.length > 3) return word.slice(0, -1);
  return word;
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
