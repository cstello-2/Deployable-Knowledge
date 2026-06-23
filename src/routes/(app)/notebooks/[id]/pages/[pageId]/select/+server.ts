import { json, type RequestHandler } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebooks, notebook_pages } from "$lib/server/database/schema";
import { loadNotebookState, setActiveNotebook } from "$notebooks/utils";

export const POST: RequestHandler = async ({ params }) => {
  const notebookId = params.id;
  const pageId = params.pageId;
  if (!notebookId || !pageId) return json({ error: "Missing id" }, { status: 400 });

  const [page] = await db
    .select()
    .from(notebook_pages)
    .where(eq(notebook_pages.id, pageId))
    .limit(1);

  if (!page || page.notebookId !== notebookId) {
    return json({ error: "Page not found" }, { status: 404 });
  }

  await db
    .update(notebooks)
    .set({ activePageId: pageId, updatedAt: new Date().toISOString() })
    .where(eq(notebooks.id, notebookId));
  await setActiveNotebook(notebookId);

  return json(await loadNotebookState());
};
