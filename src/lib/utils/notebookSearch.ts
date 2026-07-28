import type { NotebookWithPages } from "$lib/server/database/schema";

export type NotebookSearchResult = {
  notebookId: string;
  notebookTitle: string;
  pageId: string;
  pageTitle: string;
  snippet: string;
  matchCount: number;
  score: number;
};

export function searchNotebookPages(
  notebooks: readonly NotebookWithPages[],
  query: string,
  limit = 100,
): NotebookSearchResult[] {
  const terms = [
    ...new Set(
      query
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    ),
  ];
  if (terms.length === 0) return [];

  const results: NotebookSearchResult[] = [];

  for (const notebook of notebooks) {
    const notebookTitle = notebook.title.toLocaleLowerCase();

    for (const page of notebook.pages) {
      const pageTitle = page.title.toLocaleLowerCase();
      const content = page.content.toLocaleLowerCase();
      const searchable = `${notebookTitle}\n${pageTitle}\n${content}`;
      if (!terms.every((term) => searchable.includes(term))) continue;

      const titleMatches = terms.reduce(
        (total, term) =>
          total +
          (pageTitle.includes(term) ? 5 : 0) +
          (notebookTitle.includes(term) ? 3 : 0),
        0,
      );
      const contentMatches = terms.reduce(
        (total, term) => total + countOccurrences(content, term),
        0,
      );

      results.push({
        notebookId: notebook.id,
        notebookTitle: notebook.title,
        pageId: page.id,
        pageTitle: page.title,
        snippet: createNotebookSearchSnippet(page.content, terms),
        matchCount: Math.max(1, contentMatches),
        score: titleMatches + Math.min(contentMatches, 20),
      });
    }
  }

  return results
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.notebookTitle.localeCompare(right.notebookTitle) ||
        left.pageTitle.localeCompare(right.pageTitle),
    )
    .slice(0, Math.max(0, limit));
}

export function createNotebookSearchSnippet(
  content: string,
  terms: readonly string[],
  maxLength = 180,
): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) return "Empty page";

  const lower = compact.toLocaleLowerCase();
  const indexes = terms
    .map((term) => lower.indexOf(term.toLocaleLowerCase()))
    .filter((index) => index >= 0);
  const matchIndex = indexes.length ? Math.min(...indexes) : 0;
  const start = Math.max(0, matchIndex - Math.floor(maxLength / 3));
  const end = Math.min(compact.length, start + maxLength);
  const snippet = compact.slice(start, end).trim();

  return `${start > 0 ? "..." : ""}${snippet}${
    end < compact.length ? "..." : ""
  }`;
}

function countOccurrences(text: string, term: string): number {
  let count = 0;
  let cursor = 0;

  while (cursor < text.length) {
    const index = text.indexOf(term, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + Math.max(1, term.length);
  }

  return count;
}
