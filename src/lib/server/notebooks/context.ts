import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  notebook_pages,
  notebooks,
} from "$lib/server/database/schema";

const NOTEBOOK_USER_ID = "default";

export type NotebookContextRow = {
  notebookId: string;
  notebookTitle: string;
  pageId: string;
  pageTitle: string;
  pageContent: string;
};

export type ResolvedNotebookContextPage = {
  notebookId: string;
  notebookTitle: string;
  pageId: string;
  pageTitle: string;
};

export type ResolvedNotebookContext = {
  context: string;
  notebookIds: string[];
  pageIds: string[];
  pages: ResolvedNotebookContextPage[];
};

function normalizeIds(ids: readonly unknown[] | undefined): string[] {
  return [...new Set(
    (ids ?? [])
      .map((value) => String(value).trim())
      .filter(Boolean),
  )];
}

export function resolveNotebookContextRows(
  rows: readonly NotebookContextRow[],
  notebookIds: readonly unknown[] | undefined,
  pageIds: readonly unknown[] | undefined,
  legacyNotebookId: string | null = null,
): ResolvedNotebookContext {
  const requestedNotebookIds = new Set(normalizeIds([
    ...(notebookIds ?? []),
    ...(legacyNotebookId ? [legacyNotebookId] : []),
  ]));
  const requestedPageIds = new Set(normalizeIds(pageIds));
  const availableNotebookIds = new Set(rows.map((row) => row.notebookId));
  const selectedNotebookIds = [...requestedNotebookIds].filter((id) =>
    availableNotebookIds.has(id)
  );
  const selectedNotebookIdSet = new Set(selectedNotebookIds);
  const selectedRows = rows.filter((row) =>
    selectedNotebookIdSet.has(row.notebookId) ||
    requestedPageIds.has(row.pageId)
  );
  const selectedPageIds = selectedRows
    .filter((row) => !selectedNotebookIdSet.has(row.notebookId))
    .map((row) => row.pageId);
  const pages = selectedRows.map((row) => ({
    notebookId: row.notebookId,
    notebookTitle: row.notebookTitle,
    pageId: row.pageId,
    pageTitle: row.pageTitle,
  }));
  const context = selectedRows
    .filter((row) => row.pageContent.trim())
    .map((row) =>
      `[Notebook: ${row.notebookTitle} | Page: ${row.pageTitle}]\n${row.pageContent.trim()}`
    )
    .join("\n\n");

  return {
    context,
    notebookIds: selectedNotebookIds,
    pageIds: [...new Set(selectedPageIds)],
    pages,
  };
}

export async function resolveNotebookContext(
  notebookIds: readonly unknown[] | undefined,
  pageIds: readonly unknown[] | undefined,
  legacyNotebookId: string | null,
): Promise<ResolvedNotebookContext> {
  const rows = await db
    .select({
      notebookId: notebooks.id,
      notebookTitle: notebooks.title,
      pageId: notebook_pages.id,
      pageTitle: notebook_pages.title,
      pageContent: notebook_pages.content,
    })
    .from(notebook_pages)
    .innerJoin(notebooks, eq(notebooks.id, notebook_pages.notebookId))
    .where(eq(notebooks.userId, NOTEBOOK_USER_ID))
    .orderBy(asc(notebooks.createdAt), asc(notebook_pages.createdAt));

  return resolveNotebookContextRows(
    rows,
    notebookIds,
    pageIds,
    legacyNotebookId,
  );
}
