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

const CITATION_TABLE_PREFIX = [
  "## Citations",
  "",
  "| Source | Page | Type |",
  "| --- | ---: | --- |",
].join("\n");

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

export function insertNotebookSourceCitation(
  text: string,
  source: NotebookCitationSource,
  selectionStart = text.length,
  selectionEnd = selectionStart,
): CitationInsertion {
  const table = extractCitationTable(text);
  const start = mapPositionOutsideTable(
    selectionStart,
    table,
  );
  const end = mapPositionOutsideTable(
    selectionEnd,
    table,
  );
  const insertion = insertNotebookCitation(
    table.body,
    formatNotebookCitation(source),
    start,
    Math.max(start, end),
  );
  const row = formatCitationTableRow(source);
  const rows = table.rows.includes(row) ? table.rows : [...table.rows, row];
  const citationTable = [CITATION_TABLE_PREFIX, ...rows].join("\n");

  return {
    text: insertion.text.trimEnd()
      ? `${insertion.text.trimEnd()}\n\n${citationTable}`
      : citationTable,
    cursor: insertion.cursor,
  };
}

type ExtractedCitationTable = {
  body: string;
  rows: string[];
  start: number | null;
  end: number | null;
};

function extractCitationTable(text: string): ExtractedCitationTable {
  const start = text.lastIndexOf(CITATION_TABLE_PREFIX);
  if (start < 0) {
    return {
      body: text,
      rows: [],
      start: null,
      end: null,
    };
  }

  let end = start + CITATION_TABLE_PREFIX.length;
  const rows: string[] = [];

  while (end < text.length) {
    const row = text.slice(end).match(/^\n(\|[^\n]*\|)[ \t]*/);
    if (!row) break;
    rows.push(row[1]);
    end += row[0].length;
  }

  return {
    body: `${text.slice(0, start)}${text.slice(end)}`.trimEnd(),
    rows,
    start,
    end,
  };
}

function mapPositionOutsideTable(
  position: number,
  table: ExtractedCitationTable,
): number {
  if (table.start === null || table.end === null) {
    return clamp(position, 0, table.body.length);
  }

  if (position < table.start) {
    return clamp(position, 0, table.body.length);
  }
  if (position >= table.end) {
    return clamp(
      position - (table.end - table.start),
      0,
      table.body.length,
    );
  }
  return table.body.length;
}

function formatCitationTableRow(source: NotebookCitationSource): string {
  const title = escapeMarkdownTableCell(
    source.documentTitle.trim() || "Source",
  );
  const page = Math.max(1, Math.floor(source.pageIndex) + 1);
  const sourceCell = source.sourceType === "PDF"
    ? `[${title}](${documentPdfPageUrl(source.documentId, source.pageIndex)})`
    : title;

  return `| ${sourceCell} | ${page} | ${
    source.sourceType === "PDF" ? "PDF" : "Notebook"
  } |`;
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}

function escapeMarkdownTableCell(value: string): string {
  return escapeMarkdownLabel(normalizeSingleLine(value)).replace(
    /\|/g,
    "\\|",
  );
}

function normalizeSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
