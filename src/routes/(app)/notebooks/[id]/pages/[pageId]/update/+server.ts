import { json, type RequestHandler } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { NotebookPageContentRequest } from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import { notebook_pages } from "$lib/server/database/schema";
import {
  countNotebookText,
  NOTEBOOK_TEXT_CHARACTER_LIMIT,
} from "$lib/utils/contextLimits";
import { loadNotebookState } from "$routes/(app)/notebooks/utils";

export const PATCH: RequestHandler = async ({ params, request }) => {
  const notebookId = params.id;
  const pageId = params.pageId;
  if (!notebookId || !pageId) {
    return json({ error: "Missing notebook or page id" }, { status: 400 });
  }

  const body = (await request.json()) as NotebookPageContentRequest;
  const content = body.content;
  const pages = await db
    .select({ id: notebook_pages.id, content: notebook_pages.content })
    .from(notebook_pages)
    .where(eq(notebook_pages.notebookId, notebookId));
  const pageExists = pages.some((page) => page.id === pageId);

  if (!pageExists) {
    return json({ error: "Notebook page not found" }, { status: 404 });
  }

  const characterCount = countNotebookText(
    pages.map((page) => (page.id === pageId ? { content } : page)),
  );

  if (characterCount > NOTEBOOK_TEXT_CHARACTER_LIMIT) {
    return json(
      {
        error: "Notebook text limit exceeded",
        characterCount,
        limit: NOTEBOOK_TEXT_CHARACTER_LIMIT,
      },
      { status: 413 },
    );
  }

  await db
    .update(notebook_pages)
    .set({ content, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(notebook_pages.id, pageId),
        eq(notebook_pages.notebookId, notebookId),
      ),
    );

  return json(await loadNotebookState());
};
