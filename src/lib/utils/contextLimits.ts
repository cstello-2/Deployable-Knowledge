export const RAG_CHUNK_CHARACTER_LIMIT = 1_200;
export const NOTEBOOK_TEXT_CHARACTER_LIMIT = 60_000;
export const NOTEBOOK_TEXT_WARNING_CHARACTER_COUNT = Math.floor(
  NOTEBOOK_TEXT_CHARACTER_LIMIT * 0.8,
);
export const NOTEBOOK_SOURCE_CONTEXT_CHARACTER_LIMIT = 20_000;

export function countNotebookText(
  pages: ReadonlyArray<{ content: string }>,
): number {
  return pages.reduce((total, page) => total + page.content.length, 0);
}
