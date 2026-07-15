import { json, type RequestHandler } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NotebookTitleRequest } from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import { notebooks, notebook_pages, type NewNotebook, type NewNotebookPage } from "$lib/server/database/schema";
import { loadNotebookState, setActiveNotebook } from "$routes/(app)/notebooks/utils";

const USER_ID = "default";

export const GET: RequestHandler = async () => {
  return json(await loadNotebookState());
};

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as NotebookTitleRequest;
  const title = body.title.trim();
  if (!title) {
    return json({ error: "Notebook title is required" }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const notebookId = randomUUID();
  const pageId = randomUUID();

  const notebook: NewNotebook = {
    id: notebookId,
    userId: USER_ID,
    title,
    activePageId: pageId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const page: NewNotebookPage = {
    id: pageId,
    notebookId,
    title: "Page 1",
    content: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.insert(notebooks).values(notebook);
  await db.insert(notebook_pages).values(page);
  await setActiveNotebook(notebookId);

  return json(await loadNotebookState(), { status: 201 });
};
