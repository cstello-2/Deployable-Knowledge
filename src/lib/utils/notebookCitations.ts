import { documentPdfPageUrl } from "$lib/utils/documentReferences";

export type NotebookCitationSource = {
  documentId: string;
  documentTitle: string;
  pageIndex: number;
  sourceType: "PDF" | "NOTEBOOK";
};

export type CitationInsertion = {
  text: string;
  cursor: number;
};

export function formatNotebookCitation(
  source: NotebookCitationSource,
): string {
  const title = escapeMarkdownLabel(source.documentTitle.trim() || "Source");
  const page = source.pageIndex + 1;
  const label = `${title}, p. ${page}`;

  if (source.sourceType === "PDF") {
    const href = documentPdfPageUrl(source.documentId, source.pageIndex);
    return `([${label}](${href}))`;
  }

  return `(${label})`;
}

export function insertNotebookCitation(
  text: string,
  citation: string,
  selectionStart = text.length,
  selectionEnd = selectionStart,
): CitationInsertion {
  const start = clamp(selectionStart, 0, text.length);
  const end = clamp(selectionEnd, start, text.length);
  const before = text.slice(0, start);
  const after = text.slice(end);
  const leadingSpace =
    before && !/[\s([{]$/.test(before) ? " " : "";
  const trailingSpace =
    after && !/^[\s.,;:!?)}\]]/.test(after) ? " " : "";
  const insertion = `${leadingSpace}${citation}${trailingSpace}`;

  return {
    text: `${before}${insertion}${after}`,
    cursor: before.length + insertion.length,
  };
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
