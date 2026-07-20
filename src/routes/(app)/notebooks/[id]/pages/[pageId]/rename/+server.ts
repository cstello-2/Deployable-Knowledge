import { json, type RequestHandler } from "@sveltejs/kit";
import { and, eq, ne } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebook_pages } from "$lib/server/database/schema";
import { loadNotebookState } from "$routes/(app)/notebooks/utils";

export const PATCH: RequestHandler = async ({ params, request }) => {
  const notebookId = params.id;
  const pageId = params.pageId;
  if (!notebookId || !pageId) return json({ message: "Missing notebook or page id." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim();
  if (!title) return json({ message: "Page name cannot be empty." }, { status: 400 });

  const [page] = await db.select({ id: notebook_pages.id })
    .from(notebook_pages)
    .where(and(eq(notebook_pages.id, pageId), eq(notebook_pages.notebookId, notebookId)))
    .limit(1);
  if (!page) return json({ message: "Page not found in this notebook." }, { status: 404 });

  const siblings = await db.select({ title: notebook_pages.title })
    .from(notebook_pages)
    .where(and(eq(notebook_pages.notebookId, notebookId), ne(notebook_pages.id, pageId)));
  if (siblings.some((item) => item.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase())) {
    return json({ message: `A page named “${title}” already exists in this notebook.` }, { status: 409 });
  }

  await db
    .update(notebook_pages)
    .set({ title, updatedAt: new Date().toISOString() })
    .where(and(eq(notebook_pages.id, pageId), eq(notebook_pages.notebookId, notebookId)));

  return json(await loadNotebookState());
};
