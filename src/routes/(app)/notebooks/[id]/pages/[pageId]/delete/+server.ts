import { json, type RequestHandler } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebooks, notebook_pages, type NewNotebookPage, type NotebookPage } from "$lib/server/database/schema";
import { loadNotebookState, setActiveNotebook } from "$routes/(app)/notebooks/utils";

export const DELETE: RequestHandler = async ({ params }) => {
  const notebookId = params.id;
  const pageId = params.pageId;
  if (!notebookId || !pageId) return json({ error: "Missing id" }, { status: 400 });
  const timestamp = new Date().toISOString();

  await db.delete(notebook_pages).where(eq(notebook_pages.id, pageId));

  const remainingPages: NotebookPage[] = await db
    .select()
    .from(notebook_pages)
    .where(eq(notebook_pages.notebookId, notebookId))
    .orderBy(asc(notebook_pages.createdAt));

  if (remainingPages.length === 0) {
    const newPageId = randomUUID();
    const page: NewNotebookPage = {
      id: newPageId,
      notebookId,
      title: "Page 1",
      content: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.insert(notebook_pages).values(page);
    await db
      .update(notebooks)
      .set({ activePageId: newPageId, updatedAt: timestamp })
      .where(eq(notebooks.id, notebookId));
  } else {
    await db
      .update(notebooks)
      .set({ activePageId: remainingPages[0].id, updatedAt: timestamp })
      .where(eq(notebooks.id, notebookId));
  }

  await setActiveNotebook(notebookId);
  return json(await loadNotebookState());
};
