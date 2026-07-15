import { json, type RequestHandler } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NotebookPageTitleRequest } from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import { notebooks, notebook_pages, type NewNotebookPage } from "$lib/server/database/schema";
import { loadNotebookState, setActiveNotebook } from "$routes/(app)/notebooks/utils";

export const POST: RequestHandler = async ({ params, request }) => {
  const notebookId = params.id;
  if (!notebookId) return json({ error: "Missing notebook id" }, { status: 400 });
  const body = (await request.json()) as NotebookPageTitleRequest;
  const title = body.title.trim();
  if (!title) {
    return json({ error: "Page title is required" }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const pageId = randomUUID();

  const page: NewNotebookPage = {
    id: pageId,
    notebookId,
    title,
    content: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.insert(notebook_pages).values(page);
  await db
    .update(notebooks)
    .set({ activePageId: pageId, updatedAt: timestamp })
    .where(eq(notebooks.id, notebookId));
  await setActiveNotebook(notebookId);

  return json(await loadNotebookState(), { status: 201 });
};
